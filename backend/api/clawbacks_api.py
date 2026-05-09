import json
from datetime import datetime
from flask import Blueprint, request, jsonify, g
from sqlalchemy import select, func
from core.db import session_scope
from core.auth import require_auth
from models.clawback import Clawback, ClawbackItem
from models.policy import Policy
from models.agent import Agent
from models.commission_ledger import CommissionLedger
from services.clawback import build_clawback_preview, create_clawback, approve_clawback, mark_clawback_processing

bp = Blueprint("clawbacks", __name__)

def _actor_level() -> int:
    actor = getattr(g, "current_agent", None)
    if not actor:
        return 0
    try:
        return int(actor.get("level", 0))
    except (TypeError, ValueError):
        return 0

@bp.get("/summary")
@require_auth
def summary():
    with session_scope() as db:
        pending = (
            db.scalar(
                select(func.count(Clawback.id)).where(
                    Clawback.status.in_(("PENDING", "PROCESSING"))
                )
            )
            or 0
        )
        avg = db.scalar(select(func.avg(ClawbackItem.clawback_amount)).select_from(ClawbackItem)) or 0.0
        impact = db.scalar(select(func.sum(ClawbackItem.clawback_amount)).select_from(ClawbackItem)) or 0.0

        # trend (last 6 months sum of clawback_amount where APPROVED)
        from datetime import date, timedelta
        today = date.today().replace(day=1)
        trend = []
        for i in range(5, -1, -1):
            mstart = (today.replace(day=1) - timedelta(days=30 * i)).replace(day=1)
            mend = (mstart.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
            val = db.scalar(
                select(func.sum(ClawbackItem.clawback_amount))
                .join(Clawback, Clawback.id == ClawbackItem.clawback_id)
                .where(
                    Clawback.status == "APPROVED",
                    Clawback.cancellation_date >= mstart,
                    Clawback.cancellation_date <= mend,
                )
            ) or 0.0
            trend.append({"label": mstart.strftime("%b"), "value": float(val)})

        # by salesperson (count of items)
        rows = db.execute(
            select(Agent.name, func.count(ClawbackItem.id))
            .join(ClawbackItem, ClawbackItem.agent_id == Agent.id)
            .group_by(Agent.id)
            .order_by(func.count(ClawbackItem.id).desc())
            .limit(5)
        ).all()
        by_sales = [{"name": n, "count": int(c)} for (n, c) in rows]

        return jsonify({
            "pending": int(pending),
            "avg": float(avg or 0.0),
            "impact": float(impact or 0.0),
            "trend": trend,
            "by_sales": by_sales,
        })

@bp.get("")
@require_auth
def list_cb():
    with session_scope() as db:
        q = (request.args.get("q") or "").strip().lower()
        totals = db.execute(
            select(
                ClawbackItem.clawback_id,
                func.sum(ClawbackItem.clawback_amount).label("impact"),
                func.sum(ClawbackItem.original_amount).label("original"),
            ).group_by(ClawbackItem.clawback_id)
        ).all()
        totals_map = {
            cid: {"impact": float(impact or 0.0), "original": float(original or 0.0)}
            for cid, impact, original in totals
        }

        clawbacks = db.execute(select(Clawback).order_by(Clawback.created_at.desc())).scalars().all()
        items = []
        for cb in clawbacks:
            policy = db.get(Policy, cb.policy_id)
            policy_number = policy.policy_number if policy else "-"
            top_agent = db.execute(
                select(Agent.name)
                .join(ClawbackItem, ClawbackItem.agent_id == Agent.id)
                .where(ClawbackItem.clawback_id == cb.id)
                .order_by(ClawbackItem.clawback_amount.desc())
                .limit(1)
            ).scalar_one_or_none()

            if q and q not in policy_number.lower() and q not in (top_agent or "").lower():
                continue
            totals_entry = totals_map.get(cb.id, {"impact": 0.0, "original": 0.0})
            items.append({
                "id": cb.id,
                "policy_number": policy_number,
                "cancellation_date": cb.cancellation_date.isoformat(),
                "status": cb.status,
                "amount": totals_entry["impact"],
                "original_amount": totals_entry["original"],
                "salesperson": top_agent or "-",
            })
        return jsonify({"items": items})

@bp.get("/<int:clawback_id>")
@require_auth
def detail(clawback_id: int):
    with session_scope() as db:
        cb = db.get(Clawback, clawback_id)
        if not cb:
            return jsonify({"error": "not found"}), 404

        policy = db.get(Policy, cb.policy_id)
        policy_payload = {
            "id": policy.id if policy else None,
            "number": policy.policy_number if policy else "-",
            "product": policy.product if policy else "-",
        } if policy else None

        payload_items = []
        for item in cb.items:
            agent = db.get(Agent, item.agent_id)
            meta_payload = None
            if item.meta:
                try:
                    meta_payload = json.loads(item.meta)
                except json.JSONDecodeError:
                    meta_payload = {"raw": item.meta}
            payload_items.append({
                "id": item.id,
                "agent": agent.name if agent else f"Agent #{item.agent_id}",
                "agent_id": item.agent_id,
                "entry_type": item.entry_type,
                "original_amount": float(item.original_amount or 0.0),
                "clawback_amount": float(item.clawback_amount or 0.0),
                "meta": meta_payload,
            })

        return jsonify({
            "id": cb.id,
            "policy": policy_payload,
            "cancellation_date": cb.cancellation_date.isoformat(),
            "status": cb.status,
            "reason": cb.reason,
            "notes": cb.notes,
            "items": payload_items,
        })

@bp.get("/preview")
@require_auth
def preview():
    with session_scope() as db:
        policy_number = request.args.get("policy_number")
        cancellation_date = request.args.get("cancellation_date")
        if not policy_number or not cancellation_date:
            return {"error": "policy_number and cancellation_date required"}, 400
        d = datetime.strptime(cancellation_date, "%Y-%m-%d").date()
        data = build_clawback_preview(db, policy_number, d)
        return jsonify(data)

@bp.post("")
@require_auth
def create():
    if _actor_level() < 1:
        return jsonify({"error": "forbidden"}), 403

    with session_scope() as db:
        data = request.get_json() or {}
        policy_number = data.get("policy_number")
        cancellation_date = data.get("cancellation_date")
        reason = data.get("reason")
        notes = data.get("notes")

        if not policy_number or not cancellation_date:
            db.rollback()
            return {"error": "policy_number and cancellation_date required"}, 400

        prev = build_clawback_preview(db, policy_number, datetime.strptime(cancellation_date, "%Y-%m-%d").date())
        if not prev.get("exists"):
            db.rollback()
            return {"error": prev.get("message", "Invalid policy")}, 400

        cb = create_clawback(
            db,
            policy_id=prev["policy"]["id"],
            cancellation_date=datetime.strptime(cancellation_date, "%Y-%m-%d").date(),
            reason=reason,
            notes=notes,
            preview=prev,
        )
        return jsonify({"id": cb.id, "status": cb.status})

@bp.post("/approve")
@require_auth
def approve_bulk():
    if _actor_level() < 3:
        return jsonify({"error": "forbidden"}), 403

    with session_scope() as db:
        ids = (request.get_json() or {}).get("ids") or []
        out = []
        for cid in ids:
            c = approve_clawback(db, int(cid), approve=True)
            if c:
                out.append({"id": c.id, "status": c.status})
        return jsonify({"updated": out})

@bp.post("/deny")
@require_auth
def deny_bulk():
    if _actor_level() < 2:
        return jsonify({"error": "forbidden"}), 403

    with session_scope() as db:
        ids = (request.get_json() or {}).get("ids") or []
        out = []
        for cid in ids:
            c = approve_clawback(db, int(cid), approve=False)
            if c:
                out.append({"id": c.id, "status": c.status})
        return jsonify({"updated": out})


@bp.post("/process")
@require_auth
def process_bulk():
    if _actor_level() < 2:
        return jsonify({"error": "forbidden"}), 403

    with session_scope() as db:
        ids = (request.get_json() or {}).get("ids") or []
        out = []
        for cid in ids:
            c = mark_clawback_processing(db, int(cid))
            if c:
                out.append({"id": c.id, "status": c.status})
        return jsonify({"updated": out})
