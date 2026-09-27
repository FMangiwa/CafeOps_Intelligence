from typing import Any

import requests

from app.config import settings


class SupabaseError(RuntimeError):
    pass


class SupabaseREST:
    PAGE_SIZE = 1000
    MAX_ROWS = 100000

    def __init__(self):
        self.base = settings.supabase_url.rstrip("/") + "/rest/v1"
        self.headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {settings.supabase_service_role_key}",
            "Content-Type": "application/json",
        }

    def _ensure_configured(self):
        if not settings.supabase_url or not settings.supabase_service_role_key:
            raise SupabaseError(
                "Set SUPABASE_URL and server-only SUPABASE_SERVICE_ROLE_KEY in backend .env"
            )

    def select(
        self,
        table: str,
        params: dict[str, Any],
    ) -> list[dict[str, Any]]:
        self._ensure_configured()

        query_params = dict(params)
        requested_limit = query_params.pop("limit", None)

        try:
            explicit_limit = int(requested_limit) if requested_limit is not None else None
        except (TypeError, ValueError) as exc:
            raise SupabaseError("Invalid query limit") from exc

        if explicit_limit is not None and explicit_limit < 0:
            raise SupabaseError("Query limit cannot be negative")

        max_rows = (
            min(explicit_limit, self.MAX_ROWS)
            if explicit_limit is not None
            else self.MAX_ROWS
        )

        results: list[dict[str, Any]] = []
        offset = 0

        while offset < max_rows:
            page_limit = min(self.PAGE_SIZE, max_rows - offset)
            page_params = {
                **query_params,
                "limit": page_limit,
                "offset": offset,
            }

            try:
                response = requests.get(
                    f"{self.base}/{table}",
                    headers=self.headers,
                    params=page_params,
                    timeout=30,
                )
            except requests.RequestException as exc:
                raise SupabaseError("Database service is unavailable") from exc

            if not response.ok:
                detail = response.text.strip()
                if len(detail) > 500:
                    detail = detail[:500] + "…"
                message = f"Database query failed ({response.status_code})"
                if detail:
                    message += f": {detail}"
                raise SupabaseError(message)

            data = response.json()
            if not isinstance(data, list):
                raise SupabaseError("Unexpected database response")

            results.extend(data)
            received = len(data)
            offset += received

            if received < page_limit:
                return results

        if explicit_limit is None or explicit_limit > self.MAX_ROWS:
            raise SupabaseError(
                f"Query reached the safety limit of {self.MAX_ROWS} rows; "
                "narrow the query or use database-side aggregation."
            )

        return results

    def rpc(self, function_name: str, payload: dict[str, Any]) -> Any:
        """Call a PostgreSQL function through Supabase PostgREST RPC."""
        self._ensure_configured()
        try:
            response = requests.post(
                f"{self.base}/rpc/{function_name}",
                headers=self.headers,
                json=payload,
                timeout=30,
            )
        except requests.RequestException as exc:
            raise SupabaseError("Database service is unavailable") from exc

        if not response.ok:
            detail = response.text.strip()
            if len(detail) > 500:
                detail = detail[:500] + "…"
            message = f"Database RPC failed ({response.status_code})"
            if detail:
                message += f": {detail}"
            raise SupabaseError(message)

        try:
            return response.json()
        except ValueError as exc:
            raise SupabaseError("Unexpected database RPC response") from exc

    def auth_user(self, access_token: str) -> dict[str, Any]:
        self._ensure_configured()

        headers = {
            "apikey": settings.supabase_service_role_key,
            "Authorization": f"Bearer {access_token}",
        }

        try:
            response = requests.get(
                settings.supabase_url.rstrip("/") + "/auth/v1/user",
                headers=headers,
                timeout=15,
            )
        except requests.RequestException as exc:
            raise SupabaseError(
                "Authentication service is unavailable"
            ) from exc

        if response.status_code != 200:
            raise PermissionError("Invalid or expired access token")

        return response.json()


db = SupabaseREST()