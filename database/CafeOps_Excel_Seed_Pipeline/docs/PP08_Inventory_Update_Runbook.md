# PP08 inventory-only Supabase update

## 1. Back up first
In Supabase, export/backup the current `inventory_balances` and `inventory_transactions` tables before applying.

## 2. Put files in your project
Copy `inventory_only_seed_mapping.json` into the seed pipeline folder (for example, `config\inventory_only_seed_mapping.json`).
Place `CafeOps_Synthetic_Complete_Dataset_Repaired.xlsx` in your project `data` folder.

## 3. Dry-run (PowerShell, from the seed pipeline project root)
```powershell
py seed_excel.py --workbook "..\data\CafeOps_Synthetic_Complete_Dataset_Repaired.xlsx" --mapping ".\config\inventory_only_seed_mapping.json"
```
Confirm the output lists only:
- `inventory_balances` (28 rows)
- `inventory_transactions` (existing opening/receipt rows)

The dry-run does not write to Supabase.

## 4. Apply (only after verifying the dry-run)
Ensure the seed pipeline `.env` has `SUPABASE_URL` and a server-side `SUPABASE_SERVICE_ROLE_KEY`. Do not paste/share the secret.
```powershell
py seed_excel.py --workbook "..\data\CafeOps_Synthetic_Complete_Dataset_Repaired.xlsx" --mapping ".\config\inventory_only_seed_mapping.json" --apply
```

## Important behavior
The script uses upsert with the mapping's conflict columns. It updates matching IDs and may insert missing IDs. It does not delete database rows that are absent from the workbook. The script makes separate REST requests per table/batch, not one transaction; if one batch fails, inspect the output before retrying.

## Verify in Supabase SQL Editor
```sql
select location_id, count(*) as balance_rows,
       sum(opening_quantity) as total_opening_quantity
from public.inventory_balances
where organization_id = 'ORG001'
group by location_id
order by location_id;

select location_id, movement_type, count(*) as rows,
       sum(quantity_change) as total_quantity_change
from public.inventory_transactions
where organization_id = 'ORG001'
group by location_id, movement_type
order by location_id, movement_type;
```
Compare the returned inventory balance quantities and opening movement quantities against the repaired workbook. The import itself does not prove theoretical closing stock is accurate; it only writes the workbook's inventory rows.
