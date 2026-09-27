# PP08_CaféOps_Intelligence

An AI-powered café operations platform that consolidates operational data and provides reliable reporting across sales, inventory, recipe costing, labor, vendors, and purchasing. The project demonstrates a multi-organization and multi-location architecture, deterministic business calculations, and an AI assistant constrained to validated, read-only business-data access.

> **Project status:** Portfolio/demo implementation validated against synthetic data. This is not a production deployment. Square production synchronization, client-approved metric definitions, hosting, and operational recovery procedures remain external verification or deployment tasks.

## Overview

Café operators often need to review sales, costs, stock, staffing, and supplier activity across separate records. CaféOps brings these domains into one application and presents operational metrics through a dashboard and natural-language assistant.

The system is designed so that financial and operational values come from deterministic application/SQL calculations. The language model explains returned results; it is not the source of truth for sales, costs, margins, or inventory quantities.

## Capabilities

- Multi-organization and multi-location data model
- Authenticated dashboard and location-aware access
- Sales reporting, date filtering, and daily sales visualization
- Menu and recipe costing
- Theoretical inventory ledger and reconciliation
- Labor hours and labor-cost analytics
- Vendor, purchase-order, and invoice records
- Printable Overview performance report
- AI assistant for natural-language business questions, using validated read-only data access
- Automated backend tests and documented reconciliation results

## Architecture

| Layer | Implementation |
|---|---|
| Database | PostgreSQL / Supabase |
| Backend | Python / FastAPI |
| Frontend | React / Next.js |
| Authentication | Supabase Auth |
| AI | OpenAI API with controlled business-data access |
| Data | Synthetic Excel workbook used for demo seeding and validation |

The architecture follows these principles:

1. PostgreSQL is the operational system of record.
2. Sales, costing, margins, inventory, and labor metrics are calculated deterministically.
3. Organization and location boundaries are enforced server-side.
4. Imports are designed to be traceable and idempotent.
5. AI access is constrained and outputs should be grounded in retrieved business data.

The detailed proposed architecture is documented in `TECHNICAL_ANALYSIS.md`. It remains a proposal pending client discovery and approval.

## Demo data and validation

The synthetic dataset covers **August 1–31, 2026**, uses **GBP**, and includes two café locations. It is fictional and is intended for portfolio demonstration, not to represent a real business.

Selected reconciliation totals:

| Metric | Location 1 | Location 2 | Total |
|---|---:|---:|---:|
| Sales transactions | 1,163 | 1,135 | 2,298 |
| Units sold | 1,979 | 1,877 | 3,856 |
| Gross sales after line discounts, before tax | £7,673.60 | £7,230.70 | £14,904.30 |
| Theoretical COGS | £1,353.2275 | £1,322.2275 | £2,675.4550 |
| Estimated gross profit | £6,320.3725 | £5,908.4725 | £12,228.8450 |
| Labor hours | 744 | 744 | 1,488 |
| Labor cost | £9,862.50 | £9,820.50 | £19,683.00 |

All 12 sold menu items have a complete recipe version in the demo dataset, and no sales lines were uncosted in the reconciliation. Invoice headers and invoice lines also reconcile to £665.16 total vendor spend.

**Inventory limitation:** inventory values are theoretical and recipe-based. The demo dataset does not establish verified physical counts, waste, or adjustment truth. Negative theoretical quantities are documented as a data-reconciliation finding and should not be interpreted as proof of physical stock accuracy or a production defect.

See `PP08_Milestone_3_Reconciliation_Report.md` for the detailed reconciliation and `PP08_Milestone_3_Validation_Handoff.final.md` for validation status and outstanding dependencies.

## Validation status

- Backend automated tests: **80 passed**, with 2 dependency deprecation warnings in the recorded run.
- Frontend production build: **passed** (Next.js compilation, TypeScript, and static page generation).
- Manual frontend verification: login/session routing, location selection, Overview date controls and report flow, and dashboard modules verified by the project owner.
- AI assistant: automated hardening and SQL semantic tests passed; full manual execution of the acceptance question set is not separately recorded.

## Important boundaries

This portfolio implementation does not claim that the following are production-complete:

- Square API authorization, live synchronization, and source-system reconciliation
- Client-approved hosting and production configuration
- Production backup and recovery validation
- Client-approved metric definitions and acceptance sign-off
- Payroll/timeclock verification of synthetic labor records
- Physical inventory verification

These items require appropriate client decisions, credentials, source data, and deployment access.

## Project documents

- `TECHNICAL_ANALYSIS.md` — proposed architecture, scope boundaries, risks, and milestone plan
- `Milestone_3_Reconciliation_Report.md` — synthetic data reconciliation
- `Milestone_3_Validation_Handoff.md` — validation checklist, limitations, and closeout status

## Portfolio summary

PP08 demonstrates an end-to-end café operations application: relational data modeling, backend APIs, dashboard workflows, business-rule calculations, location-aware authorization, AI-assisted querying, automated tests, and reconciliation documentation. The validated status applies to the synthetic portfolio/demo environment; production readiness depends on the external items listed above.

## License

See `LICENSE`.

