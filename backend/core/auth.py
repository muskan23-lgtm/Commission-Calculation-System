import os
from functools import wraps
from flask import request, jsonify, make_response, g
from jose import jwt, JWTError
from datetime import datetime, timedelta
from core.db import session_scope
from models.agent import Agent
from core.security import check_password

SECRET = os.environ.get("COMMISSIONS_AUTH_SECRET", "change-me-please")
TOKEN_TTL_DAYS = int(os.environ.get("COMMISSIONS_TOKEN_TTL", "2"))
ALGO = "HS256"

def make_token(agent: Agent) -> str:
    payload = {
        "sub": str(agent.id),
        "name": agent.name,
        "email": agent.email,
        "level": int(agent.level),
        "exp": datetime.utcnow() + timedelta(days=TOKEN_TTL_DAYS)
    }
    return jwt.encode(payload, SECRET, algorithm=ALGO)

def require_auth(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        # let CORS preflight pass
        if request.method == "OPTIONS":
            return make_response("", 200)

        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "unauthorized"}), 401
        token = auth.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGO])
        except JWTError:
            return jsonify({"error": "invalid token"}), 401

        agent_id_raw = payload.get("sub")
        try:
            agent_id = int(agent_id_raw)
        except (TypeError, ValueError):
            return jsonify({"error": "invalid token"}), 401

        level_raw = payload.get("level")
        level: int | None
        if level_raw is None:
            with session_scope() as db:
                agent = db.get(Agent, agent_id)
                if not agent:
                    return jsonify({"error": "unauthorized"}), 401
                level = int(agent.level)
                payload["name"] = agent.name
                payload["email"] = agent.email
        else:
            try:
                level = int(level_raw)
            except (TypeError, ValueError):
                level = None
            if level is None:
                with session_scope() as db:
                    agent = db.get(Agent, agent_id)
                    if not agent:
                        return jsonify({"error": "unauthorized"}), 401
                    level = int(agent.level)
                    payload["name"] = agent.name
                    payload["email"] = agent.email

        g.current_agent = {
            "id": agent_id,
            "name": payload.get("name"),
            "email": payload.get("email"),
            "level": level,
        }
        return f(*args, **kwargs)
    return wrapper

def authenticate(email: str, password: str):
    with session_scope() as db:
        user = db.query(Agent).filter(Agent.email == email).first()
        if user and check_password(password, user.password_hash):
            return user
    return None
