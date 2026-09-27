from datetime import date

import pytest

from app import services
from app.security import Principal


@pytest.fixture
def principal():
    return Principal(
        user_id="user-123",
        organization_id="ORG001",
        role="manager",
        accessible_locations={"LOC001"},
        all_locations=False,
    )


def test_sales_summary_calculates_totals_and_filters(principal, monkeypatch):
    calls = []

    def fake_select(table, params):
        calls.append((table, params))

        if table == "sales_transactions":
            return [
                {
                    "transaction_id": "TXN001",
                    "created_at": "2026-08-10T10:00:00",
                    "currency": "GBP",
                    "status": "completed",
                    "payment_status": "paid",
                }
            ]

        if table == "sales_lines":
            return [
                {
                    "transaction_id": "TXN001",
                    "quantity": 2,
                    "unit_price": 5.00,
                    "discount_amount": 1.00,
                    "line_total": 9.00,
                    "tax_amount": 1.50,
                },
                {
                    "transaction_id": "TXN001",
                    "quantity": 1,
                    "unit_price": 3.00,
                    "discount_amount": 0.00,
                    "line_total": 3.00,
                    "tax_amount": 0.50,
                },
            ]

        raise AssertionError(f"Unexpected table: {table}")

    monkeypatch.setattr(services.db, "select", fake_select)

    result = services.sales_summary(
        principal,
        date(2026, 8, 1),
        date(2026, 8, 31),
        "LOC001",
    )

    assert result["transaction_count"] == 1
    assert result["units_sold"] == 3
    assert result["gross_sales"] == 13.00
    assert result["discounts"] == 1.00
    assert result["net_sales"] == 12.00
    assert result["tax"] == 2.00
    assert result["currency"] == "GBP"

    txn_params = calls[0][1]
    assert txn_params["organization_id"] == "eq.ORG001"
    assert txn_params["location_id"] == "eq.LOC001"
    assert txn_params["status"] == "eq.completed"
    assert txn_params["payment_status"] == "eq.paid"
    assert "created_at.gte.2026-08-01T00:00:00" in txn_params["and"]
    assert "created_at.lt.2026-09-01T00:00:00" in txn_params["and"]


def test_labor_summary_calculates_metrics(principal, monkeypatch):
    def fake_select(table, params):
        if table == "labor_records":
            return [
                {"work_date": "2026-08-01", "hours_worked": 8, "labor_cost": 120},
                {"work_date": "2026-08-02", "hours_worked": 4, "labor_cost": 80},
            ]

        if table == "sales_transactions":
            return [
                {
                    "transaction_id": "TXN001",
                    "created_at": "2026-08-01T10:00:00",
                    "currency": "GBP",
                    "status": "completed",
                    "payment_status": "paid",
                }
            ]

        if table == "sales_lines":
            return [
                {
                    "transaction_id": "TXN001",
                    "quantity": 1,
                    "unit_price": 500,
                    "discount_amount": 0,
                    "line_total": 500,
                    "tax_amount": 0,
                }
            ]

        raise AssertionError(f"Unexpected table: {table}")

    monkeypatch.setattr(services.db, "select", fake_select)

    result = services.labor_summary(
        principal,
        date(2026, 8, 1),
        date(2026, 8, 31),
        "LOC001",
    )

    assert result["hours_worked"] == 12
    assert result["labor_cost"] == 200
    assert result["net_sales"] == 500
    assert result["labor_cost_pct"] == 40.00
    assert result["sales_per_labor_hour"] == 41.67


def test_labor_summary_handles_zero_sales_and_hours(principal, monkeypatch):
    def fake_select(table, params):
        if table == "labor_records":
            return []

        if table in ("sales_transactions", "sales_lines"):
            return []

        raise AssertionError(f"Unexpected table: {table}")

    monkeypatch.setattr(services.db, "select", fake_select)

    result = services.labor_summary(
        principal,
        date(2026, 8, 1),
        date(2026, 8, 31),
        "LOC001",
    )

    assert result["hours_worked"] == 0
    assert result["labor_cost"] == 0
    assert result["net_sales"] == 0
    assert result["labor_cost_pct"] is None
    assert result["sales_per_labor_hour"] is None


def test_menu_costs_calculates_current_recipe_cost(principal, monkeypatch):
    from datetime import date

    today = date.today().isoformat()

    def fake_select(table, params):
        if table == "menu_items":
            return [{
                "menu_item_id": "MENU001",
                "menu_item_name": "Latte",
                "list_price": 5.00,
                "active": True,
            }]

        if table == "recipes":
            return [{
                "menu_item_id": "MENU001",
                "ingredient_id": "ING001",
                "quantity": 18,
                "unit": "g",
                "effective_from": today,
                "effective_to": None,
            }]

        if table == "ingredients":
            return [{
                "ingredient_id": "ING001",
                "unit_cost": 0.02,
                "base_unit": "g",
            }]

        raise AssertionError(f"Unexpected table: {table}")

    monkeypatch.setattr(services.db, "select", fake_select)

    result = services.menu_costs(principal)

    assert len(result) == 1
    assert result[0]["recipe_cost"] == 0.36
    assert result[0]["gross_profit"] == 4.64
    assert result[0]["gross_margin_pct"] == 92.8
    assert result[0]["costing_status"] == "estimated_from_current_unit_cost"


def test_menu_costs_flags_missing_recipe(principal, monkeypatch):
    def fake_select(table, params):
        if table == "menu_items":
            return [{
                "menu_item_id": "MENU002",
                "menu_item_name": "Seasonal drink",
                "list_price": 6.00,
                "active": True,
            }]

        if table == "recipes":
            return []

        if table == "ingredients":
            return []

        raise AssertionError(f"Unexpected table: {table}")

    monkeypatch.setattr(services.db, "select", fake_select)

    result = services.menu_costs(principal)

    assert result[0]["recipe_cost"] is None
    assert result[0]["gross_profit"] is None
    assert result[0]["gross_margin_pct"] is None
    assert result[0]["costing_status"] == "missing_or_incomplete_recipe"


def test_inventory_snapshot_adds_later_matching_unit_receipts(
    principal, monkeypatch
):
    def fake_select(table, params):
        if table == "sales_transactions":
            return []

        if table == "sales_lines":
            return []

        if table == "recipes":
            return []

        if table == "inventory_balances":
            return [{
                "inventory_balance_id": "BAL001",
                "location_id": "LOC001",
                "ingredient_id": "ING001",
                "as_of_date": "2026-08-01",
                "opening_quantity": 1000,
                "unit": "g",
                "reorder_point": 500,
                "target_quantity": 1500,
            }]

        if table == "ingredients":
            return [{
                "ingredient_id": "ING001",
                "ingredient_name": "Espresso beans",
                "base_unit": "g",
            }]

        if table == "inventory_transactions":
            return [
                {
                    "location_id": "LOC001",
                    "ingredient_id": "ING001",
                    "movement_date": "2026-08-05",
                    "movement_type": "purchase_receipt",
                    "quantity_change": 250,
                    "unit": "g",
                },
                {
                    "location_id": "LOC001",
                    "ingredient_id": "ING001",
                    "movement_date": "2026-08-06",
                    "movement_type": "purchase_receipt",
                    "quantity_change": 2,
                    "unit": "kg",
                },
                {
                    "location_id": "LOC001",
                    "ingredient_id": "ING001",
                    "movement_date": "2026-08-07",
                    "movement_type": "waste",
                    "quantity_change": -100,
                    "unit": "g",
                },
                {
                    "location_id": "LOC001",
                    "ingredient_id": "ING001",
                    "movement_date": "2026-08-01",
                    "movement_type": "purchase_receipt",
                    "quantity_change": 50,
                    "unit": "g",
                },
            ]

        raise AssertionError(f"Unexpected table: {table}")

    monkeypatch.setattr(services.db, "select", fake_select)

    result = services.inventory_snapshot(principal, "LOC001")

    assert "daily_movements" in result
    assert "monthly_reconciliation" in result

    assert len(result["monthly_reconciliation"]) == 1

    from pprint import pprint

    row = result["monthly_reconciliation"][0]

    assert row["opening_quantity"] == 1000
    assert row["received_quantity"] == 2300
    assert row["assumed_physical_quantity"] is None
    assert row["consumed_quantity"] == 0
    assert row["expected_closing_quantity"] == 3200
    assert row["adjustment_quantity"] is None
    assert row["reconciled_closing_quantity"] is None
    assert row["reconciliation_type"] == "expected_only"