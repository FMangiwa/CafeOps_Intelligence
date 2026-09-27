"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSelectedLocation } from "@/lib/location";

type LaborSummary = {
  organization_id?: string;
  location_id?: string | null;
  start_date?: string;
  end_date?: string;
  hours_worked: number;
  labor_cost: number;
  net_sales: number | null;
  labor_cost_pct: number | null;
  sales_per_labor_hour: number | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL;
const CURRENCY = "GBP";
const START_DATE = "2026-08-01";
const END_DATE = "2026-08-31";

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeSummary(value: unknown): LaborSummary | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const hours = numberValue(row.hours_worked);
  const cost = numberValue(row.labor_cost);

  if (hours === null || cost === null) return null;

  return {
    organization_id:
      typeof row.organization_id === "string" ? row.organization_id : undefined,
    location_id:
      typeof row.location_id === "string" ? row.location_id : null,
    start_date:
      typeof row.start_date === "string" ? row.start_date : undefined,
    end_date:
      typeof row.end_date === "string" ? row.end_date : undefined,
    hours_worked: hours,
    labor_cost: cost,
    net_sales: numberValue(row.net_sales),
    labor_cost_pct: numberValue(row.labor_cost_pct),
    sales_per_labor_hour: numberValue(row.sales_per_labor_hour),
  };
}

function money(value: number | null): string {
  if (value === null) return "—";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: CURRENCY,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function hours(value: number | null): string {
  if (value === null) return "—";
  return `${value.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} h`;
}

function percent(value: number | null): string {
  if (value === null) return "—";
  return `${value.toFixed(2)}%`;
}

function rate(value: number | null): string {
  if (value === null) return "—";
  return `${money(value)}/h`;
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
      {detail && (
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      )}
    </div>
  );
}

export default function LaborPage() {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationReady, setLocationReady] = useState(false);

  const [summary, setSummary] = useState<LaborSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReport = useCallback(async () => {
    if (!locationId) {
      setSummary(null);
      setLoading(false);
      return;
    }

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
        throw new Error("Please sign in to view labor metrics.");
      }

      const params = new URLSearchParams({
        start_date: START_DATE,
        end_date: END_DATE,
        location_id: locationId,
      });

      const response = await fetch(
        `${API_BASE.replace(/\/$/, "")}/v1/reports/labor?${params.toString()}`,
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
      const normalized = normalizeSummary(payload);

      if (!normalized) {
        throw new Error("Unexpected API response: invalid labor summary.");
      }

      setSummary(normalized);
    } catch (err) {
      setSummary(null);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load labor metrics.",
      );
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    const savedLocation = getSelectedLocation();
    setLocationId(savedLocation);
    setLocationReady(true);
  }, []);

  useEffect(() => {
    if (!locationReady) return;
    void loadReport();
  }, [locationReady, loadReport]);

  const impliedHourlyLaborCost = useMemo(() => {
    if (!summary || summary.hours_worked <= 0) return null;
    return summary.labor_cost / summary.hours_worked;
  }, [summary]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            CaféOps Intelligence
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Labor Performance
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Labor hours and labor-cost metrics for the selected café location.
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            Period: {START_DATE} → {END_DATE}
            {locationId ? ` · ${locationId}` : ""}
          </p>
        </div>

        <button
          onClick={() => void loadReport()}
          disabled={loading || !locationReady || !locationId}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      {!locationReady ? (
        <section className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading workspace location…
        </section>
      ) : !locationId ? (
        <section className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Select a workspace location to view labor metrics.
        </section>
      ) : error ? (
        <section
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-semibold">Could not load labor metrics</p>
          <p className="mt-1 break-words">{error}</p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Hours worked"
              value={loading ? "…" : hours(summary?.hours_worked ?? null)}
              detail="Recorded labor hours"
            />

            <SummaryCard
              label="Labor cost"
              value={loading ? "…" : money(summary?.labor_cost ?? null)}
              detail="Recorded labor cost"
            />

            <SummaryCard
              label="Labor cost %"
              value={loading ? "…" : percent(summary?.labor_cost_pct ?? null)}
              detail="Labor cost ÷ net sales"
            />

            <SummaryCard
              label="Sales / labor hour"
              value={
                loading
                  ? "…"
                  : money(summary?.sales_per_labor_hour ?? null)
              }
              detail="Net sales ÷ recorded labor hours"
            />
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
            <article className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="font-semibold">Labor summary</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Deterministic metrics returned by the labor reporting
                  service.
                </p>
              </div>

              <dl className="divide-y">
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">Net sales</dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : money(summary?.net_sales ?? null)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Labor cost
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : money(summary?.labor_cost ?? null)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Hours worked
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : hours(summary?.hours_worked ?? null)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Implied labor cost / hour
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : rate(impliedHourlyLaborCost)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Labor cost %
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : percent(summary?.labor_cost_pct ?? null)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Sales / labor hour
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading
                      ? "…"
                      : money(summary?.sales_per_labor_hour ?? null)}
                  </dd>
                </div>
              </dl>
            </article>

            <aside className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Data note</h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                Labor data in this portfolio dataset represents synthetic
                scheduled hours at employee rates. It is not verified
                payroll or timeclock data.
              </p>

              <div className="mt-5 rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Reporting basis
                </p>
                <p className="mt-2 text-sm">
                  Labor cost % = labor cost ÷ net sales
                </p>
                <p className="mt-1 text-sm">
                  Sales / labor hour = net sales ÷ recorded labor hours
                </p>
              </div>

              <p className="mt-4 text-xs leading-5 text-muted-foreground">
                A missing ratio is shown as — rather than being treated as
                zero.
              </p>
            </aside>
          </section>
        </>
      )}
    </main>
  );
}
