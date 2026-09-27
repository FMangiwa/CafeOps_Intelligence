from datetime import date
from pydantic import BaseModel, Field, model_validator

class DateRange(BaseModel):
    start_date: date
    end_date: date
    location_id: str | None = None

    @model_validator(mode="after")
    def validate_range(self):
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        if (self.end_date - self.start_date).days > 366:
            raise ValueError("Date range cannot exceed 367 calendar days")
        return self

class SalesSummary(BaseModel):
    organization_id: str
    location_id: str | None
    start_date: date
    end_date: date
    transaction_count: int
    units_sold: float
    gross_sales: float
    discounts: float
    net_sales: float
    tax: float
    currency: str | None = None
    note: str = "Computed from imported sales_lines; confirm source semantics before operational use."

class LaborSummary(BaseModel):
    organization_id: str
    location_id: str | None
    start_date: date
    end_date: date
    hours_worked: float
    labor_cost: float
    net_sales: float | None
    labor_cost_pct: float | None
    sales_per_labor_hour: float | None

class MenuCostRow(BaseModel):
    menu_item_id: str
    menu_item_name: str
    list_price: float
    recipe_cost: float | None
    gross_profit: float | None
    gross_margin_pct: float | None
    costing_status: str

class InventoryRow(BaseModel):
    ingredient_id: str
    ingredient_name: str
    unit: str
    quantity: float
    reorder_point: float
    target_quantity: float
    below_reorder_point: bool

    # Inventory calculation audit fields
    baseline_quantity: float
    purchase_receipts_added: float
    inventory_status: str
    unit_mismatch_count: int
    note: str
