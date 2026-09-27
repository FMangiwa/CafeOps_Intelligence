# Import runbook

1. Confirm migration is present in the intended Supabase project.
2. Use a demo organization/location only; do not use production tenant IDs.
3. Review the exact workbook and database schema side-by-side.
4. Configure mappings; do not map synthetic spreadsheet identities to Supabase Auth UUIDs.
5. Order parent sheets before child sheets to satisfy foreign keys.
6. Run dry-run and inspect every reported sheet/count/error.
7. Back up or use a disposable database before applying.
8. Apply and retain terminal output as the import audit artifact.
9. Verify row counts, uniqueness, foreign keys, and business totals in Supabase SQL Editor.
10. Re-run the same file to test idempotency only for mappings configured with correct unique conflict keys.

## Mapping example (illustrative only)
```json
{
  "sheet": "example_sheet",
  "table": "example_table",
  "mode": "upsert",
  "conflict_columns": ["example_id"],
  "columns": {"Excel ID": "example_id", "Name": "name"},
  "required_headers": ["Excel ID", "Name"],
  "skip_empty_rows": true
}
```
Do not copy this example without confirming actual headers and constraints.
