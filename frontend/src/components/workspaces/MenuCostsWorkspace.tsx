
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";


type MenuItem = {
  menu_item_id: string;
  menu_item_name: string;
  list_price: number | null;
  recipe_cost: number | null;
  gross_profit: number | null;
  gross_margin_pct: number | null;
  costing_status: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const CURRENCY = "USD";

function money(value: number | null): string {
  if (value === null) return "—";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value);
}

function percent(value: number | null): string {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function normalizeItem(value: unknown): MenuItem | null {
  if (!isRecord(value)) return null;

  const id = value.menu_item_id;
  const name = value.menu_item_name;

  if (typeof id !== "string" || typeof name !== "string") {
    return null;
  }

  return {
    menu_item_id: id,
    menu_item_name: name,
    list_price: parseNumber(value.list_price),
    recipe_cost: parseNumber(value.recipe_cost),
    gross_profit: parseNumber(value.gross_profit),
    gross_margin_pct: parseNumber(value.gross_margin_pct),
    costing_status:
      typeof value.costing_status === "string"
        ? value.costing_status
        : "unknown",
  };
}

function statusLabel(status: string): string {
  if (status === "estimated_from_current_unit_cost") {
    return "Estimated from current unit cost";
  }

  return status.replaceAll("_", " ");
}

function StatusBadge({ status }: { status: string }) {
  const estimated = status === "estimated_from_current_unit_cost";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
        estimated
          ? "bg-amber-100 text-amber-800"
          : "bg-muted text-muted-foreground"
      }`}
    >
      {statusLabel(status)}
    </span>
  );
}

function SummaryCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}

export type MenuCostsWorkspaceProps = {
  locationId: string | null;
};

export default function MenuCostsWorkspace({ locationId: _locationId }: MenuCostsWorkspaceProps) {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [costingFilter, setCostingFilter] = useState("all");

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!API_BASE) {
        throw new Error(
          "NEXT_PUBLIC_API_BASE_URL is not configured.",
        );
      }

      const supabase = createClient();

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error("Please sign in to view menu costs.");
      }

      const response = await fetch(
        `${API_BASE.replace(/\/$/, "")}/v1/reports/menu-costs`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        const detail = await response.text();
        throw new Error(
          `API request failed (${response.status}): ${
            detail || response.statusText
          }`,
        );
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload)) {
        throw new Error(
          "Unexpected API response: expected an array of menu items.",
        );
      }

      const normalized = payload
        .map(normalizeItem)
        .filter((item): item is MenuItem => item !== null);

      setItems(normalized);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load menu costs.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        item.menu_item_name.toLowerCase().includes(query) ||
        item.menu_item_id.toLowerCase().includes(query);

      const matchesCosting =
        costingFilter === "all" ||
        (costingFilter === "estimated" &&
          item.costing_status ===
            "estimated_from_current_unit_cost") ||
        (costingFilter === "other" &&
          item.costing_status !==
            "estimated_from_current_unit_cost");

      return matchesSearch && matchesCosting;
    });
  }, [items, search, costingFilter]);

  const averageMargin = useMemo(() => {
    const values = items
      .map((item) => item.gross_margin_pct)
      .filter((value): value is number => value !== null);

    if (values.length === 0) return null;

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [items]);

  const estimatedCount = items.filter(
    (item) =>
      item.costing_status === "estimated_from_current_unit_cost",
  ).length;

  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            CaféOps Intelligence
          </p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Menu &amp; Product Profitability
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Recipe costs and available margin information across
            the organization.
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Organization-wide report · Not filtered by location
          </p>
        </div>

        <button
          onClick={() => void loadReport()}
          disabled={loading}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {error && (
        <section
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-semibold">Could not load menu costs</p>
          <p className="mt-1 break-words">{error}</p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Menu items"
          value={loading ? "…" : String(items.length)}
        />

        <SummaryCard
          label="Items with recipe cost"
          value={
            loading
              ? "…"
              : String(items.filter((item) => item.recipe_cost !== null).length)
          }
        />

        <SummaryCard
          label="Average gross margin"
          value={
            loading
              ? "…"
              : averageMargin === null
                ? "—"
                : percent(averageMargin)
          }
        />
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">Menu cost breakdown</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {estimatedCount} of {items.length} items have estimated
              recipe costs.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search menu items…"
              className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm"
            />

            <select
              value={costingFilter}
              onChange={(event) => setCostingFilter(event.target.value)}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All costing statuses</option>
              <option value="estimated">Estimated</option>
              <option value="other">Other statuses</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading menu cost data…
          </div>
        ) : !error && filteredItems.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No menu items match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Menu item</th>
                  <th className="px-4 py-3">List price</th>
                  <th className="px-4 py-3">Recipe cost</th>
                  <th className="px-4 py-3">Gross profit</th>
                  <th className="px-4 py-3">Gross margin</th>
                  <th className="px-4 py-3">Costing status</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredItems.map((item) => (
                  <tr key={item.menu_item_id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">
                        {item.menu_item_name}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.menu_item_id}
                      </p>
                    </td>

                    <td className="px-4 py-3 tabular-nums">
                      {money(item.list_price)}
                    </td>

                    <td className="px-4 py-3 tabular-nums">
                      {money(item.recipe_cost)}
                    </td>

                    <td className="px-4 py-3 tabular-nums">
                      {money(item.gross_profit)}
                    </td>

                    <td className="px-4 py-3 tabular-nums">
                      {percent(item.gross_margin_pct)}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge status={item.costing_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-muted-foreground">
        Costing status: estimated from current unit cost. Gross profit
        and margin are reported by the backend and are not recalculated
        in this page. Values are displayed in USD based on the supplied
        sample prices.
      </p>
    </section>
  );
}
