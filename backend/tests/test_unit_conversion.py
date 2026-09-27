
import pytest

from app.unit_conversion import (
    UnitConversionError,
    convert_quantity,
)


def test_kg_to_g():
    assert convert_quantity(2, "kg", "g") == 2000


def test_g_to_kg():
    assert convert_quantity(2500, "g", "kg") == 2.5


def test_l_to_ml():
    assert convert_quantity(1.5, "L", "ml") == 1500


def test_incompatible_units_raise_error():
    with pytest.raises(UnitConversionError):
        convert_quantity(1, "kg", "L")


def test_unknown_units_raise_error():
    with pytest.raises(UnitConversionError):
        convert_quantity(1, "bag", "g")