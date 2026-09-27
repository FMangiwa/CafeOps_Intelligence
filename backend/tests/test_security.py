import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import security
from app.main import health
from app.security import Principal
from app.supabase import SupabaseError


def test_health_returns_ok():
    result = health()

    assert result["status"] == "ok"
    assert "service" in result
    assert "version" in result


def test_get_principal_without_credentials_returns_401():
    with pytest.raises(HTTPException) as exc:
        security.get_principal(None)

    assert exc.value.status_code == 401
    assert exc.value.detail == "Bearer access token required"


def test_get_principal_invalid_token_returns_401(monkeypatch):
    def fake_auth_user(token):
        raise PermissionError("Invalid or expired access token")

    monkeypatch.setattr(security.db, "auth_user", fake_auth_user)

    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="invalid-token",
    )

    with pytest.raises(HTTPException) as exc:
        security.get_principal(credentials)

    assert exc.value.status_code == 401


def test_get_principal_supabase_error_returns_503(monkeypatch):
    def fake_auth_user(token):
        raise SupabaseError("Database service is unavailable")

    monkeypatch.setattr(security.db, "auth_user", fake_auth_user)

    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="test-token",
    )

    with pytest.raises(HTTPException) as exc:
        security.get_principal(credentials)

    assert exc.value.status_code == 503


def test_get_principal_builds_profile_and_location_access(monkeypatch):
    monkeypatch.setattr(
        security.db,
        "auth_user",
        lambda token: {"id": "user-123"},
    )

    def fake_select(table, params):
        if table == "user_profiles":
            return [{
                "user_id": "user-123",
                "organization_id": "ORG001",
                "role": "manager",
                "default_location_id": "LOC001",
            }]
        if table == "user_location_access":
            return [
                {"location_id": "LOC001"},
                {"location_id": "LOC002"},
            ]
        raise AssertionError(f"Unexpected table: {table}")

    monkeypatch.setattr(security.db, "select", fake_select)

    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="test-token",
    )

    principal = security.get_principal(credentials)

    assert principal.user_id == "user-123"
    assert principal.organization_id == "ORG001"
    assert principal.role == "manager"
    assert principal.accessible_locations == {"LOC001", "LOC002"}
    assert principal.all_locations is False


def test_get_principal_without_profile_returns_401(monkeypatch):
    monkeypatch.setattr(
        security.db,
        "auth_user",
        lambda token: {"id": "user-123"},
    )
    monkeypatch.setattr(
        security.db,
        "select",
        lambda table, params: [],
    )

    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials="test-token",
    )

    with pytest.raises(HTTPException) as exc:
        security.get_principal(credentials)

    assert exc.value.status_code == 401
    assert exc.value.detail == "User profile is not configured"


def test_require_location_allows_assigned_location():
    principal = Principal(
        user_id="user-123",
        organization_id="ORG001",
        role="manager",
        accessible_locations={"LOC001"},
        all_locations=False,
    )

    assert security.require_location(principal, "LOC001") is None


def test_require_location_denies_unassigned_location():
    principal = Principal(
        user_id="user-123",
        organization_id="ORG001",
        role="manager",
        accessible_locations={"LOC001"},
        all_locations=False,
    )

    with pytest.raises(HTTPException) as exc:
        security.require_location(principal, "LOC002")

    assert exc.value.status_code == 403


@pytest.mark.parametrize("role", ["owner", "admin"])
def test_require_location_allows_all_locations_for_admin_roles(role):
    principal = Principal(
        user_id="user-123",
        organization_id="ORG001",
        role=role,
        accessible_locations=set(),
        all_locations=True,
    )

    assert security.require_location(principal, "LOC999") is None
