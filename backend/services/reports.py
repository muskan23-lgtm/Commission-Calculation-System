# backend/services/reports.py
from datetime import date, datetime, timedelta
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session
from models.sale import Sale
from models.agent import Agent
from models.commission_ledger import CommissionLedger
from models.volume_bonus_accrual import VolumeBonusAccrual
from services.tier_rules import tier_name_and_rate

def _month_start(d: date) -> date:
    return d.replace(day=1)

def _month_end(d: date) -> date:
    ns = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return ns - timedelta(days=1)

def _quarter_bounds(any_day: date):
    q = (any_day.month - 1) // 3 + 1
    start = date(any_day.year, 3*(q-1)+1, 1)
    end = _month_end(date(any_day.year, 3*q, 1))
    return start, end, q

def _year_bounds(any_day: date):
    return date(any_day.year,1,1), date(any_day.year,12,31)

def resolve_range(mode: str, ref: str | None):
    today = date.today()
    if ref:
        # ref may be YYYY-MM or YYYY
        try:
            if len(ref) == 7:
                today = datetime.strptime(ref, "%Y-%m").date()
            elif len(ref) == 4:
                today = datetime.strptime(ref, "%Y").date()
        except Exception:
            pass
    if mode == "monthly":
        start = _month_start(today)
        end = _month_end(today)
        label = f"{start.strftime('%b %Y')}"
    elif mode == "quarterly":
        start, end, q = _quarter_bounds(today)
        label = f"Q{q} {today.year}"
    else:
        start, end = _year_bounds(today)
        label = f"{today.year}"
    return start, end, label

def summary(db: Session, mode: str = "quarterly", ref: str | None = None, agent_id: int | None = None):
    if mode not in {"monthly", "quarterly", "annual"}:
        mode = "quarterly"
    start, end, period_label = resolve_range(mode, ref)

    # SALES volume (direct) within range
    sales_stmt = (
        select(Sale.seller_id, func.sum(Sale.premium).label("vol"))
        .where(and_(Sale.sale_date >= start, Sale.sale_date <= end))
        .group_by(Sale.seller_id)
    )
    if agent_id:
        sales_stmt = sales_stmt.where(Sale.seller_id == agent_id)
    direct_sales_rows = db.execute(sales_stmt).all()
    direct_volume_by_agent = {sid: float(vol or 0.0) for sid, vol in direct_sales_rows}

    # Volume accruals capture downline-inclusive volumes + paid bonuses
    accrual_stmt = select(VolumeBonusAccrual).where(
        VolumeBonusAccrual.period_type == mode,
        VolumeBonusAccrual.period_start == start,
    )
    if agent_id:
        accrual_stmt = accrual_stmt.where(VolumeBonusAccrual.agent_id == agent_id)
    accruals = db.execute(accrual_stmt).scalars().all()
    volume_by_agent = {a.agent_id: float(a.total_volume or 0.0) for a in accruals}
    volume_bonus_paid = {a.agent_id: float(a.bonus_paid or 0.0) for a in accruals}
    if not volume_by_agent:
        volume_by_agent = direct_volume_by_agent.copy()
    else:
        for aid, vol in direct_volume_by_agent.items():
            volume_by_agent.setdefault(aid, vol)

    # COMMISSIONS total (ledger) within range
    cstmt = (
        select(CommissionLedger.agent_id, func.sum(CommissionLedger.amount).label("amt"))
        .where(and_(CommissionLedger.date >= start, CommissionLedger.date <= end))
        .group_by(CommissionLedger.agent_id)
    )
    if agent_id:
        cstmt = cstmt.where(CommissionLedger.agent_id == agent_id)
    com_rows = db.execute(cstmt).all()
    commission_by_agent = {aid: float(amt or 0.0) for aid, amt in com_rows}

    # agent dict
    agents = db.execute(select(Agent)).scalars().all()
    agents_by_id = {a.id: a for a in agents}

    # total commission and bar data
    total_commission = sum(commission_by_agent.values())
    bar = []
    for aid, vol in sorted(direct_volume_by_agent.items(), key=lambda x: -x[1])[:4]:
        a = agents_by_id.get(aid)
        bar.append({"agent": a.name if a else f"ID {aid}", "commission": commission_by_agent.get(aid, 0.0)})

    # trend (sum commissions by month across the chosen period window)
    # build month buckets
    trend_points = []
    cur = start.replace(day=1)
    while cur <= end:
        nxt = _month_end(cur)
        tval = db.execute(
            select(func.sum(CommissionLedger.amount)).where(
                and_(CommissionLedger.date >= cur, CommissionLedger.date <= nxt)
            )
        ).scalar() or 0.0
        trend_points.append({"label": cur.strftime("%b"), "value": float(tval)})
        # next month
        cur = (nxt + timedelta(days=1)).replace(day=1)

    # history rows (top 3 by commissions)
    rows = []
    for aid, amt in sorted(commission_by_agent.items(), key=lambda x: -x[1])[:3]:
        a = agents_by_id.get(aid)
        vol = volume_by_agent.get(aid, direct_volume_by_agent.get(aid, 0.0))
        avg_rate = (amt / vol) if vol > 0 else 0.0
        rows.append({
            "quarter": period_label if mode == "quarterly" else ("This Month" if mode=="monthly" else "This Year"),
            "agent": a.name if a else f"ID {aid}",
            "total_sale": vol,
            "avg_rate": avg_rate,
            "total_commission": amt,
        })

    # volume bonus calc (quarter-style tiers; for monthly/annual we still show with same mapping for UI)
    volume_table = []
    for aid, vol in sorted(volume_by_agent.items(), key=lambda x: -x[1])[:3]:
        a = agents_by_id.get(aid)
        level = a.level if a else 1
        tier_name, rate = tier_name_and_rate(level, vol)
        volume_table.append({
            "agent": a.name if a else f"ID {aid}",
            "volume": vol,
            "tier": tier_name,
            "bonus": volume_bonus_paid.get(aid, vol * rate)
        })

    # small KPI for cards
    kpi_total = total_commission
    kpi_trend_quarter = trend_points  # already computed

    return {
        "period": {"mode": mode, "label": period_label, "start": start.isoformat(), "end": end.isoformat()},
        "by_agent_bar": bar,
        "trend": kpi_trend_quarter,
        "kpi_total": kpi_total,
        "history": rows,
        "volume_bonus": volume_table,
        "agents": [{"id": a.id, "name": a.name} for a in agents],
    }
