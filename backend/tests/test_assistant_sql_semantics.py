from pathlib import Path


def _source() -> str:
    return (
        Path(__file__).resolve().parent.parent
        / "app"
        / "assistant.py"
    ).read_text(encoding="utf-8")


def test_profit_prompt_requires_complete_recipe_version_cost():
    source = _source()
    assert "ALL recipe lines belonging to the applicable recipe_version" in source
    assert "Never select only one recipe row" in source


def test_profit_prompt_requires_independent_sales_aggregation():
    source = _source()
    assert "sales must be aggregated independently from recipe costs before joining the two aggregates" in source
    assert "prevents sales revenue from being multiplied by the number of recipe ingredient rows" in source


def test_profit_prompt_forbids_sales_aggregation_after_recipe_join():
    source = _source()
    assert "Never calculate SUM(sales_lines.line_total)" in source


def test_prompt_contains_canonical_period_profit_shape():
    source = _source()
    assert "period_sales` CTE aggregates sales by menu_item first" in source
    assert "recipe_costs` CTE computes complete recipe cost separately" in source


def test_prompt_requires_server_currency():
    source = _source()
    assert "organization currency supplied in SERVER CONTEXT" in source
