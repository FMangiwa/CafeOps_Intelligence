from __future__ import annotations

import json
import os
import re
from datetime import date
from typing import Any

import httpx
from fastapi import HTTPException

from app.security import Principal, require_location

MAX_SQL_LENGTH = 12000
MAX_RESULT_ROWS = 100
ALLOWED_TABLES = {
    "organizations", "locations", "users", "employees", "menu_items", "ingredients",
    "recipes", "inventory_balances", "inventory_transactions", "vendors", "vendor_items",
    "purchase_orders", "purchase_order_lines", "invoices", "invoice_lines",
    "sales_transactions", "sales_lines", "shifts", "labor_records", "sync_jobs", "metric_definitions",
}
LOCATION_SCOPED_TABLES = {
    "sales_transactions", "labor_records", "shifts", "purchase_orders", "invoices",
    "inventory_balances", "inventory_transactions", "sync_jobs",
}
BLOCKED_WORDS = {
    "insert", "update", "delete", "drop", "alter", "truncate", "create", "grant", "revoke",
    "comment", "copy", "call", "do", "merge", "vacuum", "refresh", "execute", "prepare",
    "deallocate", "set", "reset", "transaction", "begin", "commit", "rollback",
}
BLOCKED_FUNCTIONS = {
    "pg_read_file", "pg_ls_dir", "pg_execute_server_program", "dblink_connect", "dblink_exec",
    "lo_import", "lo_export", "pg_sleep", "set_config", "current_setting",
    "pg_backend_pid", "pg_terminate_backend", "pg_cancel_backend", "current_user",
    "session_user", "current_database", "current_schema",
}
TABLE_RE = re.compile(
    r"\b(?:from|join)\s+(?:only\s+)?(?!lateral\s*\()(?:lateral\s+)?(?:[\"a-zA-Z_][\w\"]*\.)?[\"a-zA-Z_][\w\"]*(?!\s*\()",
    re.I,
)
IDENTIFIER_RE = re.compile(r"\b[a-z_][a-z0-9_]*\b", re.I)
PLACEHOLDER_RE = re.compile(r":(organization_id|location_id|start_date|end_date)\b")


def _clean_sql(sql: str) -> str:
    s = sql.strip()
    if s.startswith("```sql") and s.endswith("```"):
        s = s[6:-3].strip()
    elif s.startswith("```") and s.endswith("```"):
        s = s[3:-3].strip()
    if not s:
        raise ValueError("Generated SQL is empty.")
    if len(s) > MAX_SQL_LENGTH:
        raise ValueError("Generated SQL is too long.")
    if ";" in s or "--" in s or "/*" in s or "*/" in s:
        raise ValueError("SQL may contain only one statement and no comments.")
    return s


def _extract_ctes(sql: str) -> set[str]:
    # A CTE name is a query-local relation, not a physical business table.
    # The pattern is intentionally limited to `name AS (` so normal table
    # aliases are not treated as CTEs.
    return {m.group(1).lower() for m in re.finditer(r"\b([a-z_][a-z0-9_]*)\s+as\s*\(", sql, re.I)}


def _extract_tables(sql: str) -> set[str]:
    tables: set[str] = set()
    ctes = _extract_ctes(sql)
    for match in TABLE_RE.finditer(sql):
        fragment = match.group(0)
        name = fragment.split()[-1].strip('"').lower()
        if "." in name:
            name = name.split(".")[-1].strip('"')
        if name not in ctes:
            tables.add(name)
    return tables


def _validate_select_shape(sql: str) -> None:
    low = sql.lower()
    if not re.match(r"^\s*(?:with\b[\s\S]*\bselect\b|select\b)", low):
        raise ValueError("Only SELECT queries are allowed.")
    if re.search(r"\b(union|intersect|except)\b", low):
        raise ValueError("Set operators are not allowed.")
    if re.search(r"\bor\b", low):
        raise ValueError("OR predicates are not allowed; use IN, CASE, or separate aggregate logic instead.")
    if re.search(r"\bselect\s+(?:distinct\s+)?(?:[a-z_][a-z0-9_]*\.)?\*", low):
        raise ValueError("Wildcard SELECT projections are not allowed.")
    for word in BLOCKED_WORDS:
        if re.search(rf"\b{re.escape(word)}\b", low):
            raise ValueError(f"Blocked SQL keyword: {word}.")
    for fn in BLOCKED_FUNCTIONS:
        if re.search(rf"\b{re.escape(fn)}\s*\(", low):
            raise ValueError(f"Blocked SQL function: {fn}.")
    for schema in ("pg_catalog", "information_schema", "pg_toast", "pg_temp"):
        if re.search(rf"\b{schema}\s*\.", low):
            raise ValueError(f"System schema is not allowed: {schema}.")
    # PostgreSQL table-valued functions in FROM/JOIN are intentionally out of scope.
    # They are not physical business tables and can expose capabilities outside the
    # approved relational model. LATERAL itself is allowed when it wraps a subquery.
    if re.search(r"\b(?:from|join)\s+(?:only\s+)?(?:lateral\s+)?[a-z_][a-z0-9_]*(?:\.[a-z_][a-z0-9_]*)?\s*\(", low):
        raise ValueError("Table-valued functions are not allowed.")


def _validate_tables(sql: str) -> set[str]:
    tables = _extract_tables(sql)
    if not tables:
        raise ValueError("SQL must reference an approved business table.")
    unknown = tables - ALLOWED_TABLES
    if unknown:
        raise ValueError(f"Non-approved tables: {sorted(unknown)}")
    return tables


def _validate_scope(sql: str, tables: set[str]) -> None:
    low = sql.lower()
    if ":organization_id" not in low:
        raise ValueError("SQL must use :organization_id for tenant isolation.")
    if not re.search(r"\b(?:[a-z_][a-z0-9_]*\.)?organization_id\s*=\s*:organization_id\b", low):
        raise ValueError("SQL must filter organization_id with :organization_id.")

    if tables & LOCATION_SCOPED_TABLES:
        if ":location_id" not in low:
            raise ValueError("Location-scoped SQL must use :location_id.")
        if not re.search(r"\b(?:[a-z_][a-z0-9_]*\.)?location_id\s*=\s*:location_id\b", low):
            raise ValueError("SQL must filter location_id with :location_id.")


def _validate_date_placeholders(sql: str) -> None:
    low = sql.lower()
    used = set(PLACEHOLDER_RE.findall(low))
    if "start_date" not in used and "end_date" not in used:
        return
    if "start_date" in used and not re.search(r":start_date\b", low):
        raise ValueError("Invalid :start_date placeholder.")
    if "end_date" in used and not re.search(r":end_date\b", low):
        raise ValueError("Invalid :end_date placeholder.")


def _validate_business_semantics(sql: str, question: str | None = None) -> None:
    if not question:
        return
    q = question.lower()
    low = sql.lower()
    period_profit = any(phrase in q for phrase in (
        "most profit", "highest profit", "generated the most profit",
        "made the most profit", "profit this month", "profit this period",
        "gross profit",
    ))
    if period_profit and "sales_lines" in low and "recipes" in low:
        if "period_sales" not in low or "recipe_costs" not in low:
            raise ValueError(
                "Period profit queries combining sales and recipes must aggregate sales and recipe costs independently before joining them."
            )
        if not re.search(r"period_sales[\s\S]*group\s+by", low):
            raise ValueError("Period profit sales must be aggregated by menu item before recipe joins.")
        if not re.search(r"recipe_costs[\s\S]*sum\s*\(", low):
            raise ValueError("Recipe costs must aggregate all applicable recipe ingredient rows.")
        if re.search(r"sum\s*\(\s*sales_lines\.line_total\s*\)", low) and "period_sales" not in low:
            raise ValueError("Sales revenue must be aggregated independently from recipe ingredient rows.")


def validate_sql(sql: str, question: str | None = None) -> str:
    cleaned = _clean_sql(sql)
    _validate_select_shape(cleaned)
    tables = _validate_tables(cleaned)
    _validate_scope(cleaned, tables)
    _validate_date_placeholders(cleaned)
    _validate_business_semantics(cleaned, question)
    return cleaned


def bind_sql(sql: str, principal: Principal, location_id: str, start_date: date, end_date: date, question: str | None = None) -> str:
    require_location(principal, location_id)
    if end_date < start_date:
        raise ValueError("End date cannot be before start date.")
    if (end_date - start_date).days > 366:
        raise ValueError("Date range cannot exceed 367 days.")
    cleaned = validate_sql(sql, question=question)
    values = {
        ":organization_id": "'" + principal.organization_id.replace("'", "''") + "'",
        ":location_id": "'" + location_id.replace("'", "''") + "'",
        ":start_date": "DATE '" + start_date.isoformat() + "'",
        ":end_date": "DATE '" + end_date.isoformat() + "'",
    }
    bound = PLACEHOLDER_RE.sub(lambda m: values[m.group(0)], cleaned)
    return f"SELECT * FROM ({bound}) AS cafeops_result LIMIT {MAX_RESULT_ROWS}"


def _post_rpc(supabase_url: str, service_key: str, function_name: str, payload: dict[str, Any]) -> Any:
    url = supabase_url.rstrip("/") + f"/rest/v1/rpc/{function_name}"
    headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"}
    try:
        with httpx.Client(timeout=30.0) as client:
            response = client.post(url, headers=headers, json=payload)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Supabase query service is unavailable.") from exc
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"Supabase rejected the query: {response.text[:1000]}")
    return response.json()


def get_schema_context() -> dict[str, Any]:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise HTTPException(status_code=503, detail="Supabase server credentials are not configured.")
    schema = _post_rpc(url, key, "cafeops_get_query_schema", {})
    return {"tables": schema if isinstance(schema, list) else []}


def execute_validated_sql(sql: str, principal: Principal, location_id: str, start_date: date, end_date: date, question: str | None = None) -> dict[str, Any]:
    bound = bind_sql(sql, principal, location_id, start_date, end_date, question=question)
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise HTTPException(status_code=503, detail="Supabase server credentials are not configured.")
    result = _post_rpc(url, key, "cafeops_execute_readonly_query", {"p_sql": bound})
    rows = result if isinstance(result, list) else result.get("rows", result)
    if not isinstance(rows, list):
        rows = [rows]
    return {"rows": rows[:MAX_RESULT_ROWS], "row_count": len(rows[:MAX_RESULT_ROWS]), "read_only": True}
