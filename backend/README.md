# PP08 CaféOps Intelligence — Phase 5 Backend

FastAPI backend foundation for the existing Supabase V1 schema.

## Included endpoints

- `GET /health` — process health only; does not verify Supabase connectivity.
- `GET /v1/me` — validated Supabase Auth identity and mapped profile/access.
- `GET /v1/locations` — active locations visible to the caller.
- `GET /v1/reports/sales?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD[&location_id=...]`
- `GET /v1/reports/labor?...`
- `GET /v1/reports/menu-costs`
- `GET /v1/reports/inventory[?location_id=...]`

## Important limitations / assumptions

- This is a demo/V1 foundation, not production-ready or client-approved.
- Server-role key is used only by this backend. Never put it in frontend code, commit `.env`, or paste it into chat.
- Supabase Auth validates the bearer token via `/auth/v1/user`; authorization then uses `user_profiles` and `user_location_access`.
- `owner` and `admin` are treated as all-location roles, matching the schema comments. Other roles require explicit location access.
- Multi-location reports aggregate authorized locations when no `location_id` is specified.
- Sales totals use `sales_lines.line_total` as net sales, sum `discount_amount`, and calculate gross as quantity × unit price. Confirm discount/tax semantics against approved definitions before operational use.
- Sales endpoint currently fetches at most 10,000 transactions and lines per request; production pagination/aggregation should move into database views/RPCs.
- Menu cost uses currently effective recipe rows and `ingredients.unit_cost`; unit compatibility is assumed and must be validated. Cost is estimated, not accounting COGS.
- Inventory endpoint currently returns latest baseline `opening_quantity`; it does NOT yet apply subsequent ledger movements. Do not use it as on-hand stock.
- Labor cost percentage is labor cost / imported net sales. No overtime, employer burden, breaks, or payroll adjustments are modeled.
- No Square integration, writes, purchasing automation, or LLM tools are included in this phase.
- Integration tests against Supabase and robust pagination are still required.

## Setup (PowerShell)

From the project root, create the backend directory by extracting this package into `backend` (or use its contents there). Then:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
py -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

Set `SUPABASE_URL` and a server-only `SUPABASE_SERVICE_ROLE_KEY` in `.env` locally. Do not share the key.

Run:

```powershell
py -m uvicorn app.main:app --reload
```

Open `http://127.0.0.1:8000/docs` for interactive API docs.

Run unit tests:

```powershell
py -m pytest -q
```

## Authentication

Use a Supabase user access token as `Authorization: Bearer <token>` in Swagger's Authorize dialog. A matching `public.user_profiles` row must exist, and non-owner/admin users need rows in `public.user_location_access`.

## Current phase status\n\nThis package is a generated implementation starter, not yet executed against your local environment or live Supabase. Run the commands below and share errors/results for integration fixes. The basic test is intentionally small and does not certify business calculations or authorization end-to-end.\n\n## Before production

1. Add database-side aggregate views/RPCs with explicit authorization strategy and pagination.
2. Add integration tests using a non-production Supabase project.
3. Apply location filters consistently to every location-scoped dataset.
4. Validate units, effective recipe versions, sales/tax/refund definitions, and ledger reconciliation.
5. Add rate limits, structured audit logging, CORS allowlist, deployment secrets, monitoring, and backup/restore procedures.
6. Confirm access policies and threat-model service-role bypass.
