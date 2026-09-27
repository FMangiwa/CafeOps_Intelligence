-- PP08 CaféOps Intelligence
-- Database-side Overview reporting optimization
-- Apply in Supabase SQL Editor after the V1 schema.

-- 1) Supporting indexes for the report workload.
create index if not exists idx_sales_txn_overview_completed_paid
    on public.sales_transactions (organization_id, location_id, created_at)
    where status = 'completed' and payment_status = 'paid';

create index if not exists idx_ingredients_org
    on public.ingredients (organization_id, ingredient_id);

create index if not exists idx_inventory_balances_location_ingredient_date
    on public.inventory_balances (organization_id, location_id, ingredient_id, as_of_date desc);

-- 2) One database-side report function.
-- FastAPI validates the authenticated user's organization/location before calling this RPC.
-- The function itself receives an explicit organization_id and never accepts unrestricted table filters.
create or replace function public.report_overview(
    p_organization_id text,
    p_location_id text,
    p_start_date date,
    p_end_date date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with
sales_txns as (
    select
        st.transaction_id,
        st.created_at,
        st.currency
    from public.sales_transactions st
    where st.organization_id = p_organization_id
      and (p_location_id is null or st.location_id = p_location_id)
      and st.created_at >= p_start_date::timestamptz
      and st.created_at < (p_end_date + 1)::timestamptz
      and st.status = 'completed'
      and st.payment_status = 'paid'
),
recipe_costs as (
    select
        r.menu_item_id,
        sum(r.quantity * coalesce(i.unit_cost, 0))::numeric as recipe_cost,
        count(*)::integer as recipe_components,
        count(i.ingredient_id)::integer as priced_components
    from public.recipes r
    join public.ingredients i
      on i.ingredient_id = r.ingredient_id
     and i.organization_id = p_organization_id
    where r.organization_id = p_organization_id
      and r.effective_from <= p_end_date
      and (r.effective_to is null or r.effective_to >= p_start_date)
    group by r.menu_item_id
),
all_sales as (
    select
        coalesce(sum(sl.quantity * sl.unit_price), 0)::numeric as gross_sales,
        coalesce(sum(sl.discount_amount), 0)::numeric as discounts,
        coalesce(sum(sl.line_total), 0)::numeric as net_sales,
        coalesce(sum(sl.tax_amount), 0)::numeric as tax,
        coalesce(sum(sl.quantity), 0)::numeric as units_sold,
        coalesce(sum(
            case
                when rc.recipe_components > 0 and rc.recipe_components = rc.priced_components
                then sl.quantity * rc.recipe_cost
                else 0
            end
        ), 0)::numeric as theoretical_cogs,
        count(*) filter (where rc.menu_item_id is null or rc.recipe_components <> rc.priced_components)::integer as uncosted_sales_lines
    from sales_txns st
    join public.sales_lines sl on sl.transaction_id = st.transaction_id
    left join recipe_costs rc on rc.menu_item_id = sl.menu_item_id
),
daily_sales as (
    select
        d::date as report_date,
        coalesce(sum(sl.line_total), 0)::numeric as net_sales
    from generate_series(p_start_date, p_end_date, interval '1 day') d
    left join sales_txns st
        on st.created_at >= d
       and st.created_at < d + interval '1 day'
    left join public.sales_lines sl on sl.transaction_id = st.transaction_id
    group by d::date
    order by d::date
),
labor as (
    select
        coalesce(sum(lr.hours_worked), 0)::numeric as hours_worked,
        coalesce(sum(lr.labor_cost), 0)::numeric as labor_cost
    from public.labor_records lr
    where lr.organization_id = p_organization_id
      and (p_location_id is null or lr.location_id = p_location_id)
      and lr.work_date between p_start_date and p_end_date
),
inventory as (
    select count(distinct ib.ingredient_id)::integer as ingredient_count
    from public.inventory_balances ib
    where ib.organization_id = p_organization_id
      and (p_location_id is null or ib.location_id = p_location_id)
),
metrics as (
    select
        (select count(*)::integer from sales_txns) as transaction_count,
        a.units_sold,
        a.gross_sales,
        a.discounts,
        a.net_sales,
        a.tax,
        a.net_sales as labor_net_sales,
        a.theoretical_cogs,
        a.uncosted_sales_lines,
        l.hours_worked,
        l.labor_cost,
        i.ingredient_count,
        (select currency from sales_txns order by created_at asc limit 1) as currency
    from all_sales a
    cross join labor l
    cross join inventory i
)
select jsonb_build_object(
    'organization_id', p_organization_id,
    'location_id', p_location_id,
    'start_date', p_start_date,
    'end_date', p_end_date,
    'sales', jsonb_build_object(
        'transaction_count', transaction_count,
        'units_sold', round(units_sold, 2),
        'gross_sales', round(gross_sales, 2),
        'discounts', round(discounts, 2),
        'net_sales', round(net_sales, 2),
        'tax', round(tax, 2),
        'currency', currency,
        'theoretical_cogs', round(theoretical_cogs, 2),
        'gross_profit', case
            when uncosted_sales_lines = 0
            then round(net_sales - theoretical_cogs, 2)
            else null
        end,
        'gross_margin_pct', case
            when uncosted_sales_lines = 0 and net_sales <> 0
            then round((net_sales - theoretical_cogs) / net_sales * 100, 2)
            else null
        end,
        'uncosted_sales_lines', uncosted_sales_lines
    ),
    'daily_sales', coalesce((
        select jsonb_agg(
            jsonb_build_object(
                'date', ds.report_date,
                'net_sales', round(ds.net_sales, 2)
            ) order by ds.report_date
        )
        from daily_sales ds
    ), '[]'::jsonb),
    'labor', jsonb_build_object(
        'hours_worked', round(hours_worked, 2),
        'labor_cost', round(labor_cost, 2),
        'net_sales', round(labor_net_sales, 2),
        'labor_cost_pct', case
            when labor_net_sales <> 0
            then round(labor_cost / labor_net_sales * 100, 2)
            else null
        end,
        'sales_per_labor_hour', case
            when hours_worked <> 0
            then round(labor_net_sales / hours_worked, 2)
            else null
        end
    ),
    'inventory', jsonb_build_object(
        'ingredient_count', ingredient_count
    ),
    'profit', jsonb_build_object(
        'theoretical_cogs', round(theoretical_cogs, 2),
        'gross_profit', case
            when uncosted_sales_lines = 0
            then round(net_sales - theoretical_cogs, 2)
            else null
        end,
        'gross_margin_pct', case
            when uncosted_sales_lines = 0 and net_sales <> 0
            then round((net_sales - theoretical_cogs) / net_sales * 100, 2)
            else null
        end,
        'labor_cost', round(labor_cost, 2),
        'contribution_after_labor', case
            when uncosted_sales_lines = 0
            then round(net_sales - theoretical_cogs - labor_cost, 2)
            else null
        end,
        'uncosted_sales_lines', uncosted_sales_lines,
        'basis', 'Gross profit = net sales - theoretical recipe COGS; contribution after labor additionally subtracts recorded labor cost.'
    )
)
from metrics;
$$;

-- The function is intended to be called only by the server-side FastAPI layer.
revoke execute on function public.report_overview(text, text, date, date) from public, anon, authenticated;
grant execute on function public.report_overview(text, text, date, date) to service_role;
