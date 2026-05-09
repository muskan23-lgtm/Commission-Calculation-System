# Technical Architecture Overview

## High-Level Design

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS. Logged-in views are protected by a JWT guard. State is managed with lightweight `zustand` stores for auth, agents, sales, reports, and clawbacks.
- **Backend**: Flask application exposing structured blueprints (`auth`, `agents`, `sales`, `dashboard`, `reports`, `clawbacks`). Business logic lives in `services/` modules, keeping request handlers thin.
- **Database**: SQLite with SQLAlchemy ORM. Tables represent agents, policies, sales, commission ledger entries, volume bonus accruals, and clawback entities.
- **Authentication**: Email/password with bcrypt hashing (`core.security`). Successful login issues a JWT signed via `COMMISSIONS_AUTH_SECRET`. `require_auth` decorator enforces bearer auth across protected routes.
- **Commission Engine**: `services.engine.record_sale_and_pay` orchestrates policy creation, hierarchy snapshotting, and ledger writes. Volume bonus tiers use `services.tier_rules`.
- **Clawback Workflow**: `services.clawback` calculates recoveries (FYC, overrides, bonus adjustments), persists clawback requests, and writes reversing ledger entries upon approval.

## Backend Structure

```
backend/
  api/          # Flask blueprints (routing + serialization)
  core/         # DB session management, auth helpers, security utilities
  models/       # SQLAlchemy models
  services/     # Business logic (commission engine, clawbacks, reports, tier rules)
  seeds/        # Sample data scripts
  tests/        # Pytest unit tests targeting the commission engine
```

- `core/db.py` configures the engine (`sqlite:///commission.db` by default), exposes `SessionLocal`, and runs `init_db()` for migrations-lite on start.
- `core/auth.py` contains JWT helpers (`make_token`, `authenticate`, `require_auth` decorator). Tokens expire based on `COMMISSIONS_TOKEN_TTL`.
- `services.engine` inserts ledger records for first-year commissions, overrides, and volume bonuses while maintaining `volume_bonus_accruals`.
- `services.reports` composes period-specific aggregates that feed the reporting UI and CSV exports.

## Frontend Structure

```
frontend/
  src/
    api/        # Axios wrappers for backend endpoints
    components/ # Shared UI components (navbar, cards, tables, modals)
    pages/      # Route-level screens (Dashboard, Agents, Sales, Reports, Clawbacks, Login)
    store/      # Zustand stores handling API interactions and UI state
    types.ts    # Shared TypeScript interfaces mirroring backend responses
```

- `App.tsx` wires routes with a guard that checks `localStorage.token`.
- Data-fetching hooks (`useAuth`, `useAgents`, etc.) encapsulate API calls and optimistic updates.
- Tailwind provides styling primitives; custom components cover KPIs, charts, data tables, and forms.

## Data Flow

1. A user action from the React UI calls an API wrapper (`src/api/*`).
2. The request includes the JWT bearer token (set by an Axios interceptor).
3. Flask blueprint validates the token (`require_auth`) and invokes service layer logic.
4. ORM sessions persist mutations; responses are serialized back to JSON.
5. Frontend stores update local state and trigger component re-rendering.

## Testing

- Backend: `pytest` targets `services.engine` to ensure commission calculations and clawback adjustments remain correct. Tests bootstrap an in-memory SQLite database for isolation.
- Frontend: ESLint, TypeScript, and Vite provide fast feedback (`npm run lint`, `npm run typecheck`). Component-level tests can be added with Vitest/React Testing Library if deeper coverage is needed.

## Deployment Considerations

- Swap SQLite for PostgreSQL/MySQL in production by adjusting the SQLAlchemy URL.
- Serve the React build (`npm run build`) behind a CDN and reverse proxy requests to Flask.
- Rotate JWT secrets regularly and integrate with an identity provider for enterprise SSO.
- Use a job runner (Celery/RQ) if commission recalculations need to scale asynchronously.
