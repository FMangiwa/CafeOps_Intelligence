# PP08_CaféOps_Intelligence — End-to-End Workflow

**Status:** Working project workflow  
**Architecture basis:** `TECHNICAL_ANALYSIS.md` (proposed architecture, pending client discovery)  
**Current checkpoint:** Synthetic Excel seed import and row-count verification completed  
**Planning estimate:** 5–8 weeks for a bounded V1, subject to access, decisions, and scope

> The architecture and delivery plan below are proposed, not client-approved. The current workbook contains synthetic demo data; matching row counts do not validate real-world accuracy or external integrations.

## End-to-end architecture

```text
Excel / CSV initially ─┐
Square API/webhooks ───┼─> Ingestion & validation
Other approved sources ┘          |
                                   v
                         PostgreSQL / Supabase
                                   |
                                   v
                      Domain & analytics services
                sales | inventory | recipes/cost | labor
                       vendors/purchasing | metrics
                                   |
                                   v
                           Application API
                  auth | authorization | validation
                         typed business endpoints
                          /                 \
                         v                   v
                React / Next.js UI     OpenAI assistant
                dashboard/admin        approved tools only
                          \                 /
                           v               v
                    Testing, deployment & handoff
```

## Workflow and phase gates

### Phase 0 — Scope, architecture, and assumptions
**Purpose:** Keep implementation aligned with the proposed architecture and prevent unconfirmed scope from silently entering V1.

- Confirm V1 boundaries, data sources, users/roles, locations, metric formulas, inventory rules, hosting, and acceptance criteria.
- Record unresolved decisions and assumptions.
- Validate Square permissions/resources and source-data feasibility when credentials are available.

**Gate:** Scope and critical assumptions are recorded; blockers are visible. The current technical analysis remains proposed pending client confirmation.

### Phase 1 — Synthetic data foundation
**Purpose:** Create realistic demo data to develop and test the platform before client data is available.

- Build synthetic tables for organization/location, menu, ingredients, recipes, inventory, vendors, purchasing, invoices, sales, labor, sync jobs, and metric definitions.
- Keep synthetic data clearly labeled as demo data.

**Gate:** Workbook structure and expected row counts are documented.

### Phase 2 — Data validation and cleaning
**Purpose:** Normalize the workbook and detect data-quality issues before loading it.

- Validate required fields, types, identifiers, relationships, units, dates, and duplicates.
- Apply documented cleaning/mapping rules and produce a QA summary.
- Preserve traceability and do not silently invent business facts.

**Gate:** Validation report is reviewed; unresolved assumptions are explicit.

### Phase 3 — Supabase schema and access foundation
**Purpose:** Establish the relational system of record and tenant/location boundaries.

- Create/verify PostgreSQL tables, keys, constraints, indexes, and row-level security.
- Keep server-side credentials out of source control and chat.
- Use Supabase Auth user UUIDs for actual user profiles; do not blindly seed synthetic users as authenticated users.

**Gate:** Schema/migration checks pass and access strategy is understood.

### Phase 4 — Excel seed pipeline and database verification
**Purpose:** Load the synthetic dataset safely and verify persisted records.

- Map workbook sheets to database tables.
- Support dry-run, batched writes, stable conflict keys, and rerunnable upserts.
- Inspect import logs and query database counts/relationships.

**Completed checkpoint:** Dry-run reported 6,113 mapped rows and zero errors. Apply reported zero errors. A subsequent SQL count check matched all 20 tables and 6,113 total rows.

**Caveat:** Count agreement verifies expected row counts, not full semantic correctness, calculation accuracy, security, or Square reconciliation.

**Gate:** Expected counts match and relationship/business-rule checks are next.

### Phase 5 — Backend API and deterministic business logic (NEXT)
**Purpose:** Create a secure application service layer over Supabase and implement testable café calculations.

**Proposed implementation choice:** Python + FastAPI, unless the project baseline or repository indicates an existing agreed backend. This is a working assumption, not a client-confirmed decision.

**Scope:**
- Establish backend package/configuration, environment handling, logging, and health endpoint.
- Implement Supabase server-side access without exposing service credentials.
- Add authentication/authorization dependency boundaries and organization/location scoping.
- Define validated request/response schemas and consistent error handling.
- Implement deterministic domain services for:
  - sales summaries and period comparisons;
  - menu/recipe costing and gross-margin calculations, using explicit assumptions;
  - inventory status and ledger-derived/theoretical usage, distinguishing physical counts;
  - labor metrics and sales per labor hour;
  - vendor spend and ingredient price comparisons;
  - basic reorder suggestions only if thresholds and lead times are defined.
- Expose typed API endpoints that can later be called by the UI and AI tools.
- Add unit tests, database integration tests where credentials/environment permit, authorization tests, and calculation fixtures.
- Document formulas, missing-data behavior, and known limitations.

**Important rules:**
- Do not let the LLM calculate authoritative money, margin, stock, or labor figures.
- Do not provide unrestricted production SQL to the AI.
- Do not claim real Square synchronization; that is a later integration task requiring authorized access.
- Do not treat recipe-based theoretical usage as actual physical inventory.
- Avoid destructive resets; preserve the seeded demo data.

**Gate:** Tests pass; API outputs match documented fixtures; access boundaries are tested; endpoint contracts are documented.

### Phase 6 — Source integrations and synchronization
**Purpose:** Replace or augment synthetic data with approved real operational sources.

- Implement authorized Square initial import and incremental sync/webhooks for confirmed resources.
- Add idempotency, retries, sync status, error logs, and reconciliation.
- Confirm labor, vendor, invoice, and purchasing sources and import methods.
- Compare imported totals with source periods.

**Gate:** Source access is verified and agreed records reconcile within accepted tolerances.

### Phase 7 — Frontend dashboard and administration
**Purpose:** Build the operator-facing application on stable API contracts.

- Daily overview and sales trends.
- Menu, recipes, ingredient costs.
- Inventory levels, adjustments, and low-stock status.
- Vendor/purchase history and labor reporting.
- Import/sync status and data-quality warnings.
- Responsive behavior and role/location-aware navigation as agreed.

**Gate:** Agreed user journeys work against the API and permissions are enforced.

### Phase 8 — AI business assistant
**Purpose:** Explain computed business results through controlled, evidence-grounded tools.

- Define the supported question set and typed tools, such as sales summary, period comparison, menu margin, inventory status, vendor spend, and labor metrics.
- Enforce user/location permissions before tool execution.
- Validate arguments/date ranges; include data freshness and missing-data caveats.
- Ground numerical claims in tool results and avoid unsupported causal explanations.
- Keep purchasing recommendations advisory unless an action workflow is explicitly authorized.

**Gate:** Tool tests and answer evaluations pass on an agreed question set.

### Phase 9 — End-to-end validation, deployment, and handoff
**Purpose:** Verify the complete V1 and deliver an operable system.

- Unit, integration, reconciliation, authorization, AI-tool, and end-to-end tests.
- User acceptance testing against approved formulas and workflows.
- Fix in-scope defects; document exceptions and limitations.
- Deploy to the approved environment; document configuration, backups/recovery, operations, and handoff.

**Gate:** Acceptance criteria are met or remaining exceptions are documented and accepted.

## Proposed milestone timeline

| Milestone | Allocation | Estimate |
|---|---:|---:|
| Discovery, setup, architecture validation | 30% | 1–2 weeks |
| Core platform and functional workflows | 50% | 2–4 weeks |
| Validation, deployment, handoff | 20% | 1–2 weeks |
| **Total** | **100%** | **Approximately 5–8 weeks** |

This is a planning estimate for bounded V1, not a commitment. Delays in access, client decisions, data quality, forecasting, complex OCR, or broader multi-location requirements can extend it.

## Cross-cutting requirements

- PostgreSQL/Supabase is the relational system of record.
- Calculations are deterministic and documented.
- Organization/location authorization is enforced server-side.
- Imports are traceable, idempotent, retryable, and reconcilable.
- Secrets are stored in environment/secret management, never committed.
- Tests cover calculations, duplicate imports, permissions, and failure handling.
- Data freshness, missing data, and synthetic/demo status are visible.
- Scope changes are assessed for timeline, architecture, and acceptance impact.

## Explicit V1 boundaries unless separately agreed

- No accounting or payroll replacement.
- No payment processing.
- No autonomous purchase-order submission or vendor ordering.
- No advanced demand forecasting or guaranteed forecast accuracy.
- No complex invoice OCR/accounting integration by default.
- No native mobile apps or full SaaS billing by default.
- No unlimited reports, integrations, or AI question types.
- No compliance certification or contractual uptime SLA unless agreed.

## Immediate next action

Proceed with **Phase 5 — Backend API and deterministic business logic**. First inspect the existing repository and `TECHNICAL_ANALYSIS.md`, then implement the backend as one cohesive phase, preserve the seeded data, and provide exact PowerShell commands using `py` where Python is invoked. Do not invent existing files, credentials, or successful test results.
