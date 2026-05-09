from flask import Blueprint, request, jsonify
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from core.auth import authenticate, make_token
from core.db import session_scope
from core.security import hash_password
from models.agent import Agent

bp = Blueprint("auth", __name__)

@bp.post("/login")
def login():
    d = request.get_json() or {}
    user = authenticate(d.get("email",""), d.get("password",""))
    if not user:
        return jsonify({"error": "invalid credentials"}), 401
    return jsonify({"token": make_token(user)})

@bp.post("/register")
def register():
    payload = request.get_json() or {}
    name = (payload.get("name") or "").strip()
    email = (payload.get("email") or "").strip().lower()
    password = payload.get("password") or ""

    if not name or not email or not password:
        return jsonify({"error": "name, email, password required"}), 400

    with session_scope() as db:
        exists = db.execute(select(Agent.id).where(Agent.email == email)).scalar()
        if exists:
            return jsonify({"error": "email already registered"}), 409

        agent = Agent(name=name, email=email, password_hash=hash_password(password))
        db.add(agent)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return jsonify({"error": "email already registered"}), 409
        db.refresh(agent)
        token = make_token(agent)

    return jsonify({"token": token}), 201
