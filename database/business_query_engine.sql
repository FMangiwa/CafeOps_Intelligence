-- PP08 LLM SQL execution gate.
-- The application validates the generated SQL before calling this function.
-- This function is intentionally limited to SELECT execution and is callable
-- only by the backend service role.

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

    -- Database-side defense in depth. The application performs the full allow-list validation.
    if p_sql !~* '^\s*select\b' then
        raise exception 'Only SELECT statements are allowed';
    end if;

    if p_sql ~* ';|\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|copy|call|do|merge|vacuum|refresh|execute|prepare|deallocate)\b' then
        raise exception 'Non-read-only SQL was rejected';
    end if;

    -- Parse and plan before execution. This catches SQL errors without first running the query.
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
