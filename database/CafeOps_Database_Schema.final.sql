-- PP08 CaféOps Intelligence
-- Canonical relational schema for Supabase/PostgreSQL.
-- Run this file in Supabase SQL Editor.
-- Synthetic seed data is loaded separately; this file creates the DB structure.

create extension if not exists pgcrypto;

create table if not exists public.organizations (
    organization_id text primary key,
    organization_name text not null,
    currency text not null default 'GBP',
    timezone text not null default 'UTC',
    status text not null default 'active',
    created_at timestamptz not null default now()
);

create table if not exists public.locations (
    location_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_name text not null,
    address text,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    unique (organization_id, location_id)
);

create table if not exists public.users (
    user_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    email text not null,
    role text not null,
    status text not null default 'active',
    created_at timestamptz not null default now(),
    unique (organization_id, email)
);

create table if not exists public.employees (
    employee_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    first_name text not null,
    last_name text not null,
    role text,
    hourly_rate numeric(12,4) not null default 0,
    active boolean not null default true
);

create table if not exists public.menu_items (
    menu_item_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    sku text,
    menu_item_name text not null,
    category text,
    size text,
    list_price numeric(12,2) not null,
    active boolean not null default true,
    unique (organization_id, sku)
);

create table if not exists public.ingredients (
    ingredient_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    ingredient_name text not null,
    base_unit text not null,
    purchase_pack_size numeric(14,4),
    purchase_pack_unit text,
    latest_pack_cost numeric(14,4),
    unit_cost numeric(14,6) not null default 0,
    active boolean not null default true
);

create table if not exists public.recipes (
    recipe_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    menu_item_id text not null references public.menu_items(menu_item_id),
    recipe_version integer not null,
    ingredient_id text not null references public.ingredients(ingredient_id),
    quantity numeric(14,6) not null,
    unit text not null,
    effective_from date not null,
    effective_to date
);

create table if not exists public.inventory_balances (
    inventory_balance_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_id text not null references public.locations(location_id),
    ingredient_id text not null references public.ingredients(ingredient_id),
    as_of_date date not null,
    opening_quantity numeric(14,4) not null default 0,
    unit text not null,
    reorder_point numeric(14,4),
    target_quantity numeric(14,4),
    unique (location_id, ingredient_id, as_of_date)
);

create table if not exists public.inventory_transactions (
    inventory_transaction_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_id text not null references public.locations(location_id),
    ingredient_id text not null references public.ingredients(ingredient_id),
    movement_date date not null,
    movement_type text not null,
    quantity_change numeric(14,4) not null,
    unit text not null,
    reference_type text,
    reference_id text,
    notes text
);

create table if not exists public.vendors (
    vendor_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    vendor_name text not null,
    payment_terms text,
    active boolean not null default true
);

create table if not exists public.vendor_items (
    vendor_item_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    vendor_id text not null references public.vendors(vendor_id),
    ingredient_id text not null references public.ingredients(ingredient_id),
    vendor_sku text,
    pack_size numeric(14,4),
    pack_unit text,
    current_pack_price numeric(14,4),
    currency text not null default 'GBP',
    valid_from date not null
);

create table if not exists public.purchase_orders (
    purchase_order_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_id text not null references public.locations(location_id),
    vendor_id text not null references public.vendors(vendor_id),
    order_date date not null,
    expected_date date,
    status text not null,
    currency text not null default 'GBP'
);

create table if not exists public.purchase_order_lines (
    purchase_order_line_id text primary key,
    purchase_order_id text not null references public.purchase_orders(purchase_order_id),
    ingredient_id text not null references public.ingredients(ingredient_id),
    quantity_ordered numeric(14,4) not null,
    quantity_received numeric(14,4),
    unit text not null,
    unit_price numeric(14,4) not null,
    line_total numeric(14,2) not null
);

create table if not exists public.invoices (
    invoice_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_id text not null references public.locations(location_id),
    vendor_id text not null references public.vendors(vendor_id),
    purchase_order_id text references public.purchase_orders(purchase_order_id),
    invoice_number text,
    invoice_date date not null,
    due_date date,
    status text not null,
    currency text not null default 'GBP',
    total_amount numeric(14,2) not null
);

create table if not exists public.invoice_lines (
    invoice_line_id text primary key,
    invoice_id text not null references public.invoices(invoice_id),
    ingredient_id text references public.ingredients(ingredient_id),
    description text,
    quantity numeric(14,4) not null,
    unit text,
    unit_price numeric(14,4) not null,
    line_total numeric(14,2) not null
);

create table if not exists public.sales_transactions (
    transaction_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_id text not null references public.locations(location_id),
    source_system text,
    source_transaction_id text,
    created_at timestamptz not null,
    currency text not null default 'GBP',
    status text not null,
    payment_status text not null,
    unique (organization_id, source_system, source_transaction_id)
);

create table if not exists public.sales_lines (
    sales_line_id text primary key,
    transaction_id text not null references public.sales_transactions(transaction_id),
    menu_item_id text not null references public.menu_items(menu_item_id),
    quantity numeric(14,4) not null,
    unit_price numeric(12,2) not null,
    discount_amount numeric(12,2) not null default 0,
    line_total numeric(14,2) not null,
    tax_amount numeric(14,2) not null default 0
);

create table if not exists public.shifts (
    shift_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_id text not null references public.locations(location_id),
    shift_date date not null,
    start_time time,
    end_time time,
    planned boolean not null default false
);

create table if not exists public.labor_records (
    labor_record_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_id text not null references public.locations(location_id),
    employee_id text not null references public.employees(employee_id),
    shift_id text references public.shifts(shift_id),
    work_date date not null,
    hours_worked numeric(10,2) not null,
    hourly_rate numeric(12,4) not null,
    labor_cost numeric(14,2) not null,
    source text
);

create table if not exists public.sync_jobs (
    sync_job_id text primary key,
    organization_id text not null references public.organizations(organization_id),
    location_id text references public.locations(location_id),
    source_system text not null,
    job_type text not null,
    started_at timestamptz,
    completed_at timestamptz,
    status text not null,
    records_read integer not null default 0,
    records_written integer not null default 0,
    error_message text
);

create table if not exists public.metric_definitions (
    metric_key text primary key,
    proposed_formula text not null,
    unit text not null
);

-- Query-performance indexes.
create index if not exists idx_locations_org on public.locations(organization_id);
create index if not exists idx_menu_items_org on public.menu_items(organization_id);
create index if not exists idx_ingredients_org on public.ingredients(organization_id);
create index if not exists idx_recipes_org_menu on public.recipes(organization_id, menu_item_id);
create index if not exists idx_inventory_balances_scope on public.inventory_balances(organization_id, location_id, ingredient_id, as_of_date);
create index if not exists idx_inventory_transactions_scope_date on public.inventory_transactions(organization_id, location_id, movement_date);
create index if not exists idx_vendors_org on public.vendors(organization_id);
create index if not exists idx_vendor_items_org on public.vendor_items(organization_id, ingredient_id);
create index if not exists idx_purchase_orders_scope_date on public.purchase_orders(organization_id, location_id, order_date);
create index if not exists idx_invoices_scope_date on public.invoices(organization_id, location_id, invoice_date);
create index if not exists idx_sales_transactions_scope_date on public.sales_transactions(organization_id, location_id, created_at);
create index if not exists idx_sales_lines_transaction on public.sales_lines(transaction_id);
create index if not exists idx_sales_lines_menu_item on public.sales_lines(menu_item_id);
create index if not exists idx_shifts_scope_date on public.shifts(organization_id, location_id, shift_date);
create index if not exists idx_labor_scope_date on public.labor_records(organization_id, location_id, work_date);
create index if not exists idx_sync_jobs_scope on public.sync_jobs(organization_id, location_id, started_at);

-- Dynamic schema contract consumed by the SQL-generating assistant.
create or replace function public.cafeops_get_query_schema()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
with cols as (
    select
        c.table_name,
        jsonb_agg(
            jsonb_build_object(
                'column', c.column_name,
                'type', c.data_type,
                'nullable', c.is_nullable = 'YES'
            ) order by c.ordinal_position
        ) as columns
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name in (
        'organizations','locations','users','employees','menu_items','ingredients','recipes',
        'inventory_balances','inventory_transactions','vendors','vendor_items','purchase_orders',
        'purchase_order_lines','invoices','invoice_lines','sales_transactions','sales_lines',
        'shifts','labor_records','sync_jobs','metric_definitions'
      )
    group by c.table_name
), keys as (
    select
        tc.table_name,
        jsonb_agg(
            jsonb_build_object(
                'column', kcu.column_name,
                'references_table', ccu.table_name,
                'references_column', ccu.column_name
            ) order by kcu.column_name
        ) as foreign_keys
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on kcu.constraint_name = tc.constraint_name
     and kcu.table_schema = tc.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.table_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
    group by tc.table_name
)
select jsonb_agg(
    jsonb_build_object(
        'table', cols.table_name,
        'columns', cols.columns,
        'foreign_keys', coalesce(keys.foreign_keys, '[]'::jsonb)
    ) order by cols.table_name
)
from cols
left join keys using (table_name);
$$;

revoke all on function public.cafeops_get_query_schema() from public;
revoke all on function public.cafeops_get_query_schema() from anon;
revoke all on function public.cafeops_get_query_schema() from authenticated;
grant execute on function public.cafeops_get_query_schema() to service_role;

-- Read-only SQL execution primitive. Application validation is mandatory before calling it.
create or replace function public.cafeops_execute_readonly_query(p_sql text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    result jsonb;
    plan jsonb;
begin
    if p_sql is null or btrim(p_sql) = '' then
        raise exception 'SQL cannot be empty';
    end if;
    -- The application always sends a single SELECT wrapper. Use btrim/left
    -- rather than a regex here so PostgreSQL's regex whitespace behavior cannot
    -- reject an otherwise valid read-only query.
    if lower(left(btrim(p_sql), 6)) <> 'select' then
        raise exception 'Only SELECT statements are allowed';
    end if;
    if p_sql ~* ';|\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|merge|vacuum|refresh|execute|prepare|deallocate|set|reset)\b' then
        raise exception 'Non-read-only SQL was rejected';
    end if;
    execute 'explain (format json) ' || p_sql into plan;
    execute format('select coalesce(jsonb_agg(t), ''[]''::jsonb) from (%s) t', p_sql)
      into result;
    return coalesce(result, '[]'::jsonb);
end;
$$;

revoke all on function public.cafeops_execute_readonly_query(text) from public;
revoke all on function public.cafeops_execute_readonly_query(text) from anon;
revoke all on function public.cafeops_execute_readonly_query(text) from authenticated;
grant execute on function public.cafeops_execute_readonly_query(text) to service_role;
