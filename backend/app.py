from pathlib import Path

from flask import Flask, send_from_directory
from flask_cors import CORS
from core.db import init_db

def create_app():
    app = Flask(__name__)

    CORS(
        app,
        resources={r"/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}},
        supports_credentials=True,
        expose_headers=["Content-Type", "Authorization"],
        allow_headers=["Content-Type", "Authorization"],
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    )

    # Create tables if missing
    init_db()

    # Blueprints
    from api.auth_api import bp as auth_bp
    from api.agents_api import bp as agents_bp
    from api.sales_api import bp as sales_bp
    from api.dashboard_api import bp as dashboard_bp
    from api.reports_api import bp as reports_bp
    from api.clawbacks_api import bp as clawbacks_bp


    app.register_blueprint(auth_bp, url_prefix="/auth")
    app.register_blueprint(agents_bp, url_prefix="/agents")
    app.register_blueprint(sales_bp, url_prefix="/sales")
    app.register_blueprint(dashboard_bp, url_prefix="/dashboard")
    app.register_blueprint(reports_bp, url_prefix="/reports")
    app.register_blueprint(clawbacks_bp, url_prefix="/clawbacks") 

    @app.get("/health")
    def health():
        return {"ok": True}

    @app.get("/openapi.yaml")
    def openapi_spec():
        root = Path(__file__).resolve().parent
        return send_from_directory(root, "openapi.yaml", mimetype="application/yaml")

    return app

if __name__ == "__main__":
    app = create_app()
    app.run(host="0.0.0.0", port=5002, debug=True)
