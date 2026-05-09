# User Guide

This guide walks through the core personas and workflows supported by the Commission Calculation System UI.

## Getting Started

1. Start the backend and frontend (see `docs/setup.md` or the root `README.md`).
2. Log in with any seeded account:
   - Director: `sarah@co.com` / `pass`
   - Manager: `michael@co.com` / `pass`
   - Team Lead: `jane@co.com` / `pass`
   - Agent: `john@co.com` / `pass`
3. Upon successful login a JWT is stored in `localStorage`, unlocking the protected pages.

## Dashboard

- Provides commission, sales, and agent totals along with month-over-month deltas.
- Weekly revenue chart tracks the last four weeks.
- Team breakdown aggregates commission by hierarchy level.
- Top earners and recent sales tables supply drill-down entry points.

## Agents

- View the roster with level, status, and hierarchy metadata.
- Use the "Add Agent" button to create a new record (levels 1–4).
- Select an agent to edit attributes, change parents, reset passwords, or deactivate.
- Agents without children can be deleted; the API blocks removal otherwise to preserve the hierarchy.

## Sales

- The "Record Sale" form captures customer details, premium, FYC rate, and selling agent.
- Policy numbers auto-increment (`POL-1001`, `POL-1002`, …) but can be overridden.
- Saving a sale triggers the commission engine: FYC, overrides, volume bonuses, and ledger entries are computed automatically.
- Use the history tab to filter by customer name, product, or mobile number.
- The policy lookup tool shows whether a policy number already exists and lists associated sales.

## Reports

- Generate monthly, quarterly, or annual summaries.
- Filter by specific agent or include the entire organisation.
- Download the CSV export for finance reconciliation (`/reports/export` endpoint).
- Widgets include commission totals, top earners, trend chart, and volume bonus table.

## Clawbacks

- The summary screen highlights pending requests, total impact, trends, and top affected agents.
- Use the search box to filter by policy number or salesperson.
- Click a row to inspect the detailed impact (FYC, overrides, and volume bonus adjustments).
- The "Preview" drawer allows policy cancellation simulations before creating a clawback.
- Bulk approve/deny actions push ledger entries and adjust volume bonus accruals in a single step.

## Logout

- Click the avatar dropdown in the navigation bar and choose **Log out** to clear the JWT and return to the login page.

## Troubleshooting

- Ensure the backend is running on `http://localhost:5002`. If hosted elsewhere, update `frontend/.env` with `VITE_API_URL`.
- Missing data? Re-run `python -m seeds.seed` from the backend directory or delete `backend/commission.db` and restart the server to rebuild from scratch.
