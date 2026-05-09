from __future__ import annotations

import json
from datetime import date, timedelta
from typing import Any, Dict, List

from sqlalchemy import select
from sqlalchemy.orm import Session

from models.agent import Agent
from models.sale import Sale
from models.policy import Policy
from models.commission_ledger import CommissionLedger
from models.volume_bonus_accrual import VolumeBonusAccrual
from services.tier_rules import tier_rate

# Override percentages remain simple but can be adjusted per business rules.
OVERRIDE_BY_LEVEL = {
    2: 0.02,   # Team Lead
    3: 0.015,  # Manager
    4: 0.01,   # Director
}


# ---------------------------------------------------------------------------
# Period helpers
# ---------------------------------------------------------------------------

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


def _period_bounds(period_type: str, day: date) -> Tuple[date, date]:
    if period_type == "monthly":
        return _month_start(day), _month_end(day)
    if period_type == "quarterly":
        return _quarter_bounds(day)
    if period_type == "annual":
        return _year_bounds(day)
    raise ValueError(f"Unsupported period type: {period_type}")


# ---------------------------------------------------------------------------
# Hierarchy helpers
# ---------------------------------------------------------------------------

def _build_hierarchy_chain(db: Session, seller: Agent) -> List[Dict[str, Any]]:
    chain: List[Dict[str, Any]] = []
    current = seller
    while current:
        chain.append(
            {
                "id": current.id,
                "name": current.name,
                "level": current.level,
                "external_id": current.external_id,
            }
        )
        if not current.parent_id:
            break
        current = db.get(Agent, current.parent_id)
    return chain


# ---------------------------------------------------------------------------
# Commission + bonus writers
# ---------------------------------------------------------------------------

def pay_commissions(db: Session, sale: Sale, fyc_amount: float, chain: List[Dict[str, Any]], policy_number: str):
    """
    Create CommissionLedger rows for seller FYC and each override in the hierarchy.
    """
    if not chain:
        return

    seller_info = chain[0]
    sale_date = sale.sale_date or date.today()

    db.add(
        CommissionLedger(
            agent_id=seller_info["id"],
            sale_id=sale.id,
            policy_id=sale.policy_id,
            entry_type="FYC",
            amount=float(fyc_amount),
            date=sale_date,
            meta=json.dumps({"policy_number": policy_number}),
        )
    )

    for parent_info in chain[1:]:
        rate = OVERRIDE_BY_LEVEL.get(parent_info["level"], 0.0)
        if rate <= 0:
            continue
        db.add(
            CommissionLedger(
                agent_id=parent_info["id"],
                sale_id=sale.id,
                policy_id=sale.policy_id,
                entry_type="OVERRIDE",
                amount=float(fyc_amount) * rate,
                date=sale_date,
                meta=json.dumps({"from_agent_id": seller_info["id"], "policy_number": policy_number}),
            )
        )


def _get_or_create_accrual(db: Session, agent_id: int, period_type: str, sale_date: date) -> VolumeBonusAccrual:
    period_start, period_end = _period_bounds(period_type, sale_date)
    stmt = select(VolumeBonusAccrual).where(
        VolumeBonusAccrual.agent_id == agent_id,
        VolumeBonusAccrual.period_type == period_type,
        VolumeBonusAccrual.period_start == period_start,
    )
    accrual = db.execute(stmt).scalar_one_or_none()
    if accrual:
        return accrual
    accrual = VolumeBonusAccrual(
        agent_id=agent_id,
        period_type=period_type,
        period_start=period_start,
        period_end=period_end,
        total_volume=0.0,
        bonus_rate=0.0,
        bonus_paid=0.0,
    )
    db.add(accrual)
    db.flush()
    return accrual


def _apply_volume_bonus(
    db: Session,
    *,
    agent_info: Dict[str, Any],
    sale: Sale,
    sale_premium: float,
    period_type: str,
) -> None:
    accrual = _get_or_create_accrual(db, agent_info["id"], period_type, sale.sale_date)
    accrual.total_volume = float(accrual.total_volume or 0.0) + float(sale_premium)
    rate = tier_rate(agent_info["level"], accrual.total_volume)
    expected_bonus = round(accrual.total_volume * rate, 2)
    delta = round(expected_bonus - float(accrual.bonus_paid or 0.0), 2)

    if abs(delta) >= 0.01:
        db.add(
            CommissionLedger(
                agent_id=agent_info["id"],
                sale_id=sale.id,
                policy_id=sale.policy_id,
                entry_type="VOLUME_BONUS",
                amount=delta,
                date=sale.sale_date,
                meta=json.dumps(
                    {
                        "period_type": period_type,
                        "period_start": accrual.period_start.isoformat(),
                        "period_end": accrual.period_end.isoformat(),
                        "volume": accrual.total_volume,
                        "rate": rate,
                    }
                ),
            )
        )
        accrual.bonus_paid = float(accrual.bonus_paid or 0.0) + delta
    accrual.bonus_rate = rate


def apply_volume_bonuses(db: Session, sale: Sale, chain: List[Dict[str, Any]]) -> None:
    for agent_info in chain:
        for period_type in ("monthly", "quarterly", "annual"):
            _apply_volume_bonus(
                db,
                agent_info=agent_info,
                sale=sale,
                sale_premium=sale.premium,
                period_type=period_type,
            )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def record_sale_and_pay(
    db: Session,
    *,
    policy: Policy,
    seller: Agent,
    premium: float,
    fyc_rate: float,
    sale_date: date,
    extra_fields: Dict[str, Any] | None = None,
) -> Sale:
    """
    Create the sale, snapshot hierarchy, post FYC/override commissions, and update volume bonuses.
    """
    chain = _build_hierarchy_chain(db, seller)
    payload = {
        "policy_id": policy.id,
        "seller_id": seller.id,
        "premium": float(premium),
        "sale_date": sale_date,
        "hierarchy_snapshot": json.dumps(chain),
    }
    if extra_fields:
        payload.update(extra_fields)

    sale = Sale(**payload)
    db.add(sale)
    db.flush()

    fyc_amount = float(premium) * float(fyc_rate)
    pay_commissions(db, sale, fyc_amount, chain, policy.policy_number)
    apply_volume_bonuses(db, sale, chain)

    return sale
