# CafeOps Excel Seed Pipeline — patched

## Changes
- Adds configured default `organization_id=ORG001` to menu_items, ingredients, recipes, and vendor_items where the workbook has no organization column.
- Derives `metric_name` from `metric_key` for metric_definitions.
- Uses upsert conflict targets for recipes and vendor_items to make reruns safer.
- Rejects `sb_publishable_` keys for `--apply`; use a server-side Supabase secret/service-role key kept only in local `.env`.

## Important operational note
Your previous `--apply` partially succeeded. Re-running this patched pipeline is intended to upsert parent/master data and fill previously failed tables, but rows successfully inserted in prior attempts remain. Review the reported outcomes. Do not delete tables or truncate production data as a cleanup shortcut.

The synthetic workbook has organization `ORG001`. This configuration assumes that is the intended seed organization. Confirm the matching organization exists in Supabase.

## Run from this directory
Dry run:
```powershell
py seed_excel.py --workbook "..\..\data\CafeOps_Synthetic_Complete_Dataset.xlsx"
```
Apply only after setting a valid server-side key in `.env`:
```powershell
py seed_excel.py --workbook "..\..\data\CafeOps_Synthetic_Complete_Dataset.xlsx" --apply
```

For new clean seed:
```powershell
py seed_clean.py `
  --workbook "D:\Documents\Mine\AI Engineering\Portofolio\PP08_CafeOps\data\CafeOps_Synthetic_Complete_Dataset.xlsx" `
  --mapping "config\seed_mapping.json" `
  --reset
```

## Remaining caution
The script's dry-run validates mapping/header presence, not database constraints or full referential integrity. `users` is intentionally excluded because the workbook's synthetic user IDs are not Supabase Auth UUIDs. `square_sync_state` is not seeded from `sync_jobs`; those are different concepts.
