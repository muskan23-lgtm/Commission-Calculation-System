# Setup Instructions

Follow these steps to run the Commission Calculation System locally.

## Prerequisites

- Python 3.11+
- Node.js 18+ and npm
```
git clone https://github.com/QaShah07/commission-calculation-system1.git
```
## Backend (Flask API)

```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Optional environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `COMMISSIONS_AUTH_SECRET` | JWT signing key | `change-me-please` |
| `COMMISSIONS_TOKEN_TTL`   | Token lifetime in days | `2` |

Run the API:

```bash
python app.py
```

The server listens on `http://localhost:5002`. On startup `core.db.init_db()` creates any missing tables in `commission.db`.

### Backend Tests

```bash
cd backend
pytest
```

Tests run against an in-memory SQLite database.

## Frontend (React + Vite)

```bash
cd frontend
npm install
npm run dev
```

- Vite serves the UI at `http://localhost:5173`.
- The default API URL is `http://localhost:5002`. Override by creating `frontend/.env` with `VITE_API_URL=https://your-api`.

### Frontend Tooling

- `npm run lint` — ESLint check
- `npm run typecheck` — TypeScript project validation
- `npm run build` — Production build output in `frontend/dist`

## Sample Data

- The repo ships with `backend/commission.db` populated with representative agents, sales, and commissions.
- To reset or seed a fresh database: `cd backend && python -m seeds.seed`.

## Troubleshooting

- **CORS errors**: Ensure the frontend is served from `http://localhost:5173` (default) or update the origin list in `backend/app.py`.
- **Auth failures**: Verify the backend logs to confirm a matching email/password; re-run the seed script for known test accounts.
- **Database locked**: Stop other processes accessing `commission.db` and remove the file before restarting the API.
