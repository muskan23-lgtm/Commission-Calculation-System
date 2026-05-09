from datetime import datetime, date
from flask import Blueprint, request, jsonify
from sqlalchemy import select, desc, or_, func, cast, Integer
from core.db import session_scope
from core.auth import require_auth
from models.policy import Policy
from models.sale import Sale
from models.agent import Agent
from services.engine import record_sale_and_pay

bp = Blueprint("sales", __name__)

POLICY_PREFIX = "POL-"
POLICY_BASE = 1000
POLICY_SUFFIX_START_INDEX = len(POLICY_PREFIX) + 1


def _next_policy_candidate(db) -> str:
    max_suffix = db.scalar(
        select(
            func.max(
                cast(func.substr(Policy.policy_number, POLICY_SUFFIX_START_INDEX), Integer)
            )
        ).where(Policy.policy_number.like(f"{POLICY_PREFIX}%"))
    )
    next_suffix = (max_suffix or POLICY_BASE) + 1
    return f"{POLICY_PREFIX}{next_suffix}"


def _increment_policy_number(current: str) -> str:
    if current.startswith(POLICY_PREFIX):
        try:
            suffix = int(current[len(POLICY_PREFIX):])
        except ValueError:
            suffix = POLICY_BASE
        return f"{POLICY_PREFIX}{suffix + 1}"
    return current


def _generate_policy_number(db) -> str:
    candidate = _next_policy_candidate(db)
    while db.scalar(select(Policy.id).where(Policy.policy_number == candidate)) is not None:
        candidate = _increment_policy_number(candidate)
    return candidate

# Create/record a sale
@bp.post("")
@require_auth
def record_sale():
    with session_scope() as db:
        d = request.get_json() or {}

        policy_number_raw = (d.get("policy_number") or "").strip()
        policy_number = policy_number_raw or _generate_policy_number(db)
        product = d.get("product", "Life")
        fyc_rate = float(d.get("fyc_rate", 0.5) or 0.5)
        premium = float(d["premium"]) if d.get("premium") is not None else 0.0
        seller_id = int(d["seller_id"])

        sale_date = d.get("sale_date")
        if sale_date:
            try:
                sale_date = datetime.strptime(sale_date, "%Y-%m-%d").date()
            except Exception:
                db.rollback()
                return jsonify({"error": "sale_date must be YYYY-MM-DD"}), 400
        else:
            sale_date = date.today()

        # extra UI fields
        customer_name = d.get("customer_name")
        mobile = d.get("mobile")
        gender = d.get("gender")
        notes = d.get("notes")

        policy = db.execute(select(Policy).where(Policy.policy_number == policy_number)).scalar_one_or_none()
        if not policy:
            policy = Policy(policy_number=policy_number, product=product, fyc_rate=fyc_rate)
            db.add(policy)
            db.flush()
        else:
            # keep policy metadata aligned with latest submission
            policy.product = product
            policy.fyc_rate = fyc_rate

        seller = db.get(Agent, seller_id)
        if not seller:
            db.rollback()
            return jsonify({"error": f"seller {seller_id} not found"}), 400

        sale = record_sale_and_pay(
            db,
            policy=policy,
            seller=seller,
            premium=premium,
            fyc_rate=fyc_rate,
            sale_date=sale_date,
            extra_fields={
                "customer_name": customer_name,
                "product": product,
                "mobile": mobile,
                "gender": gender,
                "notes": notes,
            },
        )

        db.commit()
        return jsonify({"message": "sale recorded", "sale_id": sale.id, "policy_number": policy.policy_number})


@bp.get("/next-policy-number")
@require_auth
def next_policy_number():
    with session_scope() as db:
        number = _generate_policy_number(db)
        return jsonify({"next_policy_number": number})

# Recent for dashboard (kept)
@bp.get("/recent")
@require_auth
def recent_sales():
    with session_scope() as db:
        rows = db.execute(select(Sale).order_by(desc(Sale.sale_date), desc(Sale.id)).limit(10)).scalars().all()
        out = []
        for s in rows:
            seller = db.get(Agent, s.seller_id)
            out.append({
                "id": s.id,
                "sales_rep": seller.name if seller else s.seller_id,
                "customer": s.customer_name or "-",
                "amount": s.premium,
                "date": s.sale_date.isoformat()
            })
        return jsonify(out)

# NEW: paged history + simple search
@bp.get("/history")
@require_auth
def history():
    with session_scope() as db:
        page = int(request.args.get("page", 1))
        limit = int(request.args.get("limit", 10))
        q = (request.args.get("q") or "").strip()

        stmt = select(Sale).order_by(desc(Sale.sale_date), desc(Sale.id))
        if q:
            stmt = stmt.where(
                or_(
                    Sale.customer_name.ilike(f"%{q}%"),
                    Sale.product.ilike(f"%{q}%"),
                    Sale.mobile.ilike(f"%{q}%"),
                )
            )
        total = db.scalar(select(func.count()).select_from(Sale)) or 0
        rows = db.execute(stmt.offset((page-1)*limit).limit(limit)).scalars().all()

        data = []
        for s in rows:
            seller = db.get(Agent, s.seller_id)
            data.append({
                "id": s.id,
                "policy_number": db.get(Policy, s.policy_id).policy_number,
                "sales_rep": seller.name if seller else s.seller_id,
                "customer": s.customer_name or "-",
                "product": s.product or "-",
                "amount": s.premium,
                "date": s.sale_date.isoformat(),
            })
        return jsonify({"items": data, "page": page, "limit": limit, "total": total})

# NEW: policy lookup
@bp.get("/policy-lookup")
@require_auth
def policy_lookup():
    with session_scope() as db:
        number = request.args.get("policy_number")
        if not number:
            return jsonify({"error": "policy_number required"}), 400
        pol = db.execute(select(Policy).where(Policy.policy_number == number)).scalar_one_or_none()
        if not pol:
            return jsonify({"exists": False})
        sales = db.execute(select(Sale).where(Sale.policy_id == pol.id).order_by(desc(Sale.sale_date))).scalars().all()
        return jsonify({
            "exists": True,
            "policy": {"number": pol.policy_number, "product": pol.product, "fyc_rate": pol.fyc_rate},
            "sales": [
                {
                    "id": s.id,
                    "customer": s.customer_name,
                    "seller_id": s.seller_id,
                    "premium": s.premium,
                    "date": s.sale_date.isoformat(),
                } for s in sales
            ],
        })
