from datetime import date
from fastapi import FastAPI, Depends, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.security import Principal, get_principal, require_location
from app.supabase import db, SupabaseError
from app.schemas import SalesSummary, LaborSummary, MenuCostRow, InventoryRow
from app.services import sales_summary, sales_daily_summary, labor_summary, menu_costs, inventory_snapshot, overview_summary
from app.assistant import assistant_chat
from pydantic import BaseModel, Field
from dotenv import load_dotenv


load_dotenv()

app = FastAPI(title=settings.api_title, version=settings.api_version)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    location_id: str
    start_date: date
    end_date: date


@app.post("/v1/assistant")
def assistant_endpoint(
    request: AssistantRequest,
    p: Principal = Depends(get_principal),
):
    if request.end_date < request.start_date:
        raise HTTPException(
            status_code=422,
            detail="Invalid date range",
        )

    if (request.end_date - request.start_date).days > 366:
        raise HTTPException(
            status_code=422,
            detail="Invalid date range (maximum 367 calendar days)",
        )

    require_location(p, request.location_id)

    return assistant_chat(
        principal=p,
        message=request.message,
        location_id=request.location_id,
        start_date=request.start_date,
        end_date=request.end_date,
    )


@app.get("/health")
def health():
    return {"status": "ok", "service": settings.api_title, "version": settings.api_version}

@app.get("/v1/me")
def me(p: Principal = Depends(get_principal)):
    return {"user_id": p.user_id, "organization_id": p.organization_id, "role": p.role,
            "all_locations": p.all_locations, "accessible_locations": sorted(p.accessible_locations)}

@app.get("/v1/locations")
def locations(p: Principal = Depends(get_principal)):
    try:
        rows = db.select("locations", {
            "select": "location_id,location_name,status",
            "organization_id": f"eq.{p.organization_id}", "status": "eq.active",
            "order": "location_name.asc", "limit": "1000",
        })
        if not p.all_locations:
            rows = [r for r in rows if r["location_id"] in p.accessible_locations]
        return rows
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/v1/reports/sales", response_model=SalesSummary)
def sales_report(start_date: date, end_date: date, location_id: str | None = None,
                 p: Principal = Depends(get_principal)):
    if end_date < start_date or (end_date - start_date).days > 366:
        raise HTTPException(status_code=422, detail="Invalid date range (maximum 367 calendar days)")
    if location_id:
        require_location(p, location_id)
    try:
        return sales_summary(p, start_date, end_date, location_id)
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/v1/reports/overview")
def overview_report(start_date: date, end_date: date, location_id: str | None = None,
                   p: Principal = Depends(get_principal)):
    if end_date < start_date or (end_date - start_date).days > 366:
        raise HTTPException(status_code=422, detail="Invalid date range (maximum 367 calendar days)")
    if location_id:
        require_location(p, location_id)
    try:
        return overview_summary(p, start_date, end_date, location_id)
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/v1/reports/sales/daily")
def sales_daily_report(start_date: date, end_date: date, location_id: str | None = None,
                      p: Principal = Depends(get_principal)):
    if end_date < start_date or (end_date - start_date).days > 366:
        raise HTTPException(status_code=422, detail="Invalid date range (maximum 367 calendar days)")
    if location_id:
        require_location(p, location_id)
    try:
        return sales_daily_summary(p, start_date, end_date, location_id)
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/v1/reports/labor", response_model=LaborSummary)
def labor_report(start_date: date, end_date: date, location_id: str | None = None,
                 p: Principal = Depends(get_principal)):
    if end_date < start_date or (end_date - start_date).days > 366:
        raise HTTPException(status_code=422, detail="Invalid date range (maximum 367 calendar days)")
    if location_id:
        require_location(p, location_id)
    try:
        return labor_summary(p, start_date, end_date, location_id)
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/v1/reports/menu-costs", response_model=list[MenuCostRow])
def menu_cost_report(p: Principal = Depends(get_principal)):
    try:
        return menu_costs(p)
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.get("/v1/reports/inventory")
def inventory_report(
    start_date: date | None = None,
    end_date: date | None = None,
    location_id: str | None = None,
    p: Principal = Depends(get_principal),
):
    if location_id:
        require_location(p, location_id)
    try:
        return inventory_snapshot(p, location_id)
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
