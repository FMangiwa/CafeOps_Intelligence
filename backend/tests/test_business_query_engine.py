from datetime import date
from types import SimpleNamespace

import pytest

from app.business_query_engine import bind_sql, validate_sql, _validate_tables


def principal():
    return SimpleNamespace(
        organization_id="ORG001",
        all_locations=True,
        accessible_locations=["LOC001", "LOC002"],
    )


def test_master_data_query_does_not_require_dates():
    sql = """
    SELECT m.menu_item_id, m.menu_item_name,
           m.list_price - SUM(r.quantity * i.unit_cost) AS estimated_profit
    FROM menu_items m
    JOIN recipes r ON r.menu_item_id = m.menu_item_id
    JOIN ingredients i ON i.ingredient_id = r.ingredient_id
    WHERE m.organization_id = :organization_id
    GROUP BY m.menu_item_id, m.menu_item_name, m.list_price
    ORDER BY estimated_profit DESC
    LIMIT 1
    """
    assert "menu_items" in validate_sql(sql)


def test_location_query_requires_location():
    sql = "SELECT transaction_id FROM sales_transactions WHERE organization_id = :organization_id AND location_id = :location_id LIMIT 1"
    assert "location_id" in validate_sql(sql)


def test_location_query_without_location_is_rejected():
    sql = "SELECT transaction_id FROM sales_transactions WHERE organization_id = :organization_id LIMIT 1"
    with pytest.raises(ValueError, match="location_id"):
        validate_sql(sql)


def test_date_placeholders_are_optional_but_valid_when_used():
    sql = "SELECT transaction_id FROM sales_transactions WHERE organization_id = :organization_id AND location_id = :location_id AND created_at::date BETWEEN :start_date AND :end_date LIMIT 1"
    bound = bind_sql(sql, principal(), "LOC001", date(2026,8,1), date(2026,8,31))
    assert "2026-08-01" in bound and "2026-08-31" in bound


def test_write_is_rejected():
    with pytest.raises(ValueError):
        validate_sql("DELETE FROM sales_transactions WHERE organization_id = :organization_id")


def test_unknown_table_is_rejected():
    with pytest.raises(ValueError, match="Non-approved"):
        validate_sql("SELECT id FROM secrets WHERE organization_id = :organization_id")


def test_wildcard_is_rejected():
    with pytest.raises(ValueError, match="Wildcard"):
        validate_sql("SELECT * FROM menu_items WHERE organization_id = :organization_id")


def test_ctes_are_not_treated_as_physical_tables():
    sql = """
    WITH latest_recipe_versions AS (
        SELECT organization_id, menu_item_id, MAX(recipe_version) AS recipe_version
        FROM recipes
        WHERE organization_id = :organization_id
        GROUP BY organization_id, menu_item_id
    ), item_costs AS (
        SELECT r.organization_id, r.menu_item_id, SUM(r.quantity * i.unit_cost) AS recipe_cost
        FROM recipes r
        JOIN latest_recipe_versions l
          ON l.organization_id = r.organization_id
         AND l.menu_item_id = r.menu_item_id
         AND l.recipe_version = r.recipe_version
        JOIN ingredients i
          ON i.ingredient_id = r.ingredient_id
         AND i.organization_id = r.organization_id
        WHERE r.organization_id = :organization_id
        GROUP BY r.organization_id, r.menu_item_id
    )
    SELECT mi.menu_item_id, mi.menu_item_name, mi.list_price - COALESCE(ic.recipe_cost, 0) AS estimated_profit
    FROM menu_items mi
    LEFT JOIN item_costs ic ON ic.organization_id = mi.organization_id AND ic.menu_item_id = mi.menu_item_id
    WHERE mi.organization_id = :organization_id
    ORDER BY estimated_profit DESC
    LIMIT 1
    """
    tables = _validate_tables(sql)
    assert "menu_items" in tables
    assert "item_costs" not in tables


def test_with_query_shape_is_accepted():
    sql = "WITH x AS (SELECT menu_item_id FROM menu_items WHERE organization_id = :organization_id) SELECT menu_item_id FROM x LIMIT 1"
    assert "WITH" in validate_sql(sql)


def test_lateral_subquery_is_not_treated_as_a_table():
    sql = """
    SELECT mi.menu_item_id, rc.recipe_cost
    FROM menu_items mi
    LEFT JOIN LATERAL (
        SELECT SUM(r.quantity * i.unit_cost) AS recipe_cost
        FROM recipes r
        JOIN ingredients i ON i.ingredient_id = r.ingredient_id
        WHERE r.organization_id = mi.organization_id
          AND r.menu_item_id = mi.menu_item_id
    ) rc ON TRUE
    WHERE mi.organization_id = :organization_id
    ORDER BY rc.recipe_cost DESC
    LIMIT 1
    """
    tables = _validate_tables(sql)
    assert tables == {"menu_items", "recipes", "ingredients"}
    assert "lateral" not in tables


def test_table_valued_functions_are_rejected():
    sql = "SELECT x FROM generate_series(1, 10) AS x WHERE :organization_id = :organization_id"
    with pytest.raises(ValueError, match="Table-valued functions"):
        validate_sql(sql)
