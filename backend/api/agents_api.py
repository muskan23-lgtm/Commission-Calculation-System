import re
from flask import Blueprint, request, jsonify
from sqlalchemy import select, func
from core.db import session_scope
from core.auth import require_auth
from core.security import hash_password
from models.agent import Agent

bp = Blueprint("agents", __name__)

ROLE_BY_LEVEL = {1: "Agent", 2: "Team Lead", 3: "Manager", 4: "Director"}

def as_dict(a: Agent):
    return {
        "id": a.id, "name": a.name, "email": a.email, "level": a.level,
        "role": ROLE_BY_LEVEL.get(a.level, f"L{a.level}"),
        "parent_id": a.parent_id, "external_id": a.external_id,
        "active": bool(a.active), "avatar_url": a.avatar_url
    }


DEFAULT_EXTERNAL_TEMPLATE = ("AGT-", 4, "")


def _extract_numeric(value: str | None) -> int | None:
    if not value:
        return None
    matches = re.findall(r"\d+", value)
    if not matches:
        return None
    try:
        return int(matches[-1])
    except ValueError:
        return None


def _derive_template(values: list[str | None]) -> tuple[str, int, str]:
    for raw in values:
        if not raw:
            continue
        match = re.match(r"^(.*?)(\d+)([^0-9]*)$", raw.strip())
        if match:
            prefix, digits, suffix = match.groups()
            return prefix, len(digits), suffix
    return DEFAULT_EXTERNAL_TEMPLATE


def _next_external_id(db) -> str:
    all_ids = db.execute(select(Agent.external_id)).scalars().all()
    prefix, width, suffix = _derive_template(all_ids)
    highest = 0
    for raw in all_ids:
        numeric = _extract_numeric(raw)
        if numeric and numeric > highest:
            highest = numeric
    max_agent_id = db.scalar(select(func.max(Agent.id))) or 0
    if max_agent_id > highest:
        highest = max_agent_id
    width = max(width, 3)
    next_number = highest + 1
    return f"{prefix}{str(next_number).zfill(width)}{suffix}".strip()

# ✅ define routes WITHOUT trailing slash so /agents works (no redirect)
@bp.route("", methods=["GET", "OPTIONS"])
@require_auth
def list_agents():
    with session_scope() as db:
        agents = db.execute(select(Agent).order_by(Agent.level.desc(), Agent.name.asc())).scalars().all()
        return jsonify([as_dict(a) for a in agents])

@bp.route("", methods=["POST", "OPTIONS"])
@require_auth
def create_agent():
    with session_scope() as db:
        d = request.get_json() or {}
        if not d.get("name") or not d.get("email") or not d.get("password"):
            db.rollback()
            return jsonify({"error": "name, email, password required"}), 400
        external_id = (d.get("external_id") or "").strip()
        if not external_id:
            external_id = _next_external_id(db)
        a = Agent(
            name=d["name"], email=d["email"], password_hash=hash_password(d["password"]),
            level=int(d.get("level", 1)), parent_id=d.get("parent_id"),
            external_id=external_id or None, active=bool(d.get("active", True)),
            avatar_url=d.get("avatar_url"),
        )
        db.add(a); db.commit()
        return jsonify(as_dict(a)), 201

@bp.route("/tree", methods=["GET", "OPTIONS"])
@require_auth
def tree():
    with session_scope() as db:
        agents = db.execute(select(Agent)).scalars().all()
        by_id = {a.id: {**as_dict(a), "children": []} for a in agents}
        roots = []
        for a in agents:
            if a.parent_id and a.parent_id in by_id:
                by_id[a.parent_id]["children"].append(by_id[a.id])
            else:
                roots.append(by_id[a.id])
        def sort_node(n):
            n["children"].sort(key=lambda x: (-x["level"], x["name"]))
            for c in n["children"]:
                sort_node(c)
        for r in roots:
            sort_node(r)
        return jsonify(roots)

@bp.route("/<int:agent_id>", methods=["PUT", "OPTIONS"])
@require_auth
def update_agent(agent_id: int):
    with session_scope() as db:
        a = db.get(Agent, agent_id)
        if not a:
            db.rollback()
            return jsonify({"error": "not found"}), 404
        d = request.get_json() or {}
        for k in ("name", "email", "external_id", "avatar_url"):
            if k in d:
                setattr(a, k, d[k])
        if "level" in d:
            a.level = int(d["level"])
        if "parent_id" in d:
            a.parent_id = d["parent_id"]
        if "active" in d:
            a.active = bool(d["active"])
        if d.get("password"):
            a.password_hash = hash_password(d["password"])
        db.commit()
        return jsonify(as_dict(a))

@bp.route("/<int:agent_id>", methods=["DELETE", "OPTIONS"])
@require_auth
def delete_agent(agent_id: int):
    with session_scope() as db:
        a = db.get(Agent, agent_id)
        if not a:
            db.rollback()
            return jsonify({"error": "not found"}), 404
        if a.children:
            db.rollback()
            return jsonify({"error": "cannot delete: agent has downline"}), 409
        db.delete(a); db.commit()
        return jsonify({"message": "deleted"})
