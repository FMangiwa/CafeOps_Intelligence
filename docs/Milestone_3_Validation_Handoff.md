# PP08_CaféOps_Intelligence — Milestone 3
## Validation, Deployment Readiness & Handoff

**Project:** PP08_CaféOps_Intelligence  
**Phase:** Milestone 3 — Validation, Deployment & Handoff  
**Basis:** `TECHNICAL_ANALYSIS.md`  
**Status:** Portfolio/demo validation package; production deployment remains dependent on client/environment decisions.

---

## 1. Purpose

Milestone 3 is the validation, deployment-readiness, and handoff phase for the bounded V1 described in `TECHNICAL_ANALYSIS.md`.

The technical analysis defines this milestone as:

- reconciliation of imported data against agreed source periods;
- end-to-end and authorization testing;
- fixing in-scope acceptance defects;
- validation of AI answers against an agreed question set;
- deployment to the agreed environment;
- operational documentation and handoff.

The phase exits when the agreed acceptance criteria are met, or remaining exceptions are documented and accepted.

---

## 2. Current Portfolio Validation Baseline

The current synthetic/demo implementation already contains:

- PostgreSQL/Supabase relational storage;
- organization and multi-location data boundaries;
- FastAPI backend/reporting APIs;
- Next.js/React dashboard;
- sales, inventory, menu/recipe costing, labor, vendor and reporting workflows;
- AI assistant with server-side location authorization and validated business data access;
- unit, integration, business-rule, inventory reconciliation, and authorization tests.

The current synthetic dataset covers two locations and August 1–31, 2026 in GBP.

**Important:** the dataset is synthetic. Square API access, source reconciliation, production hosting, retention requirements, and client acceptance decisions are not verified by this portfolio environment.

---

## 3. Validation Checklist

### 3.1 Automated backend tests

Run from the backend directory:

```powershell
py -m pytest
```

Expected result for the current hardening baseline:

```text
80 passed
```

Warnings may remain from dependency deprecations; they should be reviewed separately from test failures.

### 3.2 Backend startup

```powershell
py -m uvicorn app.main:app --reload
```

Verify:

- application starts successfully;
- authentication is required for protected endpoints;
- selected-location authorization remains enforced;
- report endpoints return expected data for authorized locations.

### 3.3 Frontend validation

From the frontend directory, run the repository's configured validation/build commands.

At minimum verify:

- Overview loads;
- location selection works;
- date range changes reload report data;
- Create Report opens the professional print/report flow;
- Sales displays daily sales;
- Vendors expose the clickable row interaction/hand affordance;
- Inventory, Menu & Costs, Labor, and Vendors open using the selected dashboard preview behavior;
- AI assistant requests include the authenticated Supabase access token.

### 3.4 Authorization validation

Verify that an authenticated user cannot access a location outside the locations assigned to that principal.

Required behavior:

```text
Authorized location  -> normal response
Unauthorized location -> 403
```

Do not weaken organization/location boundaries to make dashboard or AI requests succeed.

---

## 4. Business Reconciliation Tests

For each agreed source period, compare the application against the source system.

### Sales

Reconcile:

- completed paid transaction count;
- gross/net sales according to the approved definition;
- sales by date;
- sales by menu item/category where source data supports it.

### Labor

Reconcile:

- recorded hours;
- labor cost;
- labor cost percentage;
- sales per labor hour.

### Inventory

Reconcile the theoretical ledger separately from physical stock.

Conceptual calculation:

```text
Opening stock
+ received purchases
- recipe-based consumption
- waste / spoilage
+/- counted adjustments
= closing stock
```

The portfolio dataset does not provide verified physical counts, waste, or adjustment truth. Do not represent theoretical usage as physical inventory accuracy.

### Recipe costing

Verify:

- the complete effective recipe version is used;
- all ingredient rows belonging to that recipe version are included;
- ingredient units are converted consistently;
- sales aggregation is performed independently from recipe ingredient aggregation;
- theoretical COGS and gross-profit calculations are not inflated by one-to-many joins.

### Vendor spend

Reconcile invoice totals and vendor grouping for the selected location and reporting period.

---

## 5. AI Assistant Acceptance Set

The assistant should be validated against a representative question set covering the supported café domain.

### Sales

- What were sales this month?
- What is the average order value?
- What menu item generated the most sales?
- Show daily sales for the selected period.

### Profit / costing

- Which menu item generated the most estimated gross profit this month?
- What is the recipe cost of a menu item?
- What is the estimated gross margin?

### Labor

- What was labor cost this month?
- What was sales per labor hour?
- What percentage of sales went to labor?

### Inventory

- What is the inventory status?
- Which ingredients require attention based on the available theoretical inventory data?

### Vendors

- How much did we spend with vendors during the selected period?
- Which vendor received the most invoice spend?

### Unsupported/out-of-domain questions

The assistant must clearly state when the requested information is unavailable rather than inventing an answer.

Example:

```text
Who won the World Cup 2026?
```

This is outside the café operational dataset and should not be answered as though the café database contains that information.

---

## 6. AI Numeric Grounding Rules

Every numeric business statement must be traceable to application/database results.

The assistant must not:

- invent sales, cost, labor, inventory, vendor, or profit figures;
- call theoretical gross profit “net profit”;
- fabricate physical inventory counts;
- invent currency;
- bypass location authorization;
- present causal explanations without supporting evidence.

The current profit analysis is based on theoretical recipe COGS and recorded labor. Full operating expenses are not present, so net profit is not supported by the demo dataset.

---

## 7. Deployment Readiness Gate

Deployment should proceed only after the following are known:

- approved hosting environment;
- production Supabase/project configuration;
- production authentication configuration;
- required environment/secret values;
- database migration state;
- backup and recovery approach;
- deployment configuration;
- allowed frontend/backend origins;
- production logging expectations;
- retention/audit requirements;
- agreed user roles and location permissions.

The technical analysis explicitly leaves hosting, retention, compliance, audit, and service-level expectations for client agreement.

---

## 8. Integration Readiness Gate

Square integration remains a client/environment dependency.

Before claiming production synchronization, verify:

1. authorized Square access;
2. required API resources;
3. historical data depth;
4. webhook/event availability where required;
5. rate limits;
6. account permissions;
7. source-to-internal field mappings;
8. stable source identifiers;
9. idempotent import behavior;
10. reconciliation against an agreed source period.

Until these are verified, the current Excel/synthetic seed should be treated as the demo ingestion proof rather than a verified Square integration.

---

## 9. Known V1 Limitations

The following remain outside the validated demo unless explicitly implemented and accepted:

- full accounting/payroll replacement;
- automated payment processing;
- autonomous purchase-order submission/vendor ordering;
- advanced demand forecasting;
- complex invoice OCR/accounting integration;
- native iOS/Android applications;
- full multi-location SaaS administration and billing;
- unlimited reports, integrations, or AI question types;
- formal regulatory certification;
- contractual uptime SLA.

The technical analysis also identifies forecasting, invoice processing, and broader multi-location operations as scope decisions rather than assumptions.

---

## 10. Handoff Package

The V1 handoff should contain:

1. source repository;
2. database schema/migrations;
3. environment configuration instructions;
4. backend startup instructions;
5. frontend startup/build instructions;
6. seed/import instructions for demo data;
7. test execution instructions;
8. reconciliation results;
9. AI acceptance-test results;
10. known limitations;
11. deployment configuration;
12. operational notes;
13. acceptance checklist.

---

## 11. Final Acceptance Record

| Area | Status | Evidence / Notes |
|---|---|---|
| Backend tests | PASS | User-confirmed local run: 80 passed, 2 dependency deprecation warnings |
| Frontend build | PASS | User-confirmed `npm run build`; Next.js compilation, TypeScript, and static generation passed |
| Authorization | PASS | Automated security tests passed; login/session and location flow manually verified |
| Sales reporting | PASS | Synthetic-data reconciliation documented in `PP08_Milestone_3_Reconciliation_Report.md` |
| Daily sales | PASS | Frontend verified; reporting included in reconciliation scope |
| Inventory reporting | PASS WITH LIMITATION | Theoretical inventory only; physical counts/waste/adjustment truth unavailable |
| Recipe costing | PASS | All 12 sold menu items have complete recipes; 0 uncosted sales lines |
| Labor reporting | PASS | Synthetic labor totals reconciled; source is not verified payroll/timeclock data |
| Vendor reporting | PASS | Invoice headers and line totals reconcile for both locations |
| AI assistant | PASS FOR DEMO | Automated hardening and semantic tests passed; data remains synthetic |
| AI acceptance set | PARTIAL | Automated tests passed; full manual question-set execution not separately recorded |
| Synthetic source reconciliation | PASS WITH LIMITATION | August 1–31, 2026 workbook reconciled; not a production source-system reconciliation |
| Square production sync | PENDING EXTERNAL VERIFICATION | Credentials, permissions, endpoints, and source reconciliation not verified |
| Production deployment | BLOCKED / PENDING EXTERNAL DECISION | Hosting target and production configuration are not specified |
| Backup/recovery | PENDING EXTERNAL DECISION | No target environment or approved recovery procedure established |
| Handoff documentation | READY FOR PORTFOLIO HANDOFF | Includes validation and reconciliation records; environment-specific operations remain pending |

---

## 12. Milestone 3 Exit Condition

Milestone 3 is complete when:

- agreed acceptance tests pass;
- imported/source data is reconciled for the agreed period;
- authorization tests pass;
- AI answers pass the agreed question set;
- remaining in-scope defects are resolved;
- production configuration is available for the agreed environment;
- deployment is completed or the deployment blocker is explicitly documented;
- known limitations are documented;
- operational and handoff materials are delivered.

For this portfolio implementation, unresolved client/environment dependencies should be recorded as **Pending external verification**, not represented as completed production capabilities.


## 13. Current Milestone 3 Closeout

### Completed for the portfolio/demo environment

- Backend test suite: 80 passed; 2 dependency deprecation warnings.
- Frontend production build: passed.
- Frontend routes and user flows: manually verified by the project owner, including login/session routing, Overview date controls, report generation, and remaining modules.
- Synthetic August 2026 reconciliation: documented separately; sales, labor, recipe costing, and vendor invoice totals reconcile under the report's stated definitions.
- Inventory limitation: explicitly documented; theoretical balances are not physical stock verification.

### Not represented as production-complete

- Square production integration and source reconciliation.
- Deployment to a client-approved hosting environment.
- Production secrets, origins, and authentication configuration.
- Environment-specific backup/recovery validation.
- Client approval of metric definitions and acceptance criteria.
- Full manual AI acceptance question-set execution.

### Closeout decision

**Portfolio/demo Milestone 3: validation and handoff package complete, with the limitations above documented.**

**Production Milestone 3: not closed.** It remains dependent on client decisions, external credentials/source data, and a defined deployment environment. This distinction prevents demo verification from being presented as production acceptance.
