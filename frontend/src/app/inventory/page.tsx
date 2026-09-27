
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useSelectedLocation } from "@/components/LocationSelector";


type RawInventoryMovement = {
  location_id: string;
  date: string;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity_change: number;
};

type InventoryItem = {
  location_id: string;
  ingredient_id: string;
  ingredient_name: string;
  unit: string;
  quantity: number;
  reorder_point: number;
  target_quantity: number;
  below_reorder_point: boolean;
  baseline_quantity: number;
  purchase_receipts_added: number;
  inventory_status: string;
  unit_mismatch_count: number;
  daily_movements?: RawInventoryMovement[];
  note: string;
};

type DailyMovement = {
  location_id: string;
  ingredient_id: string;
  date: string;
  received_quantity: number;
  consumed_quantity: number;
  net_movement: number;
};

type MonthlyReconciliation = {
  location_id: string;
  ingredient_id: string;
  month: string;
  opening_quantity: number;
  received_quantity: number;
  consumed_quantity: number;
  expected_closing_quantity: number;
  assumed_physical_quantity: number | null;
  adjustment_quantity: number | null;
  reconciled_closing_quantity: number | null;
  reconciliation_type: string;
};

type InventoryAnalysis = {
  daily_movements: DailyMovement[];
  monthly_reconciliation: MonthlyReconciliation[];
};


const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;


function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}


function normalizeItem(value: unknown): InventoryItem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;

  if (
    typeof row.ingredient_id !== "string" ||
    typeof row.ingredient_name !== "string"
  ) {
    return null;
  }

  return {
    location_id: typeof row.location_id === "string" ? row.location_id : "",
    ingredient_id: row.ingredient_id,
    ingredient_name: row.ingredient_name,
    unit: typeof row.unit === "string" ? row.unit : "",
    quantity: numberValue(row.quantity) ?? 0,
    reorder_point: numberValue(row.reorder_point) ?? 0,
    target_quantity: numberValue(row.target_quantity) ?? 0,
    below_reorder_point: row.below_reorder_point === true,
    baseline_quantity: numberValue(row.baseline_quantity) ?? 0,
    purchase_receipts_added: numberValue(row.purchase_receipts_added) ?? 0,
    inventory_status:
      typeof row.inventory_status === "string"
        ? row.inventory_status
        : "unknown",
    unit_mismatch_count: numberValue(row.unit_mismatch_count) ?? 0,
    daily_movements: Array.isArray(row.daily_movements)
      ? row.daily_movements.filter(
          (movement): movement is RawInventoryMovement =>
            typeof movement === "object" &&
            movement !== null &&
            typeof (movement as RawInventoryMovement).date === "string" &&
            typeof (movement as RawInventoryMovement).ingredient_id === "string"
        )
      : [],
    note: typeof row.note === "string" ? row.note : "",
  };
}


function quantity(value: number, unit: string): string {
  return `${value.toLocaleString(undefined, {
    maximumFractionDigits: 3,
  })}${unit ? ` ${unit}` : ""}`;
}


function StatusBadge({ item }: { item: InventoryItem }) {
  if (item.below_reorder_point) {
    return (
      <span className="inline-flex rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800">
        Below reorder point
      </span>
    );
  }

  if (item.unit_mismatch_count > 0) {
    return (
      <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
        Unit mismatch
      </span>
    );
  }

  return (
    <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
      {item.inventory_status.replaceAll("_", " ")}
    </span>
  );
}


function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold ${
          warning ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}


export default function InventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const { locationId, locationReady } = useSelectedLocation();
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2026-08-31");
  const [dailyMovements, setDailyMovements] = useState<DailyMovement[]>([]);
  const [monthlyReconciliation, setMonthlyReconciliation] = useState<MonthlyReconciliation[]>([]);

  const loadReport = useCallback(async () => {
    if (!locationReady) return;

    setLoading(true);
    setError(null);
    
    try {
      if (!API_BASE) {
        throw new Error("NEXT_PUBLIC_API_BASE_URL is not configured.");
      }

      const supabase = createClient();

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error("Please sign in to view inventory.");
      }

      const url = new URL(
        `${API_BASE.replace(/\/$/, "")}/v1/reports/inventory`,
      );

      if (locationId) {
        url.searchParams.set("location_id", locationId);
      }

      url.searchParams.set("start_date", startDate);
      url.searchParams.set("end_date", endDate);

      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.detail ?? data?.message ?? "Could not load inventory"
        );
      }

      if (Array.isArray(data)) {
        const inventoryItems = data
          .map(normalizeItem)
          .filter((item): item is InventoryItem => item !== null);

        setItems(inventoryItems);

        const dailyRows: DailyMovement[] = inventoryItems.flatMap((item) =>
          (item.daily_movements ?? []).map((movement) => ({
            location_id: movement.location_id || item.location_id,
            ingredient_id: movement.ingredient_id,
            date: movement.date,
            received_quantity: 0,
            consumed_quantity: 0,
            net_movement: movement.quantity_change,
          }))
        );

        setDailyMovements(dailyRows);
        setMonthlyReconciliation([]);
      } else if (typeof data === "object" && data !== null) {
        const report = data as {
          inventory?: unknown[];
          daily_movements?: DailyMovement[];
          monthly_reconciliation?: MonthlyReconciliation[];
        };

        const inventoryItems = Array.isArray(report.inventory)
          ? report.inventory
              .map(normalizeItem)
              .filter((item): item is InventoryItem => item !== null)
          : [];

        setItems(inventoryItems);
        setDailyMovements(
          Array.isArray(report.daily_movements) ? report.daily_movements : [],
        );
        setMonthlyReconciliation(
          Array.isArray(report.monthly_reconciliation)
            ? report.monthly_reconciliation
            : [],
        );
      } else {
        throw new Error("Unexpected inventory API response.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load inventory.",
      );
    } finally {
      setLoading(false);
    }
  }, [locationId, locationReady, startDate, endDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

   const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items.filter((item) => {
      const matchesSearch =
        item.ingredient_name.toLowerCase().includes(query) ||
        item.ingredient_id.toLowerCase().includes(query);

      const matchesFilter =
        filter === "all" ||
        (filter === "reorder" && item.below_reorder_point) ||
        (filter === "unit" && item.unit_mismatch_count > 0);

      return matchesSearch && matchesFilter;
    });
  }, [items, search, filter]);

  const reorderCount = items.filter(
    (item) => item.below_reorder_point,
  ).length;

  const mismatchCount = items.filter(
    (item) => item.unit_mismatch_count > 0,
  ).length;

  const receiptsTotal = items.reduce(
    (sum, item) => sum + item.purchase_receipts_added,
    0,
  );

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            CaféOps Intelligence
          </p>
          
          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Inventory &amp; Stock Monitoring
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Ingredient quantities, reorder thresholds, and recorded
            purchase receipts.
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {locationId
              ? "Filtered by selected location"
              : "Organization-wide · No location selected"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className="ml-2 rounded border px-2 py-1"
            />
          </label>

          <label className="text-sm">
            End date
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className="ml-2 rounded border px-2 py-1"
            />
          </label>

          <button
            onClick={() => void loadReport()}
            disabled={loading || !locationReady}
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <section
        role="note"
        className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"
      >
        <p className="font-semibold">
          Inventory data is a partial estimate
        </p>
        <p className="mt-1">
          The report combines baseline quantities and recorded purchase
          receipts. It does not represent verified on-hand stock because
          consumption, waste, and adjustments are not fully accounted for.
        </p>
      </section>

      {error && (
        <section
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-semibold">Could not load inventory</p>
          <p className="mt-1 break-words">{error}</p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Ingredients"
          value={loading ? "…" : String(items.length)}
        />

        <SummaryCard
          label="Below reorder point"
          value={loading ? "…" : String(reorderCount)}
          warning={reorderCount > 0}
        />

        <SummaryCard
          label="Unit mismatches"
          value={loading ? "…" : String(mismatchCount)}
          warning={mismatchCount > 0}
        />

        <SummaryCard
          label="Recorded receipts added"
          value={loading ? "…" : receiptsTotal.toLocaleString()}
        />
      </section>

      <section className="rounded-xl border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
          <div>
            <h2 className="font-semibold">Ingredient inventory</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Quantities use each ingredient’s reported unit.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search ingredients…"
              className="min-w-44 rounded-lg border bg-background px-3 py-2 text-sm"
            />

            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              className="rounded-lg border bg-background px-3 py-2 text-sm"
            >
              <option value="all">All ingredients</option>
              <option value="reorder">Below reorder point</option>
              <option value="unit">Unit mismatches</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Loading inventory…
          </div>
        ) : !error && filteredItems.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No ingredients match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Ingredient</th>
                  <th className="px-4 py-3">Estimated quantity</th>
                  <th className="px-4 py-3">Reorder point</th>
                  <th className="px-4 py-3">Target quantity</th>
                  <th className="px-4 py-3">Baseline</th>
                  <th className="px-4 py-3">Receipts added</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filteredItems.map((item, index) => (
                    <tr key={`${item.ingredient_id}-${index}`}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{item.ingredient_name}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {item.ingredient_id}
                      </p>
                    </td>

                    <td className="px-4 py-3 font-medium tabular-nums">
                      {quantity(item.quantity, item.unit)}
                    </td>

                    <td className="px-4 py-3 tabular-nums">
                      {quantity(item.reorder_point, item.unit)}
                    </td>

                    <td className="px-4 py-3 tabular-nums">
                      {quantity(item.target_quantity, item.unit)}
                    </td>

                    <td className="px-4 py-3 tabular-nums">
                      {quantity(item.baseline_quantity, item.unit)}
                    </td>

                    <td className="px-4 py-3 tabular-nums">
                      {quantity(item.purchase_receipts_added, item.unit)}
                    </td>

                    <td className="px-4 py-3">
                      <StatusBadge item={item} />
                      {item.note && (
                        <p className="mt-1 max-w-xs text-xs text-muted-foreground">
                          {item.note}
                        </p>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      
      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">
          Daily Ingredient Movements
        </h2>

        <div className="mt-4 space-y-2">
          {Object.entries(
            dailyMovements.reduce<Record<string, DailyMovement[]>>(
              (groups, movement) => {
                const key = movement.ingredient_id;
                (groups[key] ??= []).push(movement);
                return groups;
              },
              {},
            ),
          ).map(([ingredientId, movements]) => (
            <details
              key={ingredientId}
              className="rounded-lg border bg-card"
            >
              <summary className="cursor-pointer list-none px-4 py-3 hover:bg-muted/40">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium">
                      {items.find((item) => item.ingredient_id === ingredientId)?.ingredient_name ??
                        "Unknown ingredient"}{" "}
                      <span className="text-muted-foreground">
                        ({ingredientId})
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {movements.length} daily movement{movements.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-4 text-sm tabular-nums">
                    <span>
                      Received:{" "}
                      {movements
                        .reduce((sum, item) => sum + (item.received_quantity ?? 0), 0)
                        .toLocaleString()}
                    </span>
                    <span>
                      Consumed:{" "}
                      {movements
                        .reduce((sum, item) => sum + (item.consumed_quantity ?? 0), 0)
                        .toLocaleString()}
                    </span>
                    <span>
                      Net:{" "}
                      {movements
                        .reduce((sum, item) => sum + (item.net_movement ?? 0), 0)
                        .toLocaleString()}
                    </span>
                  </div>
                </div>
              </summary>

              <div className="overflow-x-auto border-t">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30">
                    <tr>
                      <th className="p-2 text-left">Date</th>
                      <th className="p-2 text-right">Received</th>
                      <th className="p-2 text-right">Consumed</th>
                      <th className="p-2 text-right">Net movement</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((movement) => (
                      <tr
                        key={`${movement.location_id}-${movement.ingredient_id}-${movement.date}`}
                        className="border-t"
                      >
                        <td className="p-2">{movement.date}</td>
                        <td className="p-2 text-right tabular-nums">
                          {(movement.received_quantity ?? 0).toLocaleString()}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {(movement.consumed_quantity ?? 0).toLocaleString()}
                        </td>
                        <td className="p-2 text-right tabular-nums">
                          {(movement.net_movement ?? 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}

          {dailyMovements.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No daily movements available.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 rounded-lg border p-4">
        <h2 className="text-lg font-semibold">
          Monthly Inventory Reconciliation
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Month</th>
                <th className="p-2 text-left">Ingredient</th>
                <th className="p-2 text-right">Opening</th>
                <th className="p-2 text-right">Received</th>
                <th className="p-2 text-right">Consumed</th>
                <th className="p-2 text-right">Expected close</th>
                <th className="p-2 text-right">Adjustment</th>
                <th className="p-2 text-right">Reconciled close</th>
              </tr>
            </thead>

            <tbody>
              {monthlyReconciliation.map((item) => (
                <tr
                  key={`${item.location_id}-${item.ingredient_id}-${item.month}`}
                  className="border-t"
                >
                  <td className="p-2">{item.month}</td>
                  <td className="p-2">{item.ingredient_id}</td>
                  <td className="p-2 text-right">
                    {item.opening_quantity}
                  </td>
                  <td className="p-2 text-right">
                    {item.received_quantity}
                  </td>
                  <td className="p-2 text-right">
                    {item.consumed_quantity}
                  </td>
                  <td className="p-2 text-right">
                    {item.expected_closing_quantity}
                  </td>
                  <td className="p-2 text-right">
                    {item.adjustment_quantity ?? "—"}
                  </td>
                  <td className="p-2 text-right">
                    {item.reconciled_closing_quantity ?? "—"}
                  </td>
                </tr>
              ))}

              {monthlyReconciliation.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-4 text-center">
                    No monthly reconciliation available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          No physical stock count is included in the source data. Expected close
          is theoretical and is not a verified physical count.
        </p>
      </section>
      
      <p className="text-xs text-muted-foreground">
        This page displays backend-reported quantities and flags. It does
        not calculate stock consumption, predict depletion, or create
        purchase orders.
      </p>
    </main>
  );
}
