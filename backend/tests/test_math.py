from app.services import _num

def test_num_handles_none_and_numeric_strings():
    assert _num(None) == 0.0
    assert _num("2.5") == 2.5
    assert _num("not-a-number") == 0.0
