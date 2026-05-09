# backend/api/dashboard_api.py
from datetime import date, timedelta
from flask import Blueprint, jsonify
from sqlalchemy import func
from core.db import session_scope
from models.commission_ledger import CommissionLedger
from models.sale import Sale
from models.agent import Agent

bp = Blueprint("dashboard", __name__)

@bp.get("/summary")
def dashboard_summary():
    with session_scope() as db:
        today = date.today()
        start_month = today.replace(day=1)
        prev_month_end = start_month - timedelta(days=1)
        prev_month_start = prev_month_end.replace(day=1)

        def sum_commissions(start: date | None, end: date | None) -> float:
            q = db.query(func.coalesce(func.sum(CommissionLedger.amount), 0.0))
            if start:
                q = q.filter(CommissionLedger.date >= start)
            if end:
                q = q.filter(CommissionLedger.date <= end)
            return float(q.scalar() or 0.0)

        def sum_sales(start: date | None, end: date | None) -> float:
            q = db.query(func.coalesce(func.sum(Sale.premium), 0.0)).filter(Sale.sale_date != None)  # noqa: E711
            if start:
                q = q.filter(Sale.sale_date >= start)
            if end:
                q = q.filter(Sale.sale_date <= end)
            return float(q.scalar() or 0.0)

        def percent_delta(current: float, previous: float) -> float:
            if previous == 0:
                return 0.0
            return round(((current - previous) / previous) * 100.0, 2)

        total_commission = sum_commissions(None, None)
        total_sales = sum_sales(None, None)
        agents_count = int(db.query(func.count(Agent.id)).scalar() or 0)

        cur_commission = sum_commissions(start_month, today)
        prev_commission = sum_commissions(prev_month_start, prev_month_end)
        cur_sales = sum_sales(start_month, today)
        prev_sales = sum_sales(prev_month_start, prev_month_end)

        cur_avg_deal = db.query(func.coalesce(func.avg(Sale.premium), 0.0)).filter(
            Sale.sale_date != None,  # noqa: E711
            Sale.sale_date >= start_month,
            Sale.sale_date <= today,
        ).scalar() or 0.0
        prev_avg_deal = db.query(func.coalesce(func.avg(Sale.premium), 0.0)).filter(
            Sale.sale_date != None,  # noqa: E711
            Sale.sale_date >= prev_month_start,
            Sale.sale_date <= prev_month_end,
        ).scalar() or 0.0

        cur_customers = db.query(func.count(func.distinct(Sale.customer_name))).filter(
            Sale.customer_name != None,  # noqa: E711
            Sale.sale_date != None,  # noqa: E711
            Sale.sale_date >= start_month,
            Sale.sale_date <= today,
        ).scalar() or 0
        prev_customers = db.query(func.count(func.distinct(Sale.customer_name))).filter(
            Sale.customer_name != None,  # noqa: E711
            Sale.sale_date != None,  # noqa: E711
            Sale.sale_date >= prev_month_start,
            Sale.sale_date <= prev_month_end,
        ).scalar() or 0

        # Revenue over time (last 4 weeks)
        revenue_over_time: list[dict[str, float | str]] = []
        start_of_week = today - timedelta(days=today.weekday())
        for offset in range(3, -1, -1):
            week_start = start_of_week - timedelta(weeks=offset)
            week_end = week_start + timedelta(days=6)
            value = sum_sales(week_start, week_end)
            label = f"Week {4 - offset}"
            revenue_over_time.append({"label": label, "amount": value})

        # Team breakdown (sum of commissions by level)
        level_map = {1: "Agent", 2: "Team Lead", 3: "Manager", 4: "Director"}
        breakdown_rows = (
            db.query(Agent.level, func.coalesce(func.sum(CommissionLedger.amount), 0.0))
            .join(CommissionLedger, CommissionLedger.agent_id == Agent.id)
            .group_by(Agent.level)
            .all()
        )
        level_totals = {level: float(amount or 0.0) for level, amount in breakdown_rows}
        team_breakdown = []
        for level in [4, 3, 2, 1]:
            team_breakdown.append({
                "label": level_map.get(level, f"Level {level}"),
                "amount": level_totals.get(level, 0.0),
            })

        # Top earners (last 90 days)
        ninety_days_ago = today - timedelta(days=90)
        top = (
            db.query(Agent.name, func.coalesce(func.sum(CommissionLedger.amount), 0.0).label("amt"))
            .join(CommissionLedger, CommissionLedger.agent_id == Agent.id)
            .filter(CommissionLedger.date >= ninety_days_ago)
            .group_by(Agent.id, Agent.name)
            .order_by(func.sum(CommissionLedger.amount).desc())
            .limit(5)
            .all()
        )
        top_earners = [{"agent": n, "amount": float(a)} for (n, a) in top]

        # Recent sales (5 most recent)
        recent_sales_rows = (
            db.query(Sale.id, Sale.customer_name, Sale.premium, Sale.sale_date, Agent.name, Sale.seller_id)
            .join(Agent, Agent.id == Sale.seller_id, isouter=True)
            .order_by(Sale.sale_date.desc(), Sale.id.desc())
            .limit(5)
            .all()
        )
        recent_sales = [
            {
                "id": sale_id,
                "sales_rep": agent_name or f"Agent #{seller_id}",
                "customer": customer_name or "-",
                "amount": float(premium or 0.0),
                "date": sale_date.isoformat() if sale_date else today.isoformat(),
            }
            for (sale_id, customer_name, premium, sale_date, agent_name, seller_id) in recent_sales_rows
        ]

        # Hierarchy summary
        hierarchy = []
        for level in [4, 3, 2, 1]:
            members = (
                db.query(Agent.name)
                .filter(Agent.level == level)
                .order_by(Agent.name.asc())
                .limit(3)
                .all()
            )
            hierarchy.append({
                "level": level,
                "title": level_map.get(level, f"Level {level}"),
                "count": int(db.query(func.count(Agent.id)).filter(Agent.level == level).scalar() or 0),
                "members": [m[0] for m in members],
            })

        def fmt_delta(cur: float, prev: float) -> float:
            return percent_delta(cur, prev)

        return jsonify({
            "totals": {
                "commissions": total_commission,
                "sales": total_sales,
                "agents": agents_count,
            },
            "deltas": {
                "commissions": fmt_delta(cur_commission, prev_commission),
                "sales": fmt_delta(cur_sales, prev_sales),
                "customers": fmt_delta(cur_customers, prev_customers),
                "avg_deal_size": fmt_delta(cur_avg_deal, prev_avg_deal),
            },
            "stats": {
                "new_customers": int(cur_customers),
                "avg_deal_size": float(cur_avg_deal),
            },
            "revenue_over_time": revenue_over_time,
            "team_breakdown": team_breakdown,
            "top_earners": top_earners,
            "recent_sales": recent_sales,
            "hierarchy": hierarchy,
        })
