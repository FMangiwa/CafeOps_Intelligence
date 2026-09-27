
from decimal import Decimal, InvalidOperation


class UnitConversionError(ValueError):
    """Raised when units cannot be safely converted."""


# Factors to canonical units: g, ml, and each.
_UNIT_GROUPS = {
    "mass": {
        "mg": Decimal("0.001"),
        "g": Decimal("1"),
        "kg": Decimal("1000"),
    },
    "volume": {
        "ml": Decimal("1"),
        "l": Decimal("1000"),
    },
    "count": {
        "each": Decimal("1"),
        "ea": Decimal("1"),
        "unit": Decimal("1"),
        "units": Decimal("1"),
        "piece": Decimal("1"),
        "pieces": Decimal("1"),
        "pc": Decimal("1"),
    },
}


def _normalize_unit(unit: str | None) -> str:
    if not unit:
        raise UnitConversionError("Missing unit")

    normalized = unit.strip().lower()

    aliases = {
        "gram": "g",
        "grams": "g",
        "kilogram": "kg",
        "kilograms": "kg",
        "milligram": "mg",
        "milligrams": "mg",
        "milliliter": "ml",
        "milliliters": "ml",
        "millilitre": "ml",
        "millilitres": "ml",
        "liter": "l",
        "liters": "l",
        "litre": "l",
        "litres": "l",
    }

    return aliases.get(normalized, normalized)


def convert_quantity(
    quantity: int | float | str | Decimal,
    from_unit: str,
    to_unit: str,
) -> Decimal:
    """Convert compatible units without guessing across dimensions."""

    source = _normalize_unit(from_unit)
    target = _normalize_unit(to_unit)

    if source == target:
        try:
            return Decimal(str(quantity))
        except InvalidOperation as exc:
            raise UnitConversionError(
                f"Invalid quantity: {quantity}"
            ) from exc

    source_group = next(
        (
            units
            for units in _UNIT_GROUPS.values()
            if source in units
        ),
        None,
    )
    target_group = next(
        (
            units
            for units in _UNIT_GROUPS.values()
            if target in units
        ),
        None,
    )

    if source_group is None or target_group is None:
        raise UnitConversionError(
            f"Unsupported unit conversion: {from_unit} -> {to_unit}"
        )

    if source_group is not target_group:
        raise UnitConversionError(
            f"Incompatible units: {from_unit} -> {to_unit}. "
            "Ingredient-specific conversion data is required."
        )

    try:
        value = Decimal(str(quantity))
        return value * source_group[source] / target_group[target]
    except InvalidOperation as exc:
        raise UnitConversionError(
            f"Invalid quantity: {quantity}"
        ) from exc