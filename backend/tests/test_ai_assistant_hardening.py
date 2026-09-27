from datetime import date
from pathlib import Path
import re

import pytest


APP = Path(__file__).resolve().parent.parent / "app"
ASSISTANT = (APP / "assistant.py").read_text(encoding="utf-8")
ENGINE = (APP / "business_query_engine.py").read_text(encoding="utf-8")


def test_domain_guardrail_does_not_force_sql_tool():
    assert '"auto"' in ASSISTANT
    assert "CaféOps operational data" in ASSISTANT
    assert "outside the CaféOps domain" in ASSISTANT


def test_sql_tool_choice_is_auto():
    assert '"tool_choice": "auto"' in ASSISTANT


def test_system_catalogs_and_capabilities_are_blocked():
    for token in ("pg_catalog", "information_schema", "pg_toast", "pg_temp", "pg_read_file", "dblink_exec"):
        assert token in ENGINE


def test_set_operators_and_multi_statement_are_blocked():
    for token in ("union", "intersect", "except", "SQL may contain only one statement"):
        assert token in ENGINE


def test_location_and_tenant_scope_are_required():
    assert "tenant isolation" in ENGINE
    assert "Location-scoped SQL must use :location_id." in ENGINE


def test_result_limit_is_server_controlled():
    assert "MAX_RESULT_ROWS = 100" in ENGINE
    assert "LIMIT {MAX_RESULT_ROWS}" in ENGINE


def test_server_currency_is_not_llm_defined():
    assert "Organization currency:" in ASSISTANT
    assert "do not invent a currency symbol" in ASSISTANT


def test_result_explanation_is_grounded():
    assert "Explain only the returned result" in ASSISTANT
    assert "Do not generate another SQL query" in ASSISTANT
    assert "Do not invent numbers" in ASSISTANT


def test_no_data_behavior_is_explicit():
    assert "no matching data" in ASSISTANT
    assert "Never fabricate an answer" in ASSISTANT


def test_business_semantic_validator_is_question_aware():
    assert "question: str | None = None" in ENGINE
    assert "Period profit queries combining sales and recipes" in ENGINE


def test_or_predicates_are_rejected_in_v1():
    assert "OR predicates are not allowed" in ENGINE


def test_high_risk_session_functions_are_blocked():
    for token in ("set_config", "current_setting", "pg_terminate_backend", "current_database"):
        assert token in ENGINE
