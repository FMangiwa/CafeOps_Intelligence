# TECHNICAL_ANALYSIS.md

## Café Operations Platform — Proposed Technical Architecture

**Document status:** Proposed, pending client discovery  
**Scope:** Technical architecture and delivery milestones  
**Pricing:** Not included  
**Important:** This is a proposed design, not a statement that the client has approved the architecture or that integrations/data access have been verified.

---

## 1. Project objective

Build a café operations platform that consolidates operational data, provides reliable reporting, and exposes selected business insights through a natural-language AI assistant.

The anticipated capability areas are:

- Square POS sales ingestion
- Inventory and stock tracking
- Menu recipes and ingredient costing
- Labor-hour ingestion and labor analytics
- Vendor, invoice, and purchasing records
- Operational dashboard and reports
- AI-assisted business questions and recommendations
- A data model that can accommodate multiple locations

The initial release should prioritize trustworthy data and clearly defined business calculations. The AI assistant should explain or summarize computed results rather than act as the source of truth for financial or inventory values.

---



## 2. Proposed architecture

```text
                   ┌────────────────────┐
                   │      Square POS    │
                   └─────────┬──────────┘
                             │ API / webhooks
                             ▼
┌─────────────────────────────────────────────────────┐
│                  Integration layer                  │
│ Square sync │ CSV imports │ Other approved sources  │
│ Scheduled jobs / webhook processing / retry logic   │
└──────────────────────────┬──────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────┐
│                 PostgreSQL / Supabase               │
│ Organizations │ Locations │ Sales │ Menu │ Recipes  │
│ Inventory │ Labor │ Vendors │ Purchases │ Invoices  │
└──────────────────────────┬──────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────┐
│              Domain / analytics services            │
│ Sales metrics │ Inventory ledger │ Recipe costing   │
│ Labor metrics │ Vendor spend │ Reorder calculations │
└──────────────────────────┬──────────────────────────┘
                           ▼
┌─────────────────────────────────────────────────────┐
│                   Application API                   │
│ Authentication │ Authorization │ Validation         │
│ Dashboard endpoints │ Approved business tools       │
└────────────────┬───────────────────────┬────────────┘
                 │                       │
                 ▼                       ▼
┌────────────────────────┐   ┌────────────────────────┐
│ React / Next.js UI     │   │ AI business assistant  │
│ Dashboard / admin      │   │ OpenAI API             │
│ Inventory / recipes    │   │ Tool/function calling  │
│ Vendors / reports      │   │ Evidence-backed output │
└────────────────────────┘   └────────────────────────┘
```



### Architectural principles

1. **Relational system of record:** PostgreSQL should hold validated operational records and derived business data.
2. **Deterministic calculations:** Sales totals, costs, margins, inventory balances, and labor ratios should be calculated by application services or SQL—not invented by the LLM.
3. **Controlled AI access:** The assistant should call explicitly approved, typed business functions. Avoid unrestricted production SQL generation.
4. **Location-aware design:** Operational records should be scoped to an organization and location where applicable.
5. **Traceable imports:** Store source identifiers, synchronization timestamps, and import status so data can be reconciled and failures investigated.
6. **Incremental delivery:** Start with a bounded V1 and treat forecasting, advanced invoice processing, and broad multi-location operations as separately confirmed scope.

---



## 3. Proposed technology stack


| Layer          | Proposed technology                               | Notes                                                   |
| -------------- | ------------------------------------------------- | ------------------------------------------------------- |
| Database       | PostgreSQL / Supabase                             | Relational operational system of record                 |
| Backend        | Python with FastAPI, or an agreed Next.js backend | Final choice depends on hosting and team preferences    |
| Frontend       | React / Next.js                                   | Dashboard and administrative workflows                  |
| AI             | OpenAI API                                        | Tool/function calling for approved business operations  |
| Integration    | Square API                                        | Confirm endpoints, permissions, and available data      |
| Automation     | n8n or scheduled backend workers                  | Use for orchestration where it improves maintainability |
| Authentication | Supabase Auth or equivalent                       | Required approach and roles to be confirmed             |
| Testing        | Unit, integration, and business-rule tests        | Include reconciliation and access-control cases         |
| Deployment     | Client-approved cloud environment                 | Hosting provider and environments are TBD               |


These are proposed choices based on the job description. The backend, authentication, hosting, and exact automation approach require client confirmation.

---



## 4. Data model — proposed domains

A preliminary relational model may include:

- **Organization** — tenant/business account.
- **Location** — café branch belonging to an organization.
- **User / Role** — authenticated user and permitted actions.
- **Employee** — employee identity and location association.
- **Sales transaction / line item** — Square-derived sales records and source identifiers.
- **Menu item** — sellable product and category.
- **Recipe** — versioned ingredient quantities associated with a menu item.
- **Ingredient** — ingredient identity and canonical unit.
- **Inventory balance / transaction** — stock movements, counts, purchases, waste, and adjustments.
- **Vendor** — supplier details.
- **Vendor item / price** — supplier-specific ingredient and price history.
- **Purchase order / purchase line** — planned and completed purchases.
- **Invoice** — invoice metadata and, if agreed, extracted line items.
- **Labor record / shift** — imported or entered hours and associated labor costs.
- **Sync job / import record** — source, status, timestamps, errors, and reconciliation metadata.



### Data-model decisions requiring discovery

- Whether recipes and ingredient costs are shared across locations or vary by location.
- Whether employees can work at multiple locations.
- Whether vendor pricing is global or location-specific.
- How historical recipe changes affect historical cost reporting.
- Whether inventory is tracked by unit, package, storage area, or batch.
- Which business records must be retained and for how long.

---



## 5. Data ingestion and synchronization



### Square POS

Proposed flow:

1. Obtain authorized Square access and confirm required API resources.
2. Perform a bounded initial historical import.
3. Normalize Square records into the internal schema.
4. Use scheduled incremental synchronization and/or webhooks where appropriate.
5. Make imports idempotent using stable source identifiers.
6. Record sync status, failures, and last successful synchronization.
7. Reconcile imported totals against Square for agreed periods.

Square endpoint availability, historical depth, webhook events, rate limits, and account permissions must be verified before implementation commitments.

### Other data sources

Labor hours, supplier invoices, and purchasing data sources are currently unspecified. Depending on client systems, ingestion may use:

- API integration
- CSV import
- Manual entry
- Document upload and extraction, if explicitly included

Each source requires a confirmed mapping, validation rules, and ownership for correcting bad or incomplete records.

---



## 6. Inventory and recipe calculations

The inventory subsystem should use explicit stock movements rather than relying only on a manually overwritten quantity.

A conceptual inventory balance is:

```text
Opening stock
+ received purchases
- recipe-based consumption
- waste / spoilage
+/- counted adjustments
= closing stock
```

For recipe-based consumption:

```text
Menu item sales
→ recipe version valid for the sale
→ ingredient quantities
→ unit conversion
→ inventory movement / theoretical usage
```



### Required rules to confirm

- Supported measurement units and conversion rules.
- Recipe versioning and effective dates.
- Treatment of modifiers, substitutions, complimentary items, voids, and discounts.
- Whether inventory deduction is theoretical or reconciled against physical counts.
- Waste, spoilage, staff meals, and manual adjustments.
- Treatment of negative stock and missing recipe data.

The system should distinguish **theoretical usage** from **physical stock counts** and should not imply that recipe-based consumption alone guarantees actual inventory accuracy.

---



## 7. Analytics and business metrics

Implement approved, testable calculation services for the dashboard and AI tools.

Potential metrics include:

- Sales by date, hour, category, menu item, and employee where source data supports it.
- Average order value and transaction counts.
- Food and beverage cost percentages.
- Recipe and menu-item gross margin.
- Labor cost percentage.
- Sales per labor hour.
- Inventory value.
- Vendor spend and ingredient price changes.
- Period-over-period comparisons.



### Metric definitions must be agreed

For example, “gross profit” and “food cost %” can be defined differently depending on included costs, taxes, discounts, waste, and accounting practices. The client must approve formulas and comparison periods before the figures are presented as business metrics.

The analytics layer should expose documented formulas and test cases so dashboard values and AI responses use the same definitions.

---



## 8. AI business assistant



### Proposed interaction flow

```text
User question
    ↓
Intent / task interpretation
    ↓
Approved business tool selection
    ↓
Validated query or calculation
    ↓
Structured result + source/time context
    ↓
LLM explanation
    ↓
Answer with relevant caveats
```



### Example approved tools

- `get_sales_summary(date_range, location_id, grouping)`
- `compare_sales(period_a, period_b, location_id)`
- `get_menu_margin(date_range, location_id)`
- `get_inventory_status(location_id, as_of)`
- `get_vendor_spend(date_range, vendor_id, location_id)`
- `get_labor_metrics(date_range, location_id)`

These are illustrative contracts, not finalized APIs.

### AI safeguards

- Enforce authentication and location permissions before tool execution.
- Validate tool arguments and allowed date ranges.
- Return data freshness and missing-data warnings.
- Ground numeric statements in tool results.
- Avoid claiming causal explanations unless supported by measured evidence.
- Keep purchase recommendations advisory unless the client explicitly authorizes an action workflow.
- Log tool execution and errors without unnecessarily retaining sensitive content.



### Forecasting boundary

“What should I order tomorrow?” could mean a simple threshold-based reorder list or a demand-forecasting system. The first release should not promise forecasting until the client confirms required inputs, lead times, minimum order quantities, forecast horizon, and acceptable accuracy criteria.

---



## 9. Dashboard and administrative workflows

A proposed V1 interface may include:

- Daily operations overview
- Sales trends and item/category breakdowns
- Inventory levels and low-stock alerts
- Menu/recipe and ingredient-cost management
- Vendor and purchase history
- Labor reporting
- AI question interface
- Data import/synchronization status

Exact screens, filters, exports, user roles, and responsive/mobile expectations require confirmation.

---



## 10. Security, reliability, and operations

Proposed baseline:

- Authentication for non-public business data.
- Organization- and location-aware authorization.
- Server-side validation for all writes and AI tool calls.
- Secrets stored in environment/secret management, not source control.
- Least-privilege credentials for integrations.
- Database backups and a documented recovery approach.
- Structured logs for imports, errors, and important operations.
- Idempotent integration jobs with retry and reconciliation behavior.
- Tests for permissions, calculations, duplicate imports, and failure recovery.

Compliance requirements, retention policies, audit requirements, and service-level expectations are unknown and must be agreed.

---



## 11. Testing and acceptance approach



### Test categories

1. **Unit tests:** metric formulas, unit conversion, recipe consumption, and validation.
2. **Integration tests:** Square mapping, database persistence, import retries, and duplicate handling.
3. **Reconciliation tests:** imported totals compared with agreed Square source periods.
4. **Authorization tests:** users cannot access another organization’s or unauthorized location’s data.
5. **AI tool tests:** tool selection, argument validation, grounded numeric answers, and missing-data behavior.
6. **End-to-end tests:** agreed user journeys through dashboard and assistant.
7. **User acceptance testing:** client validates representative business workflows and metric definitions.



### Acceptance criteria to finalize with client

- Agreed source data imports successfully and can be reconciled.
- Sales and operational metrics match approved formulas and test fixtures.
- Inventory calculations follow approved recipe, unit, and adjustment rules.
- Dashboard displays the agreed V1 views.
- Assistant answers the agreed question set using approved data tools and identifies unavailable data.
- Access controls enforce organization/location boundaries.
- Deployment, configuration, known limitations, and handoff documentation are delivered.

---



## 12. Proposed milestones and timeframe

**Planning estimate: approximately 5–8 weeks** for a bounded V1, assuming timely client decisions, access to Square and other source systems, usable data, and a single agreed deployment environment. This is an initial engineering estimate, not a commitment. Forecasting, complex invoice OCR, multiple external integrations, or full multi-location operations could extend the schedule.

### Milestone 1 — Discovery, setup, and architecture validation (30%)

**Estimated timeframe:** 1–2 weeks

**Scope**

- Confirm V1 boundaries and acceptance criteria.
- Inventory source systems and data access.
- Validate Square access and a representative data import.
- Agree metric definitions and inventory/recipe rules.
- Finalize data model, API boundaries, and deployment approach.
- Establish repository, environments, migrations, and initial tests.

**Deliverables**

- Confirmed requirements and assumptions.
- Architecture and data model.
- Integration feasibility findings.
- Initial working connection/import proof, where credentials are available.
- Milestone 2 implementation plan and acceptance checklist.

**Exit criteria**

- Client approves scope, definitions, data mappings, and the proposed architecture.
- Critical data-access blockers are identified.



### Milestone 2 — Core platform and functional workflows (50%)

**Estimated timeframe:** 2–4 weeks

**Scope**

- Implement core database schema and backend services.
- Build Square import/synchronization for agreed resources.
- Implement agreed sales analytics.
- Implement bounded inventory, recipe, and costing workflows.
- Implement agreed labor/vendor ingestion paths.
- Build the agreed dashboard views.
- Implement the AI assistant using approved business tools.
- Add core unit and integration tests.

**Deliverables**

- Functional V1 application in a staging environment.
- Agreed ingestion and synchronization workflows.
- Agreed operational modules and dashboard.
- AI assistant for the approved question set.
- Initial test results and known-issues list.

**Exit criteria**

- Core workflows operate against agreed test/client data.
- Key calculations pass approved tests.
- Client can begin structured acceptance testing.



### Milestone 3 — Validation, deployment, and handoff (20%)

**Estimated timeframe:** 1–2 weeks

**Scope**

- Reconcile imported data against agreed source periods.
- Complete end-to-end and authorization testing.
- Fix in-scope defects discovered during acceptance testing.
- Validate AI answers against the agreed test question set.
- Deploy to the agreed environment.
- Provide operational documentation and handoff.

**Deliverables**

- Deployed agreed V1.
- Test and reconciliation summary.
- Setup/configuration and operating instructions.
- Known limitations and future improvements.
- Handoff and acceptance checklist.

**Exit criteria**

- Agreed acceptance criteria are met or remaining exceptions are documented and accepted.
- Client receives deployment and handoff materials.



### Timeline summary


| Milestone                              | Allocation | Estimated duration          |
| -------------------------------------- | ---------- | --------------------------- |
| 1. Discovery & architecture validation | 30%        | 1–2 weeks                   |
| 2. Core platform & workflows           | 50%        | 2–4 weeks                   |
| 3. Validation, deployment & handoff    | 20%        | 1–2 weeks                   |
| **Total**                              | **100%**   | **Approximately 5–8 weeks** |


The 30/50/20 figures are milestone allocation proportions only; no monetary amounts are included in this document.

---



## 13. Key risks and dependencies


| Risk / dependency                            | Why it matters                                                   | Mitigation / decision                                                                  |
| -------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Square permissions or data limitations       | Can block or constrain sales sync                                | Validate access and endpoints in Milestone 1                                           |
| Unspecified labor source                     | Labor reporting depends on usable hours and wage data            | Confirm source, fields, and import method                                              |
| Incomplete recipes or ingredient units       | Makes theoretical usage and costing unreliable                   | Audit sample data; agree normalization and completeness rules                          |
| Ambiguous cost/profit formulas               | Produces inconsistent reports                                    | Client-approved metric definitions and test fixtures                                   |
| Inventory reality differs from recipe theory | Sales-derived consumption does not capture all waste/adjustments | Define counts, waste, and reconciliation workflows                                     |
| Forecasting expectations                     | Can substantially expand scope and data needs                    | Decide simple reorder rules versus forecasting before implementation                   |
| Vendor invoice processing                    | OCR and line-item matching can be a separate subsystem           | Confirm whether uploads/extraction are in V1                                           |
| Multi-location requirements                  | Changes data isolation, permissions, and reporting               | Confirm whether V1 is single-location with extensible schema or multi-location enabled |
| Unbounded AI question scope                  | Can create unsupported answers and expanding tool requirements   | Agree a supported question set and add tools through change control                    |
| Deployment/security requirements             | May add infrastructure and compliance work                       | Confirm hosting, roles, backups, retention, and operational expectations               |


---



## 14. Client decisions required before implementation

1. Which Square resources and historical date range are required?
2. What system provides employee hours and labor costs?
3. Where are recipes, ingredient prices, and current inventory maintained?
4. Are recipes complete, including quantities and units?
5. What are the approved definitions for gross profit, food cost %, beverage cost %, and labor cost %?
6. Should V1 use theoretical inventory consumption, physical counts, or both?
7. Does “order tomorrow” mean minimum-stock reorder suggestions or demand forecasting?
8. How are vendor invoices received, and is OCR required?
9. Is V1 for one café, or must multiple locations be operational at launch?
10. Which user roles and location permissions are required?
11. What hosting/deployment environment is preferred?
12. What exact dashboard screens, reports, exports, and AI questions are required for acceptance?

---



## 15. Scope boundaries to protect the V1

Unless explicitly confirmed, the estimate does not assume:

- Full accounting or payroll replacement.
- Automated payment processing.
- Autonomous purchase-order submission or vendor ordering.
- Advanced demand forecasting or guaranteed forecast accuracy.
- Complex invoice OCR and accounting-system integration.
- Native iOS/Android applications.
- Full multi-location SaaS administration and billing.
- Unlimited reports, integrations, or AI question types.
- Formal regulatory certification or a contractual uptime SLA.

Changes to these boundaries should be assessed for impact on architecture, delivery time, and acceptance criteria before being added.