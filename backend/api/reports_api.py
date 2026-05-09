# backend/api/reports_api.py
from flask import Blueprint, request, jsonify, Response
from core.db import session_scope
from core.auth import require_auth
from services.reports import summary
import csv
import io

bp = Blueprint("reports", __name__)

@bp.get("/summary")
@require_auth
def report_summary():
    with session_scope() as db:
        mode = (request.args.get("mode") or "quarterly").lower()  # monthly|quarterly|annual
        ref = request.args.get("ref")  # "2025-10" or "2025"
        agent_id = request.args.get("agent_id")
        agent_id = int(agent_id) if agent_id and agent_id != "all" else None
        data = summary(db, mode=mode, ref=ref, agent_id=agent_id)
        return jsonify(data)

@bp.get("/export")
@require_auth
def report_export():
    with session_scope() as db:
        mode = (request.args.get("mode") or "quarterly").lower()
        ref = request.args.get("ref")
        agent_id = request.args.get("agent_id")
        agent_id = int(agent_id) if agent_id and agent_id != "all" else None

        data = summary(db, mode=mode, ref=ref, agent_id=agent_id)

        buf = io.StringIO()
        w = csv.writer(buf)
        w.writerow(["Section", "A", "B", "C", "D"])
        w.writerow(["KPI", data["period"]["label"], "Total Commission", f"{data['kpi_total']:.2f}", ""])
        w.writerow([])
        w.writerow(["Commission History", "Quarter/Period", "Agent", "Total Sale", "Avg Rate", "Total Commission"])
        for r in data["history"]:
            w.writerow([
                "",
                r["quarter"],
                r["agent"],
                f"{r['total_sale']:.2f}",
                f"{r['avg_rate'] * 100:.2f}%",
                f"{r['total_commission']:.2f}",
            ])
        w.writerow([])
        w.writerow(["Volume Bonus", "Agent", "Volume", "Tier", "Bonus"])
        for r in data["volume_bonus"]:
            w.writerow(["", r["agent"], f"{r['volume']:.2f}", r["tier"], f"{r['bonus']:.2f}"])

        out = buf.getvalue().encode("utf-8")
        return Response(
            out,
            headers={
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": f'attachment; filename="commission_report_{data["period"]["label"].replace(" ","_")}.csv"'
            }
        )
