from app.services import calculate_monthly_inventory


def test_monthly_reconciliation_and_carry_forward():
    result = calculate_monthly_inventory(
        opening_balances=[
            {
                "location_id": "loc1",
                "ingredient_id": "ing1",
                "month": "2026-08",
                "quantity": 100,
            }
        ],
        receipts=[
            {
                "location_id": "loc1",
                "ingredient_id": "ing1",
                "date": "2026-08-05",
                "quantity": 50,
            },
            {
                "location_id": "loc1",
                "ingredient_id": "ing1",
                "date": "2026-09-05",
                "quantity": 20,
            },
        ],
        daily_consumption=[
            {
                "location_id": "loc1",
                "ingredient_id": "ing1",
                "date": "2026-08-10",
                "quantity": 40,
            },
            {
                "location_id": "loc1",
                "ingredient_id": "ing1",
                "date": "2026-09-10",
                "quantity": 30,
            },
        ],
    )

    monthly = result["monthly_reconciliation"]

    august = next(
        row for row in monthly
        if row["month"] == "2026-08"
    )
    september = next(
        row for row in monthly
        if row["month"] == "2026-09"
    )

    assert august["opening_quantity"] == 100
    assert august["received_quantity"] == 50
    assert august["consumed_quantity"] == 40
    assert august["expected_closing_quantity"] == 110
    assert august["adjustment_quantity"] == 40
    assert august["reconciled_closing_quantity"] == 150

    # September opening carries forward August reconciled close.
    assert september["opening_quantity"] == 150
    assert september["received_quantity"] == 20
    assert september["consumed_quantity"] == 30
    assert september["expected_closing_quantity"] == 140
    assert september["adjustment_quantity"] == 30
    assert september["reconciled_closing_quantity"] == 170


def test_daily_movements_include_receipts_and_consumption():
    result = calculate_monthly_inventory(
        opening_balances=[],
        receipts=[
            {
                "location_id": "loc1",
                "ingredient_id": "ing1",
                "date": "2026-08-05",
                "quantity": 10,
            }
        ],
        daily_consumption=[
            {
                "location_id": "loc1",
                "ingredient_id": "ing1",
                "date": "2026-08-05",
                "quantity": 3,
            }
        ],
    )

    movement = result["daily_movements"][0]

    assert movement["received_quantity"] == 10
    assert movement["consumed_quantity"] == 3
    assert movement["net_movement"] == 7