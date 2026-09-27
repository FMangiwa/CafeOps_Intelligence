from __future__ import annotations

import json
import os
import re
from datetime import date
from typing import Any

import httpx
from fastapi import HTTPException
from dotenv import load_dotenv

from app.security import Principal, require_location
from app.supabase import db
from app.business_query_engine import execute_validated_sql, get_schema_context

load_dotenv()

OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = os.getenv("OPENAI_ASSISTANT_MODEL", "gpt-5.6-luna")
MAX_SQL_ATTEMPTS = 2

BASE_INSTRUCTIONS = """
You are CaféOps SQL Analyst, a read-only café business assistant.

Your job is to answer CaféOps operational questions using the supplied database schema. For an in-domain business question, generate ONE PostgreSQL SELECT statement. For a question outside the CaféOps operational domain, answer that the café database does not contain that information and do not call the SQL tool.

SQL RULES:
- Generate SELECT SQL only. A WITH ... SELECT query is allowed.
- Never generate INSERT, UPDATE, DELETE, DDL, transaction control, COPY, EXECUTE, or dynamic SQL.
- Never access pg_catalog, information_schema, or any system schema.
- Use only tables and columns present in the supplied schema.
- Always enforce tenant isolation with :organization_id.
- For location-scoped tables, enforce the selected location with :location_id.
- Use :start_date and :end_date only when the question requires a reporting period. Do NOT invent date filters for master-data questions.
- Never replace server placeholders with literal organization, location, or date values.
- Use explicit columns; never SELECT *.
- Use joins and aggregations that directly answer the question.
- For a single ranking answer, ORDER BY the requested metric DESC and LIMIT 1.
- Do not use UNION, INTERSECT, or EXCEPT.
- Do not include a semicolon or SQL comments.

BUSINESS DEFINITIONS:
- Gross sales = sum(sales_lines.line_total) for completed and paid sales_transactions.
- AOV = gross sales / completed paid transaction count.
- Recipe cost = sum(recipe quantity × ingredient unit_cost) across ALL recipe lines belonging to the applicable recipe_version.
- Estimated profit per sale = menu_items.list_price - complete applicable recipe cost.
- Period estimated gross profit contribution = period sales - theoretical recipe COGS.
- Theoretical recipe COGS = sold quantity × complete applicable recipe ingredient quantity × ingredient unit_cost.

RECIPE VERSION RULES:
- recipes contains multiple ingredient rows for a recipe_version. Never select only one recipe row when calculating a menu item's recipe cost.
- To identify the applicable version, first determine the MAX(recipe_version) for the menu_item within the required effective date scope, then aggregate ALL ingredient rows for that version.
- For a period-profit query, sales must be aggregated independently from recipe costs before joining the two aggregates. This prevents sales revenue from being multiplied by the number of recipe ingredient rows.
- Never calculate SUM(sales_lines.line_total) or SUM(sales_lines.quantity) in a SELECT scope after joining that same sales scope directly to recipe ingredient rows.
- If recipe costs are joined to period sales, the recipe-cost relation must contain one row per menu_item (or one row per menu_item and sale date/version key) before joining to sales.
- Preferred period-profit shape: `period_sales` CTE aggregates sales by menu_item first; `recipe_costs` CTE computes complete recipe cost separately; the final SELECT joins those two one-row-per-menu-item relations.
- Preferred current menu-margin shape: `latest_recipe_versions` identifies the latest version per menu_item; `recipe_costs` then sums ALL ingredient rows for that version; only afterward join to menu_items.
- Profit is theoretical/estimated gross profit, not net profit.
- Do not fabricate physical inventory counts.
- Monetary values must be presented using the organization currency supplied in SERVER CONTEXT; do not invent a currency symbol.

SEMANTIC DISTINCTION:
- "most profitable menu item" / "highest profit" without period-performance wording means highest estimated profit per sale.
- "made/generated/contributed the most profit this month/period" means highest total period estimated gross profit contribution.

Return SQL through the `submit_readonly_sql` tool only for in-domain CaféOps questions. Do not call the tool for out-of-domain questions. Do not explain the SQL to the user during SQL generation. If the question is outside the CaféOps domain, clearly state that the CaféOps assistant only has access to CaféOps operational data.
""".strip()


def _location_name(principal: Principal, location_id: str) -> str:
    rows = db.select("locations", {
        "organization_id": f"eq.{principal.organization_id}",
        "location_id": f"eq.{location_id}",
        "select": "location_id,location_name",
        "limit": "1",
    })
    return str(rows[0].get("location_name")) if rows and rows[0].get("location_name") else location_id


def _extract_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str) and payload["output_text"].strip():
        return payload["output_text"].strip()
    parts: list[str] = []
    for item in payload.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                parts.append(content["text"])
    return "\n".join(parts).strip()


def _looks_like_sql(text: str) -> bool:
    low = text.strip().lower()
    return bool(re.match(r"^(?:with\b[\s\S]*\bselect\b|select\b)", low))


def _tool_definition() -> list[dict[str, Any]]:
    return [{
        "type": "function",
        "name": "submit_readonly_sql",
        "description": "Submit exactly one PostgreSQL SELECT statement generated from the supplied schema. The server validates and executes it before returning rows.",
        "parameters": {
            "type": "object",
            "properties": {"sql": {"type": "string"}},
            "required": ["sql"],
            "additionalProperties": False,
        },
    }]


def _call_openai(client: httpx.Client, api_key: str, body: dict[str, Any]) -> dict[str, Any]:
    response = client.post(OPENAI_RESPONSES_URL, headers={
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }, json=body)
    if response.status_code >= 400:
        raise HTTPException(status_code=502, detail=f"OpenAI request failed ({response.status_code}): {response.text[:1000]}")
    return response.json()


def assistant_chat(principal: Principal, message: str, location_id: str, start_date: date, end_date: date) -> dict[str, Any]:
    require_location(principal, location_id)
    if not message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty.")
    if len(message) > 4000:
        raise HTTPException(status_code=422, detail="Message is too long.")
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="OPENAI_API_KEY is not configured on the backend.")

    schema = get_schema_context()
    location_name = _location_name(principal, location_id)
    schema_text = json.dumps(schema, ensure_ascii=False, indent=2)
    org_rows = db.select("organizations", {
        "organization_id": f"eq.{principal.organization_id}",
        "select": "organization_id,currency",
        "limit": "1",
    })
    currency = str(org_rows[0].get("currency") or "GBP") if org_rows else "GBP"
    context = f"Selected location: {location_name} ({location_id}). Organization currency: {currency}. Reporting period available when needed: {start_date.isoformat()} through {end_date.isoformat()}."
    user_input = f"DATABASE SCHEMA:\n{schema_text}\n\nSERVER CONTEXT:\n{context}\n\nUSER QUESTION:\n{message.strip()}"

    input_items: list[dict[str, Any]] = [{"role": "user", "content": [{"type": "input_text", "text": user_input}]}]
    tools = _tool_definition()
    trace: list[dict[str, Any]] = []

    with httpx.Client(timeout=60.0) as client:
        for attempt in range(MAX_SQL_ATTEMPTS):
            payload = _call_openai(client, api_key, {
                "model": DEFAULT_MODEL,
                "instructions": BASE_INSTRUCTIONS,
                "input": input_items,
                "tools": tools,
                "tool_choice": "auto",
                "max_output_tokens": 900,
            })
            calls = [x for x in payload.get("output", []) if x.get("type") == "function_call" and x.get("name") == "submit_readonly_sql"]
            if not calls:
                answer = _extract_text(payload)
                if answer and not _looks_like_sql(answer):
                    return {"answer": answer, "location_id": location_id, "location_name": location_name, "start_date": start_date, "end_date": end_date, "tools_used": trace, "model": DEFAULT_MODEL, "read_only": True}
                raise HTTPException(status_code=502, detail="The assistant returned neither a valid SQL tool call nor a safe natural-language answer.")

            input_items.extend(payload.get("output", []))
            call = calls[0]
            args = json.loads(call.get("arguments") or "{}")
            sql = str(args.get("sql") or "")
            try:
                result = execute_validated_sql(sql, principal, location_id, start_date, end_date, question=message)
                result_payload = {"ok": True, **result}
                trace.append({"stage": "sql_execute", "attempt": attempt + 1})
            except Exception as exc:
                result_payload = {"ok": False, "validation_or_execution_error": str(exc)}
                trace.append({"stage": "sql_rejected", "attempt": attempt + 1})

            input_items.append({"type": "function_call_output", "call_id": call["call_id"], "output": json.dumps(result_payload, default=str)})

            if result_payload.get("ok"):
                # One final LLM call explains only the validated result.
                final = _call_openai(client, api_key, {
                    "model": DEFAULT_MODEL,
                    "instructions": BASE_INSTRUCTIONS + "\n\nThe SQL has already been validated and executed. Explain only the returned result. Do not generate another SQL query. Do not invent numbers, currency, dates, entities, or business facts. If the result contains no rows, say that there is no matching data. Never fabricate an answer.",
                    "input": input_items + [{"role": "user", "content": [{"type": "input_text", "text": "Explain the validated query result concisely for the café operator."}]}],
                    "max_output_tokens": 500,
                })
                answer = _extract_text(final)
                if not answer:
                    raise HTTPException(status_code=502, detail="The assistant returned no explanation for the query result.")
                return {"answer": answer, "location_id": location_id, "location_name": location_name, "start_date": start_date, "end_date": end_date, "tools_used": trace, "model": DEFAULT_MODEL, "read_only": True}

            if attempt + 1 < MAX_SQL_ATTEMPTS:
                input_items.append({"role": "user", "content": [{"type": "input_text", "text": "The validator rejected the generated SQL. Regenerate ONE corrected read-only SELECT using the schema and the validator error. Do not discuss the error with the user."}]})

    raise HTTPException(status_code=502, detail="The generated SQL could not be validated after two attempts.")
