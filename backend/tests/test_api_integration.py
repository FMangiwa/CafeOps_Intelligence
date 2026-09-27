
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app import main
from app.security import Principal, get_principal


@pytest.fixture
def principal():
    return Principal(
        user_id="user-123",
        organization_id="ORG001",
        role="manager",
        accessible_locations={"LOC001"},
        all_locations=False,
    )


@pytest.fixture
def client(principal):
    main.app.dependency_overrides[get_principal] = lambda: principal

    with TestClient(main.app) as test_client:
        yield test_client

    main.app.dependency_overrides.clear()


def test_health_endpoint(client):
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_me_endpoint_returns_authenticated_principal(client):
    response = client.get("/v1/me")

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user-123",
        "organization_id": "ORG001",
        "role": "manager",
        "all_locations": False,
        "accessible_locations": ["LOC001"],
    }


def test_me_endpoint_requires_authentication():
    with TestClient(main.app) as test_client:
        response = test_client.get("/v1/me")

    assert response.status_code == 401


def test_sales_endpoint_rejects_invalid_date_range(client):
    response = client.get(
        "/v1/reports/sales",
        params={
            "start_date": "2026-08-31",
            "end_date": "2026-08-01",
            "location_id": "LOC001",
        },
    )

    assert response.status_code == 422


def test_labor_endpoint_rejects_invalid_date_range(client):
    response = client.get(
        "/v1/reports/labor",
        params={
            "start_date": "2026-08-31",
            "end_date": "2026-08-01",
            "location_id": "LOC001",
        },
    )

    assert response.status_code == 422


def test_sales_endpoint_rejects_unassigned_location(client):
    response = client.get(
        "/v1/reports/sales",
        params={
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "location_id": "LOC002",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "No access to this location"


def test_labor_endpoint_rejects_unassigned_location(client):
    response = client.get(
        "/v1/reports/labor",
        params={
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "location_id": "LOC002",
        },
    )

    assert response.status_code == 403


def test_inventory_endpoint_rejects_unassigned_location(client):
    response = client.get(
        "/v1/reports/inventory",
        params={"location_id": "LOC002"},
    )

    assert response.status_code == 403


def test_sales_endpoint_rejects_malformed_date(client):
    response = client.get(
        "/v1/reports/sales",
        params={
            "start_date": "not-a-date",
            "end_date": "2026-08-31",
        },
    )

    assert response.status_code == 422



def test_sales_endpoint_returns_valid_response(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "sales_summary",
        lambda p, start_date, end_date, location_id: {
            "organization_id": "ORG001",
            "location_id": "LOC001",
            "start_date": start_date,
            "end_date": end_date,
            "transaction_count": 10,
            "units_sold": 25.0,
            "gross_sales": 150.0,
            "discounts": 5.0,
            "net_sales": 145.0,
            "tax": 24.17,
            "currency": "GBP",
        },
    )

    response = client.get(
        "/v1/reports/sales",
        params={
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "location_id": "LOC001",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["organization_id"] == "ORG001"
    assert data["location_id"] == "LOC001"
    assert data["transaction_count"] == 10
    assert data["net_sales"] == 145.0
    assert data["currency"] == "GBP"


def test_labor_endpoint_returns_valid_response(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "labor_summary",
        lambda p, start_date, end_date, location_id: {
            "organization_id": "ORG001",
            "location_id": "LOC001",
            "start_date": start_date,
            "end_date": end_date,
            "hours_worked": 40.0,
            "labor_cost": 600.0,
            "net_sales": 1200.0,
            "labor_cost_pct": 50.0,
            "sales_per_labor_hour": 30.0,
        },
    )

    response = client.get(
        "/v1/reports/labor",
        params={
            "start_date": "2026-08-01",
            "end_date": "2026-08-31",
            "location_id": "LOC001",
        },
    )

    assert response.status_code == 200
    data = response.json()
    assert data["hours_worked"] == 40.0
    assert data["labor_cost"] == 600.0
    assert data["labor_cost_pct"] == 50.0
    assert data["sales_per_labor_hour"] == 30.0


def test_menu_costs_endpoint_returns_valid_response(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "menu_costs",
        lambda p: [
            {
                "menu_item_id": "MENU001",
                "menu_item_name": "Latte",
                "list_price": 5.0,
                "recipe_cost": 0.36,
                "gross_profit": 4.64,
                "gross_margin_pct": 92.8,
                "costing_status": "estimated_from_current_unit_cost",
            }
        ],
    )

    response = client.get("/v1/reports/menu-costs")

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["menu_item_name"] == "Latte"
    assert data[0]["recipe_cost"] == 0.36
    assert data[0]["gross_profit"] == 4.64


def test_inventory_endpoint_returns_valid_response(client, monkeypatch):
    monkeypatch.setattr(
        main,
        "inventory_snapshot",
        lambda p, location_id: [
            {
                "ingredient_id": "ING001",
                "ingredient_name": "Coffee beans",
                "unit": "g",
                "quantity": 1250.0,
                "reorder_point": 500.0,
                "target_quantity": 2000.0,
                "below_reorder_point": False,
                "baseline_quantity": 1000.0,
                "purchase_receipts_added": 250.0,
                "inventory_status": "partial_estimate_missing_consumption",
                "unit_mismatch_count": 0,
                "note": "Partial estimate; consumption, waste, and adjustments are not included.",
            }
        ],
    )

    response = client.get(
        "/v1/reports/inventory",
        params={"location_id": "LOC001"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["ingredient_id"] == "ING001"
    assert data[0]["quantity"] == 1250.0
    assert data[0]["baseline_quantity"] == 1000.0
    assert data[0]["purchase_receipts_added"] == 250.0
    assert data[0]["unit_mismatch_count"] == 0



@pytest.mark.parametrize(
    ("endpoint", "service_name", "params"),
    [
        (
            "/v1/reports/sales",
            "sales_summary",
            {
                "start_date": "2026-08-01",
                "end_date": "2026-08-31",
                "location_id": "LOC001",
            },
        ),
        (
            "/v1/reports/labor",
            "labor_summary",
            {
                "start_date": "2026-08-01",
                "end_date": "2026-08-31",
                "location_id": "LOC001",
            },
        ),
        (
            "/v1/reports/menu-costs",
            "menu_costs",
            {},
        ),
        (
            "/v1/reports/inventory",
            "inventory_snapshot",
            {"location_id": "LOC001"},
        ),
    ],
)
def test_report_endpoints_return_503_on_supabase_error(
    client, monkeypatch, endpoint, service_name, params
):
    def raise_database_error(*args, **kwargs):
        raise main.SupabaseError("Database service is unavailable")

    monkeypatch.setattr(main, service_name, raise_database_error)

    response = client.get(endpoint, params=params)

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Database service is unavailable"
    }


def test_locations_endpoint_returns_503_on_supabase_error(
    client, monkeypatch
):
    def raise_database_error(*args, **kwargs):
        raise main.SupabaseError("Database service is unavailable")

    monkeypatch.setattr(main.db, "select", raise_database_error)

    response = client.get("/v1/locations")

    assert response.status_code == 503
    assert response.json() == {
        "detail": "Database service is unavailable"
    }



from unittest.mock import Mock


def test_authentication_flow_with_valid_token(monkeypatch):
    monkeypatch.setattr(
        main.db,
        "auth_user",
        Mock(return_value={"id": "user-123"}),
    )

    def mock_select(table, params):
        if table == "user_profiles":
            return [{
                "user_id": "user-123",
                "organization_id": "ORG001",
                "role": "manager",
                "default_location_id": "LOC001",
            }]
        if table == "user_location_access":
            return [{"location_id": "LOC001"}]
        raise AssertionError(f"Unexpected table: {table}")

    monkeypatch.setattr(main.db, "select", mock_select)

    with TestClient(main.app) as test_client:
        response = test_client.get(
            "/v1/me",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 200
    assert response.json() == {
        "user_id": "user-123",
        "organization_id": "ORG001",
        "role": "manager",
        "all_locations": False,
        "accessible_locations": ["LOC001"],
    }


def test_authentication_flow_returns_401_when_profile_missing(
    monkeypatch,
):
    monkeypatch.setattr(
        main.db,
        "auth_user",
        Mock(return_value={"id": "user-123"}),
    )
    monkeypatch.setattr(main.db, "select", Mock(return_value=[]))

    with TestClient(main.app) as test_client:
        response = test_client.get(
            "/v1/me",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 401


def test_authentication_flow_returns_503_when_supabase_unavailable(
    monkeypatch,
):
    monkeypatch.setattr(
        main.db,
        "auth_user",
        Mock(side_effect=main.SupabaseError(
            "Authentication service is unavailable"
        )),
    )

    with TestClient(main.app) as test_client:
        response = test_client.get(
            "/v1/me",
            headers={"Authorization": "Bearer test-token"},
        )

    assert response.status_code == 503


