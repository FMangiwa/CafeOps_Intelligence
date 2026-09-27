# PP08 CaféOps Intelligence — Milestone 3 Reconciliation Report

## Scope
Synthetic August 1–31, 2026 dataset; completed + paid sales; two locations; GBP.

## Sales and labor reconciliation

| Metric | LOC001 | LOC002 | Total |
|---|---:|---:|---:|
| Transactions | 1,163 | 1,135 | 2,298 |
| Units sold | 1,979 | 1,877 | 3,856 |
| Gross sales (after line discounts, before tax) | £7,673.60 | £7,230.70 | £14,904.30 |
| Discounts | £213.50 | £197.50 | £411.00 |
| Tax | £1,278.30 | £1,204.48 | £2,482.78 |
| Theoretical COGS | £1,353.2275 | £1,322.2275 | £2,675.4550 |
| Estimated gross profit | £6,320.3725 | £5,908.4725 | £12,228.8450 |
| Gross margin | 82.37% | 81.71% | 82.04% |
| Labor hours | 744 | 744 | 1,488 |
| Labor cost | £9,862.50 | £9,820.50 | £19,683.00 |
| Sales per labor hour | £10.31 | £9.72 | £10.02 |
| Labor cost % of gross sales | 128.53% | 135.82% | 132.06% |
| Contribution after labor | -£3,542.1275 | -£3,912.0275 | -£7,454.1550 |

## Recipe costing

- All 12 sold menu items have a complete recipe version in the synthetic dataset.
- All recipe units match the ingredient base units.
- 0 sales lines are uncosted.
- Recipe costs are aggregated independently from sales before calculating period COGS/profit, avoiding one-to-many join inflation.

## Vendor spend

| Metric | LOC001 | LOC002 | Total |
|---|---:|---:|---:|
| Invoice total | £419.66 | £245.50 | £665.16 |
| Invoice line total | £419.66 | £245.50 | £665.16 |

Invoice headers and invoice-line sums reconcile exactly for both locations.

## Inventory reconciliation finding

The dataset supports theoretical inventory calculation but does not provide verified physical counts, waste, or adjustment truth. The theoretical ledger produces negative quantities for multiple ingredients after applying recipe-based consumption. This is a **synthetic data reconciliation finding**, not evidence of physical stock accuracy or an application defect.

Therefore the V1 UI must continue to describe inventory as theoretical/recipe-based and must not present the calculated closing quantities as verified physical stock.

## Acceptance status

- Sales source totals: reconciled.
- Labor source totals: reconciled.
- Recipe costing: reconciled.
- Vendor invoice totals: reconciled.
- Inventory: theoretical reconciliation completed; physical reconciliation unavailable from source data.
- AI numeric grounding: covered by existing automated tests.
- Frontend and backend validation: completed separately.

## Remaining external dependencies

- Square production source reconciliation remains unverified.
- Physical inventory counts/waste/adjustments are unavailable in the synthetic dataset.
- Production deployment, backups/recovery, and client-approved metric definitions remain environment/client-dependent.
