from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Dict, Iterable, List, Tuple

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.agent import Agent
from models.clawback import Clawback, ClawbackItem
from models.commission_ledger import CommissionLedger
from models.policy import Policy
from models.sale import Sale
from models.volume_bonus_accrual import VolumeBonusAccrual
from services.tier_rules import tier_rate


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _policy_rule_factor(first_sale_date: date, cancellation_date: date) -> float:
    """Grace-period based clawback factor."""
    delta = (cancellation_date - first_sale_date).days
    if delta <= 90:
        return 0.50
    if delta <= 180:
        return 0.25
    return 0.10


def _month_start(day: date) -> date:
    return day.replace(day=1)


def _month_end(day: date) -> date:
    next_month = (day.replace(day=28) + timedelta(days=4)).replace(day=1)
    return next_month - timedelta(days=1)


def _quarter_bounds(day: date) -> Tuple[date, date]:
    quarter = (day.month - 1) // 3
    start = date(day.year, quarter * 3 + 1, 1)
    end = _month_end(date(day.year, quarter * 3 + 3, 1))
    return start, end


def _year_bounds(day: date) -> Tuple[date, date]:
    return date(day.year, 1, 1), date(day.year, 12, 31)


def _period_bounds(period_type: str, sale_date: date) -> Tuple[date, date]:
    if period_type == "monthly":
        return _month_start(sale_date), _month_end(sale_date)
    if period_type == "quarterly":
        return _quarter_bounds(sale_date)
    if period_type == "annual":
        return _year_bounds(sale_date)
    raise ValueError(f"Unsupported period_type: {period_type}")


def _parse_chain(db: Session, sale: Sale) -> List[Dict[str, int]]:
    if sale.hierarchy_snapshot:
        try:
            data = json.loads(sale.hierarchy_snapshot)
            if isinstance(data, list):
                return [d for d in data if isinstance(d, dict) and "id" in d and "level" in d]
        except json.JSONDecodeError:
            pass

    # Fallback for legacy records
    chain: List[Dict[str, int]] = []
    current = db.get(Agent, sale.seller_id)
    while current:
        chain.append({"id": current.id, "level": current.level, "name": current.name})
        if not current.parent_id:
            break
        current = db.get(Agent, current.parent_id)
    return chain


def _collect_volume_adjustments(
    db: Session,
    sales: Iterable[Sale],
    factor: float,
) -> Dict[Tuple[int, str, date], Dict[str, float]]:
    adjustments: Dict[Tuple[int, str, date], Dict[str, float]] = {}
    for sale in sales:
        chain = _parse_chain(db, sale)
        if not chain:
            continue
        volume_loss = float(sale.premium or 0.0) * factor
        for info in chain:
            agent_id = info["id"]
            level = info.get("level", 1)
            for period_type in ("monthly", "quarterly", "annual"):
                period_start, period_end = _period_bounds(period_type, sale.sale_date)
                key = (agent_id, period_type, period_start)
                entry = adjustments.setdefault(
                    key,
                    {
                        "period_end": period_end,
                        "level": level,
                        "volume_delta": 0.0,
                    },
                )
                entry["volume_delta"] += volume_loss
    return adjustments


# ---------------------------------------------------------------------------
# Preview builder
# ---------------------------------------------------------------------------

def build_clawback_preview(db: Session, policy_number: str, cancellation_date: date):
    policy: Policy | None = db.scalar(select(Policy).where(Policy.policy_number == policy_number))
    if not policy:
        return {"exists": False, "message": "Policy not found."}

    sales: List[Sale] = db.execute(select(Sale).where(Sale.policy_id == policy.id)).scalars().all()
    if not sales:
        return {"exists": False, "message": "No sales recorded for this policy."}

    first_sale_date = min(s.sale_date for s in sales if s.sale_date)
    if not first_sale_date:
        return {"exists": False, "message": "Policy sales missing sale_date."}

    factor = _policy_rule_factor(first_sale_date, cancellation_date)

    items: List[Dict[str, float | int | str]] = []
    total_original = 0.0
    total_clawback = 0.0

    # Direct FYC + Overrides
    direct_rows = db.execute(
        select(CommissionLedger.agent_id, CommissionLedger.entry_type, func.sum(CommissionLedger.amount))
        .where(
            CommissionLedger.policy_id == policy.id,
            CommissionLedger.entry_type.in_(("FYC", "OVERRIDE")),
        )
        .group_by(CommissionLedger.agent_id, CommissionLedger.entry_type)
    ).all()
    for agent_id, entry_type, amt in direct_rows:
        original = float(amt or 0.0)
        clawback_amount = round(original * factor, 2)
        if clawback_amount <= 0:
            continue
        total_original += original
        total_clawback += clawback_amount
        items.append(
            {
                "agent_id": agent_id,
                "entry_type": entry_type,
                "original_amount": original,
                "clawback_amount": clawback_amount,
                "meta": None,
            }
        )

    # Volume bonuses – recompute expected bonus after removing the policy volume
    adjustments = _collect_volume_adjustments(db, sales, factor)
    for (agent_id, period_type, period_start), info in adjustments.items():
        accrual = db.execute(
            select(VolumeBonusAccrual).where(
                VolumeBonusAccrual.agent_id == agent_id,
                VolumeBonusAccrual.period_type == period_type,
                VolumeBonusAccrual.period_start == period_start,
            )
        ).scalar_one_or_none()
        if not accrual:
            continue

        current_volume = float(accrual.total_volume or 0.0)
        volume_delta = min(info["volume_delta"], current_volume)
        new_volume = max(0.0, current_volume - volume_delta)
        old_bonus = float(accrual.bonus_paid or 0.0)
        new_rate = tier_rate(info["level"], new_volume)
        expected_bonus = round(new_volume * new_rate, 2)
        clawback_amount = round(old_bonus - expected_bonus, 2)
        if clawback_amount <= 0:
            continue

        total_original += old_bonus
        total_clawback += clawback_amount
        items.append(
            {
                "agent_id": agent_id,
                "entry_type": "VOLUME_BONUS",
                "original_amount": old_bonus,
                "clawback_amount": clawback_amount,
                "meta": json.dumps(
                    {
                        "period_type": period_type,
                        "period_start": period_start.isoformat(),
                        "period_end": info["period_end"].isoformat(),
                        "volume_delta": volume_delta,
                        "level": info["level"],
                    }
                ),
            }
        )

    if not items:
        return {
            "exists": True,
            "policy": {"id": policy.id, "number": policy.policy_number, "fyc_rate": policy.fyc_rate},
            "first_sale_date": first_sale_date.isoformat(),
            "rule_factor": factor,
            "totals": {"original": 0.0, "clawback": 0.0},
            "items": [],
            "message": "No recoverable commissions identified for this policy.",
        }

    return {
        "exists": True,
        "policy": {"id": policy.id, "number": policy.policy_number, "fyc_rate": policy.fyc_rate},
        "first_sale_date": first_sale_date.isoformat(),
        "rule_factor": factor,
        "totals": {"original": round(total_original, 2), "clawback": round(total_clawback, 2)},
        "items": items,
    }


# ---------------------------------------------------------------------------
# Persistence helpers
# ---------------------------------------------------------------------------

def create_clawback(
    db: Session,
    *,
    policy_id: int,
    cancellation_date: date,
    reason: str | None,
    notes: str | None,
    preview: dict,
):
    cb = Clawback(
        policy_id=policy_id,
        cancellation_date=cancellation_date,
        reason=reason or None,
        notes=notes or None,
        status="PENDING",
    )
    db.add(cb)
    db.flush()
    for item in preview.get("items", []):
        db.add(
            ClawbackItem(
                clawback_id=cb.id,
                agent_id=item["agent_id"],
                entry_type=item["entry_type"],
                original_amount=item["original_amount"],
                clawback_amount=item["clawback_amount"],
                meta=item.get("meta"),
            )
        )
    db.commit()
    return cb


def approve_clawback(db: Session, cb_id: int, approve: bool):
    cb: Clawback | None = db.get(Clawback, cb_id)
    if not cb:
        return None
    if cb.status not in ("PENDING", "PROCESSING"):
        return cb

    if approve:
        for item in cb.items:
            amount = -abs(float(item.clawback_amount or 0.0))
            db.add(
                CommissionLedger(
                    agent_id=item.agent_id,
                    sale_id=None,
                    policy_id=cb.policy_id,
                    entry_type="CLAWBACK",
                    amount=amount,
                    date=cb.cancellation_date,
                    meta=json.dumps({"clawback_id": cb.id, "entry_type": item.entry_type}),
                )
            )

            if item.entry_type == "VOLUME_BONUS" and item.meta:
                meta = json.loads(item.meta)
                period_type = meta.get("period_type")
                period_start = meta.get("period_start")
                volume_delta = float(meta.get("volume_delta", 0.0))
                level = int(meta.get("level", 1))
                if period_type and period_start:
                    accrual = db.execute(
                        select(VolumeBonusAccrual).where(
                            VolumeBonusAccrual.agent_id == item.agent_id,
                            VolumeBonusAccrual.period_type == period_type,
                            VolumeBonusAccrual.period_start == date.fromisoformat(period_start),
                        )
                    ).scalar_one_or_none()
                    if accrual:
                        accrual.total_volume = max(0.0, float(accrual.total_volume or 0.0) - volume_delta)
                        accrual.bonus_paid = float(accrual.bonus_paid or 0.0) + amount
                        accrual.bonus_rate = tier_rate(level, accrual.total_volume)
    else:
        cb.status = "DENIED"
        db.commit()
        return cb

    cb.status = "APPROVED"
    db.commit()
    return cb


def mark_clawback_processing(db: Session, cb_id: int):
    cb: Clawback | None = db.get(Clawback, cb_id)
    if not cb:
        return None
    if cb.status in ("APPROVED", "DENIED"):
        return cb
    if cb.status == "PROCESSING":
        return cb
    if cb.status != "PENDING":
        return cb

    cb.status = "PROCESSING"
    db.commit()
    return cb
