from dataclasses import dataclass
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from app.supabase import db, SupabaseError

bearer = HTTPBearer(auto_error=False)

@dataclass
class Principal:
    user_id: str
    organization_id: str
    role: str
    accessible_locations: set[str]
    all_locations: bool

def get_principal(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> Principal:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Bearer access token required")
    try:
        user = db.auth_user(credentials.credentials)
        user_id = user.get("id")
        if not user_id:
            raise PermissionError("Invalid identity")
        rows = db.select("user_profiles", {
            "select": "user_id,organization_id,role,default_location_id",
            "user_id": f"eq.{user_id}",
            "limit": "1",
        })
        if not rows:
            raise PermissionError("User profile is not configured")
        profile = rows[0]
        access_rows = db.select("user_location_access", {
            "select": "location_id",
            "user_id": f"eq.{user_id}",
        })
        role = profile["role"]
        return Principal(
            user_id=user_id,
            organization_id=profile["organization_id"],
            role=role,
            accessible_locations={r["location_id"] for r in access_rows},
            all_locations=role in ("owner", "admin"),
        )
    except PermissionError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except SupabaseError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

def require_location(principal: Principal, location_id: str) -> None:
    if not principal.all_locations and location_id not in principal.accessible_locations:
        raise HTTPException(status_code=403, detail="No access to this location")

def scoped_location_filter(principal: Principal, requested: str | None) -> str | None:
    if requested:
        require_location(principal, requested)
        return requested
    if principal.all_locations:
        return None
    if not principal.accessible_locations:
        raise HTTPException(status_code=403, detail="No accessible locations configured")
    return None
