from datetime import date

import pytest
from fastapi import HTTPException

from app import main
from app.security import Principal


@pytest.fixture
def restricted_principal():
    return Principal(
        user_id="user-123",
        organization_id="ORG001",
        role="manager",
        accessible_locations={"LOC001"},
        all_locations=False,
    )


@pytest.mark.parametrize(
    "route",
    [
        main.sales_report,
        main.labor_report,
    ],
)
def test_report_rejects_end_date_before_start_date(route, restricted_principal):
    with pytest.raises(HTTPException) as exc:
        route(
            start_date=date(2026, 8, 31),
            end_date=date(2026, 8, 1),
            location_id="LOC001",
            p=restricted_principal,
        )

    assert exc.value.status_code == 422


@pytest.mark.parametrize(
    "route",
    [
        main.sales_report,
        main.labor_report,
    ],
)
def test_report_rejects_date_range_over_367_days(route, restricted_principal):
    with pytest.raises(HTTPException) as exc:
        route(
            start_date=date(2025, 1, 1),
            end_date=date(2026, 1, 3),
            location_id="LOC001",
            p=restricted_principal,
        )

    assert exc.value.status_code == 422


@pytest.mark.parametrize(
    "route",
    [
        main.sales_report,
        main.labor_report,
        main.inventory_report,
    ],
)
def test_location_scoped_report_denies_unassigned_location(
    route, restricted_principal
):
    with pytest.raises(HTTPException) as exc:
        if route in (main.sales_report, main.labor_report):
            route(
                start_date=date(2026, 8, 1),
                end_date=date(2026, 8, 31),
                location_id="LOC002",
                p=restricted_principal,
            )
        else:
            route(location_id="LOC002", p=restricted_principal)

    assert exc.value.status_code == 403
