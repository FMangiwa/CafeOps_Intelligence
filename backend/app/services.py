from datetime import date, datetime, time, timedelta, timezone
from typing import Any
from app.supabase import db, SupabaseError
from app.security import Principal
from app.unit_conversion import convert_quantity
from collections import defaultdict
from datetime import date
from typing import Any


def calculate_monthly_inventory(
    opening_balances: list[dict[str, Any]],
    receipts: list[dict[str, Any]],
    daily_consumption: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Reconcile inventory month by month.

    Expected input fields:
      opening_balances:
        location_id, ingredient_id, month, quantity

      receipts:
        location_id, ingredient_id, date, quantity

      daily_consumption:
        location_id, ingredient_id, date, quantity

    All quantities must already use the same ingredient base unit.
    """

    def month_of(value: str) -> str:
        return date.fromisoformat(str(value)[:10]).strftime("%Y-%m")

    def number(value: Any) -> float:
        try:
            return float(value or 0)
        except (TypeError, ValueError):
            return 0.0

    receipt_totals = defaultdict(float)
    consumption_totals = defaultdict(float)
    daily_rows = defaultdict(
        lambda: {"receipts": 0.0, "consumption": 0.0}
    )

    # Aggregate receipts by location, ingredient, and month.
    for row in receipts:
        location_id = row["location_id"]
        ingredient_id = row["ingredient_id"]
        day = str(row["date"])[:10]
        month = month_of(day)
        quantity = number(row["quantity"])

        key = (location_id, ingredient_id, month)
        receipt_totals[key] += quantity

        daily_rows[
            (location_id, ingredient_id, day)
        ]["receipts"] += quantity

    # Aggregate recipe-based consumption.
    for row in daily_consumption:
        location_id = row["location_id"]
        ingredient_id = row["ingredient_id"]
        day = str(row["date"])[:10]
        month = month_of(day)
        quantity = number(row["quantity"])

        key = (location_id, ingredient_id, month)
        consumption_totals[key] += quantity

        daily_rows[
            (location_id, ingredient_id, day)
        ]["consumption"] += quantity

    # Preserve month-specific openings.
    openings = {
        (
            row["location_id"],
            row["ingredient_id"],
            str(row["month"])[:7],
        ): number(row["quantity"])
        for row in opening_balances
    }

    all_keys = (
        set(openings)
        | set(receipt_totals)
        | set(consumption_totals)
    )

    monthly_rows = []
    closing_by_ingredient = {}

    # Process each ingredient/location chronologically.
    groups = defaultdict(list)
    for location_id, ingredient_id, month in all_keys:
        groups[(location_id, ingredient_id)].append(month)

    for (location_id, ingredient_id), months in groups.items():
        previous_close = None

        for month in sorted(months):
            key = (location_id, ingredient_id, month)

            opening = (
                previous_close
                if previous_close is not None
                else openings.get(key, 0.0)
            )

            received = receipt_totals[key]
            consumed = consumption_totals[key]

            expected_close = opening + received - consumed

            # User-specified synthetic physical-count assumption:
            assumed_physical = opening + received

            adjustment = assumed_physical - expected_close
            reconciled_close = expected_close + adjustment

            monthly_rows.append({
                "location_id": location_id,
                "ingredient_id": ingredient_id,
                "month": month,
                "opening_quantity": round(opening, 3),
                "received_quantity": round(received, 3),
                "consumed_quantity": round(consumed, 3),
                "expected_closing_quantity": round(
                    expected_close, 3
                ),
                "assumed_physical_quantity": round(
                    assumed_physical, 3
                ),
                "adjustment_quantity": round(adjustment, 3),
                "reconciled_closing_quantity": round(
                    reconciled_close, 3
                ),
                "reconciliation_type": "assumed_physical_count",
            })

            previous_close = reconciled_close
            closing_by_ingredient[key] = reconciled_close

    daily_output = [
        {
            "location_id": location_id,
            "ingredient_id": ingredient_id,
            "date": day,
            "received_quantity": round(values["receipts"], 3),
            "consumed_quantity": round(
                values["consumption"], 3
            ),
            "net_movement": round(
                values["receipts"] - values["consumption"], 3
            ),
        }
        for (location_id, ingredient_id, day), values
        in sorted(daily_rows.items())
    ]

    return {
        "daily_movements": daily_output,
        "monthly_reconciliation": monthly_rows,
    }


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _location_params(principal: Principal, location_id: str | None) -> dict[str, str]:
    params = {"organization_id": f"eq.{principal.organization_id}"}
    if location_id:
        params["location_id"] = f"eq.{location_id}"
    elif not principal.all_locations:
        # PostgREST `in` filter; safe because IDs are read from the user's access table.
        ids = sorted(principal.accessible_locations)
        if not ids:
            return {"organization_id": f"eq.{principal.organization_id}", "location_id": "eq.__no_access__"}
        params["location_id"] = "in.(" + ",".join(ids) + ")"
    return params


def sales_summary(principal: Principal, start: date, end: date, location_id: str | None):
    """Return sales metrics using one PostgREST request with embedded line items."""
    txns = _sales_transactions_with_lines(principal, start, end, location_id)
    gross, discounts, net, tax, units, _ = _aggregate_sales_transactions(txns, start, end)
    return {
        "organization_id": principal.organization_id, "location_id": location_id,
        "start_date": start, "end_date": end,
        "transaction_count": len(txns),
        "units_sold": round(units, 2),
        "gross_sales": round(gross, 2), "discounts": round(discounts, 2),
        "net_sales": round(net, 2), "tax": round(tax, 2),
        "currency": txns[0].get("currency") if txns else None,
    }


def _sales_transactions_with_lines(
    principal: Principal,
    start: date,
    end: date,
    location_id: str | None,
):
    """Fetch completed/paid transactions and their line items.

    Prefer PostgREST embedded sales_lines to keep production requests efficient.
    If the response does not contain embedded lines, fall back to a direct
    sales_lines query. The fallback keeps the service compatible with clients
    and test doubles that return transaction and line data separately.
    """
    filters = _location_params(principal, location_id)
    filters.update({
        "select": (
            "transaction_id,location_id,created_at,currency,status,payment_status,"
            "sales_lines(menu_item_id,quantity,unit_price,discount_amount,line_total,tax_amount)"
        ),
        "status": "eq.completed",
        "payment_status": "eq.paid",
        "and": (
            f"(created_at.gte.{start.isoformat()}T00:00:00,"
            f"created_at.lt.{(end + timedelta(days=1)).isoformat()}T00:00:00)"
        ),
        "order": "created_at.asc",
        "limit": "10000",
    })

    txns = db.select("sales_transactions", filters)
    if not txns:
        return txns

    # Production responses normally include embedded sales_lines. Only use
    # the fallback when the relationship is absent from the returned rows.
    if all("sales_lines" in txn for txn in txns):
        return txns

    transaction_ids = [
        txn["transaction_id"]
        for txn in txns
        if txn.get("transaction_id")
    ]
    if not transaction_ids:
        return txns

    lines = []
    for offset in range(0, len(transaction_ids), 100):
        chunk = transaction_ids[offset:offset + 100]
        lines.extend(db.select("sales_lines", {
            "select": (
                "transaction_id,menu_item_id,quantity,unit_price,"
                "discount_amount,line_total,tax_amount"
            ),
            "transaction_id": "in.(" + ",".join(chunk) + ")",
            "limit": "10000",
        }))

    lines_by_transaction = defaultdict(list)
    for line in lines:
        lines_by_transaction[line.get("transaction_id")].append(line)

    for txn in txns:
        txn["sales_lines"] = lines_by_transaction.get(
            txn.get("transaction_id"),
            [],
        )

    return txns


def _aggregate_sales_transactions(txns: list[dict[str, Any]], start: date, end: date):
    totals = {
        (start + timedelta(days=i)).isoformat(): 0.0
        for i in range((end - start).days + 1)
    }
    gross = discounts = net = tax = units = 0.0
    for txn in txns:
        day = str(txn.get("created_at", ""))[:10]
        for line in txn.get("sales_lines") or []:
            quantity = _num(line.get("quantity"))
            gross += quantity * _num(line.get("unit_price"))
            discounts += _num(line.get("discount_amount"))
            line_net = _num(line.get("line_total"))
            net += line_net
            tax += _num(line.get("tax_amount"))
            units += quantity
            if day in totals:
                totals[day] += line_net
    return gross, discounts, net, tax, units, totals


def overview_summary(principal: Principal, start: date, end: date, location_id: str | None):
    """Return the Overview from one database-side aggregation RPC."""
    result = db.rpc(
        "report_overview",
        {
            "p_organization_id": principal.organization_id,
            "p_location_id": location_id,
            "p_start_date": start.isoformat(),
            "p_end_date": end.isoformat(),
        },
    )
    if not isinstance(result, dict):
        raise SupabaseError("Unexpected overview report response")
    return result


def sales_daily_summary(principal: Principal, start: date, end: date, location_id: str | None):
    """Return daily sales from the same single embedded sales query."""
    txns = _sales_transactions_with_lines(principal, start, end, location_id)
    _, _, _, _, _, totals = _aggregate_sales_transactions(txns, start, end)
    return {
        "organization_id": principal.organization_id,
        "location_id": location_id,
        "start_date": start,
        "end_date": end,
        "daily_sales": [
            {"date": day.isoformat(), "net_sales": round(totals[day.isoformat()], 2)}
            for day in (start + timedelta(days=i) for i in range((end - start).days + 1))
        ],
    }


def labor_summary(principal: Principal, start: date, end: date, location_id: str | None):
    params = _location_params(principal, location_id)
    params.update({
        "select": "work_date,hours_worked,labor_cost",
        "and": f"(work_date.gte.{start.isoformat()},work_date.lte.{end.isoformat()})",
        "limit": "10000",
    })
    rows = db.select("labor_records", params)
    hours = sum(_num(r["hours_worked"]) for r in rows)
    cost = sum(_num(r["labor_cost"]) for r in rows)
    sales = sales_summary(principal, start, end, location_id)["net_sales"]
    return {
        "organization_id": principal.organization_id, "location_id": location_id,
        "start_date": start, "end_date": end,
        "hours_worked": round(hours, 2), "labor_cost": round(cost, 2),
        "net_sales": sales,
        "labor_cost_pct": round(cost / sales * 100, 2) if sales else None,
        "sales_per_labor_hour": round(sales / hours, 2) if hours else None,
    }


def menu_costs(principal: Principal) -> list[dict[str, Any]]:
    """Return deterministic menu costing using current ingredient unit costs.

    Recipe quantities are converted to each ingredient's canonical base unit
    before applying the ingredient unit_cost. Historical ingredient price
    series are not available in the synthetic dataset, so the result is
    explicitly marked as estimated from current unit cost.
    """
    menus = db.select("menu_items", {
        "select": "menu_item_id,menu_item_name,list_price,active",
        "organization_id": f"eq.{principal.organization_id}",
        "active": "eq.true",
        "order": "menu_item_id.asc",
        "limit": "1000",
    })
    recipes = db.select("recipes", {
        "select": "menu_item_id,ingredient_id,quantity,unit,effective_from,effective_to",
        "organization_id": f"eq.{principal.organization_id}",
        "limit": "5000",
    })
    ingredients = db.select("ingredients", {
        "select": "ingredient_id,unit_cost,base_unit",
        "organization_id": f"eq.{principal.organization_id}",
        "limit": "2000",
    })

    ingredient_map = {row["ingredient_id"]: row for row in ingredients}
    by_menu: dict[str, list[dict[str, Any]]] = {}
    today = date.today()

    for recipe in recipes:
        start = date.fromisoformat(str(recipe["effective_from"])[:10])
        end = (
            date.fromisoformat(str(recipe["effective_to"])[:10])
            if recipe.get("effective_to")
            else None
        )
        if start <= today and (end is None or end >= today):
            by_menu.setdefault(recipe["menu_item_id"], []).append(recipe)

    result = []
    for menu in menus:
        lines = by_menu.get(menu["menu_item_id"], [])
        missing = not lines
        cost = 0.0

        if not missing:
            for recipe in lines:
                ingredient = ingredient_map.get(recipe["ingredient_id"])
                if not ingredient or ingredient.get("unit_cost") is None:
                    missing = True
                    break
                try:
                    quantity = convert_quantity(
                        recipe["quantity"],
                        recipe["unit"],
                        ingredient["base_unit"],
                    )
                except (ValueError, TypeError):
                    missing = True
                    break
                cost += float(quantity) * _num(ingredient["unit_cost"])

        price = _num(menu["list_price"])
        profit = None if missing else price - cost

        result.append({
            "menu_item_id": menu["menu_item_id"],
            "menu_item_name": menu["menu_item_name"],
            "list_price": price,
            "recipe_cost": round(cost, 4) if not missing else None,
            "gross_profit": round(profit, 2) if profit is not None else None,
            "gross_margin_pct": (
                round(profit / price * 100, 2)
                if profit is not None and price
                else None
            ),
            "costing_status": (
                "missing_or_incomplete_recipe"
                if missing
                else "estimated_from_current_unit_cost"
            ),
        })

    return result


def inventory_snapshot(
    principal: Principal,
    location_id: str | None,
    start_date: date | None = None,
    end_date: date | None = None,
):
    """Return a location-scoped theoretical inventory report.

    Inventory is derived from:
      opening balance at/before the selected period
      + recorded purchase receipts
      + signed non-opening inventory movements
      - theoretical recipe consumption from completed/paid sales.

    Opening-balance inventory transactions are deliberately excluded because
    the opening quantity is already stored in inventory_balances.
    """
    # If the caller does not specify a reporting period, use the most recent
    # inventory-balance month available to the location rather than the
    # machine's current calendar month. This makes the default report follow
    # the data's latest inventory snapshot.
    period_was_omitted = start_date is None and end_date is None

    if start_date is None:
        start_date = date.today().replace(day=1)
    if end_date is None:
        end_date = date.today()
    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date")

    base = _location_params(principal, location_id)

    # 1. Get the latest inventory balance on or before the report start.
    balances = db.select("inventory_balances", {
        **base,
        "select": (
            "inventory_balance_id,location_id,ingredient_id,"
            "as_of_date,opening_quantity,unit,reorder_point,target_quantity"
        ),
        "as_of_date": f"lte.{start_date.isoformat()}",
        "order": "as_of_date.desc",
        "limit": "5000",
    })

    ingredients = db.select("ingredients", {
        "select": "ingredient_id,ingredient_name,base_unit",
        "organization_id": f"eq.{principal.organization_id}",
        "limit": "2000",
    })
    ingredient_map = {row["ingredient_id"]: row for row in ingredients}

    latest_balance = {}
    for row in balances:
        key = (row["location_id"], row["ingredient_id"])
        if key not in latest_balance:
            latest_balance[key] = row

    # With no explicit dates, align the default period to the latest balance
    # month represented by the returned data.
    if period_was_omitted and latest_balance:
        latest_balance_date = max(
            date.fromisoformat(str(row["as_of_date"])[:10])
            for row in latest_balance.values()
        )
        start_date = latest_balance_date.replace(day=1)
        if start_date.month == 12:
            next_month = start_date.replace(
                year=start_date.year + 1,
                month=1,
                day=1,
            )
        else:
            next_month = start_date.replace(
                month=start_date.month + 1,
                day=1,
            )
        end_date = next_month - timedelta(days=1)

    if not latest_balance:
        return {
            "organization_id": principal.organization_id,
            "location_id": location_id,
            "start_date": start_date,
            "end_date": end_date,
            "ingredient_count": 0,
            "inventory": [],
            "daily_movements": [],
            "monthly_reconciliation": [],
        }

    # 2. Read inventory movements from each balance date through report end.
    #    Opening-balance movements are never counted again.
    earliest_balance_date = min(
        str(row["as_of_date"])[:10] for row in latest_balance.values()
    )

    movements = db.select("inventory_transactions", {
        **base,
        "select": (
            "location_id,ingredient_id,movement_date,"
            "movement_type,quantity_change,unit"
        ),
        "and": (
            f"(movement_date.gte.{earliest_balance_date},"
            f"movement_date.lte.{end_date.isoformat()})"
        ),
        "order": "movement_date.asc",
        "limit": "10000",
    })

    receipt_by_day = defaultdict(float)
    receipt_by_month = defaultdict(float)
    other_by_day = defaultdict(float)
    unit_mismatch_by_ingredient = defaultdict(int)

    # Movements before the selected start are used only to roll the opening
    # balance forward to start_date.
    pre_start_other = defaultdict(float)
    pre_start_receipts = defaultdict(float)

    for movement in movements:
        day = str(movement.get("movement_date") or "")[:10]
        if not day:
            continue

        loc = movement["location_id"]
        ingredient_id = movement["ingredient_id"]
        balance = latest_balance.get((loc, ingredient_id))
        if not balance:
            continue

        movement_type = str(
            movement.get("movement_type") or ""
        ).lower()

        # The opening quantity is already represented by inventory_balances.
        if movement_type == "opening_balance":
            continue

        ingredient = ingredient_map.get(ingredient_id, {})
        target_unit = (
            balance.get("unit")
            or ingredient.get("base_unit")
        )
        source_unit = movement.get("unit")

        if not target_unit or not source_unit:
            raise ValueError(
                f"Missing inventory unit for ingredient {ingredient_id} on {day}"
            )

        if str(source_unit) != str(target_unit):
            unit_mismatch_by_ingredient[ingredient_id] += 1

        qty = float(
            convert_quantity(
                movement.get("quantity_change", 0),
                source_unit,
                target_unit,
            )
        )

        key = (loc, ingredient_id, day)

        if movement_type == "purchase_receipt":
            if day >= start_date.isoformat():
                receipt_by_day[key] += qty
                receipt_by_month[
                    (loc, ingredient_id, day[:7])
                ] += qty
            else:
                pre_start_receipts[(loc, ingredient_id)] += qty
        else:
            if day >= start_date.isoformat():
                other_by_day[key] += qty
            else:
                pre_start_other[(loc, ingredient_id)] += qty

    # 3. Read sales headers, then sales lines directly.
    #    Do not use PostgREST embedded sales_lines here: direct line reads
    #    prevent relationship expansion/duplication from inflating usage.
    sales_filters = {
        **base,
        "select": "transaction_id,location_id,created_at,status,payment_status",
        "status": "eq.completed",
        "payment_status": "eq.paid",
        "and": (
            f"(created_at.gte.{start_date.isoformat()}T00:00:00,"
            f"created_at.lt.{(end_date + timedelta(days=1)).isoformat()}T00:00:00)"
        ),
        "order": "created_at.asc",
        "limit": "10000",
    }
    transactions = db.select("sales_transactions", sales_filters)
    transactions = [
        row for row in transactions
        if row.get("transaction_id")
    ]
    txn_by_id = {
        row["transaction_id"]: row
        for row in transactions
    }

    sales_lines = []
    transaction_ids = list(txn_by_id)
    for offset in range(0, len(transaction_ids), 100):
        chunk = transaction_ids[offset:offset + 100]
        if not chunk:
            continue
        sales_lines.extend(db.select("sales_lines", {
            "select": "transaction_id,menu_item_id,quantity",
            "transaction_id": "in.(" + ",".join(chunk) + ")",
            "limit": "10000",
        }))

    # 4. Effective recipes, converted into each ingredient's base/balance unit.
    recipes = db.select("recipes", {
        "select": (
            "menu_item_id,ingredient_id,quantity,unit,"
            "effective_from,effective_to"
        ),
        "limit": "10000",
    })

    recipes_by_menu = defaultdict(list)
    for recipe in recipes:
        recipes_by_menu[recipe["menu_item_id"]].append(recipe)

    consumption_by_day = defaultdict(float)
    consumption_by_month = defaultdict(float)

    for line in sales_lines:
        txn = txn_by_id.get(line.get("transaction_id"))
        if not txn:
            continue

        sale_day = str(txn["created_at"])[:10]
        loc = txn["location_id"]
        sold_qty = _num(line.get("quantity"))

        for recipe in recipes_by_menu.get(line.get("menu_item_id"), []):
            effective_from = str(
                recipe.get("effective_from") or ""
            )[:10]
            effective_to = str(
                recipe.get("effective_to") or "9999-12-31"
            )[:10]

            if not (effective_from <= sale_day <= effective_to):
                continue

            ingredient_id = recipe["ingredient_id"]
            ingredient = ingredient_map.get(ingredient_id, {})
            balance = latest_balance.get((loc, ingredient_id), {})
            target_unit = (
                balance.get("unit")
                or ingredient.get("base_unit")
            )
            recipe_unit = recipe.get("unit")

            if not target_unit or not recipe_unit:
                raise ValueError(
                    f"Missing recipe unit for ingredient {ingredient_id}"
                )

            recipe_qty = convert_quantity(
                recipe.get("quantity", 0),
                recipe_unit,
                target_unit,
            )
            consumed = sold_qty * float(recipe_qty)

            day_key = (loc, ingredient_id, sale_day)
            consumption_by_day[day_key] += consumed
            consumption_by_month[
                (loc, ingredient_id, sale_day[:7])
            ] += consumed

    # 5. Roll each opening balance forward to the selected start date.
    opening_at_start = {}
    for key, balance in latest_balance.items():
        opening = _num(balance.get("opening_quantity"))
        opening += pre_start_receipts.get(key, 0.0)
        opening += pre_start_other.get(key, 0.0)
        opening_at_start[key] = opening

    # 6. Build one inventory row per selected-location ingredient.
    inventory_rows = []
    for key, balance in sorted(
        latest_balance.items(),
        key=lambda item: (
            item[0][0],
            ingredient_map.get(item[0][1], {}).get("ingredient_name", ""),
        ),
    ):
        loc, ingredient_id = key
        if location_id is not None and loc != location_id:
            continue

        ingredient = ingredient_map.get(ingredient_id, {})
        unit = (
            balance.get("unit")
            or ingredient.get("base_unit")
            or ""
        )
        baseline = opening_at_start[key]

        receipts_added = sum(
            qty
            for (movement_loc, movement_ingredient, _day), qty
            in receipt_by_day.items()
            if movement_loc == loc
            and movement_ingredient == ingredient_id
        )
        consumed = sum(
            qty
            for (movement_loc, movement_ingredient, _day), qty
            in consumption_by_day.items()
            if movement_loc == loc
            and movement_ingredient == ingredient_id
        )
        other = sum(
            qty
            for (movement_loc, movement_ingredient, _day), qty
            in other_by_day.items()
            if movement_loc == loc
            and movement_ingredient == ingredient_id
        )

        expected_quantity = baseline + receipts_added + other - consumed
        reorder_point = _num(balance.get("reorder_point"))
        target_quantity = _num(balance.get("target_quantity"))
        mismatch_count = unit_mismatch_by_ingredient.get(ingredient_id, 0)

        inventory_rows.append({
            "location_id": loc,
            "ingredient_id": ingredient_id,
            "ingredient_name": ingredient.get(
                "ingredient_name", "Unknown"
            ),
            "unit": unit,
            "quantity": round(expected_quantity, 3),
            "reorder_point": round(reorder_point, 3),
            "target_quantity": round(target_quantity, 3),
            "below_reorder_point": expected_quantity < reorder_point,
            "baseline_quantity": round(baseline, 3),
            "purchase_receipts_added": round(receipts_added, 3),
            "inventory_status": (
                "unit_mismatch"
                if mismatch_count > 0
                else (
                    "below_reorder_point"
                    if expected_quantity < reorder_point
                    else "expected"
                )
            ),
            "unit_mismatch_count": mismatch_count,
            "note": (
                "Expected stock from opening balance, recorded receipts, "
                "theoretical recipe consumption, and signed other movements. "
                "Not a verified physical count."
            ),
        })

    # 7. Daily movement rows for the selected period.
    all_daily_keys = (
        set(receipt_by_day)
        | set(consumption_by_day)
        | set(other_by_day)
    )
    daily_rows = []

    for loc, ingredient_id, day in sorted(all_daily_keys):
        if location_id is not None and loc != location_id:
            continue

        received = receipt_by_day[(loc, ingredient_id, day)]
        consumed = consumption_by_day[(loc, ingredient_id, day)]
        other = other_by_day[(loc, ingredient_id, day)]
        ingredient = ingredient_map.get(ingredient_id, {})

        daily_rows.append({
            "location_id": loc,
            "ingredient_id": ingredient_id,
            "ingredient_name": ingredient.get(
                "ingredient_name", "Unknown"
            ),
            "date": day,
            "unit": ingredient.get("base_unit", ""),
            "received_quantity": round(received, 3),
            "consumed_quantity": round(consumed, 3),
            "other_movement_quantity": round(other, 3),
            "net_movement": round(
                received - consumed + other, 3
            ),
        })

    # 8. Monthly reconciliation. No physical-count values are fabricated.
    month_values = []
    cursor = start_date.replace(day=1)
    last_month = end_date.replace(day=1)
    while cursor <= last_month:
        month_values.append(cursor.strftime("%Y-%m"))
        if cursor.month == 12:
            cursor = cursor.replace(
                year=cursor.year + 1, month=1
            )
        else:
            cursor = cursor.replace(month=cursor.month + 1)

    monthly_rows = []
    for key, balance in sorted(latest_balance.items()):
        loc, ingredient_id = key
        if location_id is not None and loc != location_id:
            continue

        opening = opening_at_start[key]
        for month in month_values:
            if month == start_date.strftime("%Y-%m"):
                month_opening = opening
            else:
                previous_month = (
                    date.fromisoformat(month + "-01")
                    - timedelta(days=1)
                ).strftime("%Y-%m")
                prior = next(
                    (
                        row["expected_closing_quantity"]
                        for row in reversed(monthly_rows)
                        if row["location_id"] == loc
                        and row["ingredient_id"] == ingredient_id
                        and row["month"] == previous_month
                    ),
                    opening,
                )
                month_opening = prior

            received = receipt_by_month.get(
                (loc, ingredient_id, month), 0.0
            )

            consumed = consumption_by_month.get(
                (loc, ingredient_id, month), 0.0
            )

            other = sum(
                qty
                for (movement_loc, movement_ingredient, day), qty in other_by_day.items()
                if (
                    movement_loc == loc
                    and movement_ingredient == ingredient_id
                    and day[:7] == month
                )
            )

            expected_close = month_opening + received + other - consumed

            monthly_rows.append({
                "location_id": loc,
                "ingredient_id": ingredient_id,
                "month": month,
                "opening_quantity": round(month_opening, 3),
                "received_quantity": round(received, 3),
                "consumed_quantity": round(consumed, 3),
                "expected_closing_quantity": round(
                    expected_close, 3
                ),
                "assumed_physical_quantity": None,
                "adjustment_quantity": None,
                "reconciled_closing_quantity": None,
                "reconciliation_type": "expected_only",
            })

    return {
        "organization_id": principal.organization_id,
        "location_id": location_id,
        "start_date": start_date,
        "end_date": end_date,
        "ingredient_count": len(inventory_rows),
        "inventory": inventory_rows,
        "daily_movements": daily_rows,
        "monthly_reconciliation": monthly_rows,
    }

