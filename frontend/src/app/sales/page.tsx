"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getSelectedLocation } from "@/lib/location";

type DailySalesPoint = {
  date: string;
  net_sales: number;
};

type SalesReport = {
  organization_id?: string;
  location_id?: string | null;
  start_date: string;
  end_date: string;
  transaction_count: number;
  units_sold: number;
  gross_sales: number;
  discounts: number;
  net_sales: number;
  tax: number;
  currency: string | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const DEFAULT_START_DATE = "2026-08-01";
const DEFAULT_END_DATE = "2026-08-31";
const CURRENCY = "GBP";

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeReport(value: unknown): SalesReport | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const row = value as Record<string, unknown>;
  const transactionCount = toNumber(row.transaction_count);
  const unitsSold = toNumber(row.units_sold);
  const grossSales = toNumber(row.gross_sales);
  const discounts = toNumber(row.discounts);
  const netSales = toNumber(row.net_sales);
  const tax = toNumber(row.tax);

  if (
    transactionCount === null ||
    unitsSold === null ||
    grossSales === null ||
    discounts === null ||
    netSales === null ||
    tax === null ||
    typeof row.start_date !== "string" ||
    typeof row.end_date !== "string"
  ) {
    return null;
  }

  return {
    organization_id:
      typeof row.organization_id === "string"
        ? row.organization_id
        : undefined,
    location_id:
      typeof row.location_id === "string" ? row.location_id : null,
    start_date: row.start_date,
    end_date: row.end_date,
    transaction_count: transactionCount,
    units_sold: unitsSold,
    gross_sales: grossSales,
    discounts,
    net_sales: netSales,
    tax,
    currency: typeof row.currency === "string" ? row.currency : null,
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

function integer(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString("en-GB", {
    maximumFractionDigits: 2,
  });
}

function dateLabel(value: string): string {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(parsed);
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

export default function SalesPage() {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [dailySales, setDailySales] = useState<DailySalesPoint[]>([]);
  const [startDate, setStartDate] = useState(DEFAULT_START_DATE);
  const [endDate, setEndDate] = useState(DEFAULT_END_DATE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locationReady, setLocationReady] = useState(false);
  const [locationId, setLocationId] = useState<string | null>(null);

  useEffect(() => {
    setLocationId(getSelectedLocation());
    setLocationReady(true);
  }, []);

  const loadReport = useCallback(async () => {
    if (!locationReady) return;

    if (!startDate || !endDate) {
      setError("Select both a start date and an end date.");
      return;
    }

    if (startDate > endDate) {
      setError("End date must be on or after the start date.");
      return;
    }

    if (!API_BASE_URL) {
      setError("NEXT_PUBLIC_API_BASE_URL is not configured.");
      return;
    }

    if (!locationId) {
      setReport(null);
      setDailySales([]);
      setError("Select a workspace location to view sales.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error("Please sign in to view sales metrics.");
      }

      const headers = {
        Authorization: `Bearer ${session.access_token}`,
        Accept: "application/json",
      };

      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        location_id: locationId,
      });

      const [salesResponse, overviewResponse] = await Promise.all([
        fetch(
          `${API_BASE_URL.replace(/\/$/, "")}/v1/reports/sales?${params.toString()}`,
          {
            headers,
            cache: "no-store",
          },
        ),
        fetch(
          `${API_BASE_URL.replace(/\/$/, "")}/v1/reports/overview?${params.toString()}`,
          {
            headers,
            cache: "no-store",
          },
        ),
      ]);

      if (!salesResponse.ok) {
        const detail = await salesResponse.text();

        if (salesResponse.status === 401) {
          throw new Error("Session expired. Please sign in again.");
        }

        if (salesResponse.status === 403) {
          throw new Error("You do not have access to this location.");
        }

        throw new Error(
          `Sales API request failed (${salesResponse.status}): ${
            detail || salesResponse.statusText
          }`,
        );
      }

      if (!overviewResponse.ok) {
        const detail = await overviewResponse.text();

        if (overviewResponse.status === 401) {
          throw new Error("Session expired. Please sign in again.");
        }

        if (overviewResponse.status === 403) {
          throw new Error("You do not have access to this location.");
        }

        throw new Error(
          `Daily sales API request failed (${overviewResponse.status}): ${
            detail || overviewResponse.statusText
          }`,
        );
      }

      const payload: unknown = await salesResponse.json();
      const normalized = normalizeReport(payload);

      if (!normalized) {
        throw new Error("Unexpected API response: invalid sales report.");
      }

      const overviewPayload: unknown = await overviewResponse.json();
      const rawDailySales: unknown[] =
        typeof overviewPayload === "object" &&
        overviewPayload !== null &&
        !Array.isArray(overviewPayload) &&
        Array.isArray((overviewPayload as Record<string, unknown>).daily_sales)
          ? ((overviewPayload as Record<string, unknown>).daily_sales as unknown[])
          : [];

      const normalizedDailySales = rawDailySales
        .map((point) => {
          if (typeof point !== "object" || point === null || Array.isArray(point)) {
            return null;
          }

          const row = point as Record<string, unknown>;
          const date = typeof row.date === "string" ? row.date : null;
          const netSales = toNumber(row.net_sales);

          if (!date || netSales === null) return null;

          return { date, net_sales: netSales };
        })
        .filter((point): point is DailySalesPoint => point !== null)
        .sort((a, b) => a.date.localeCompare(b.date));

      setReport(normalized);
      setDailySales(normalizedDailySales);
    } catch (err) {
      setReport(null);
      setDailySales([]);
      setError(
        err instanceof Error ? err.message : "Unable to load sales report.",
      );
    } finally {
      setLoading(false);
    }
  }, [locationId, locationReady, startDate, endDate]);


  useEffect(() => {
    if (locationReady) {
      void loadReport();
    }
  }, [locationReady, loadReport]);

  const averageOrderValue = useMemo(() => {
    if (!report || report.transaction_count <= 0) return null;
    return report.gross_sales / report.transaction_count;
  }, [report]);

  const discountRate = useMemo(() => {
    if (!report || report.gross_sales <= 0) return null;
    return (report.discounts / report.gross_sales) * 100;
  }, [report]);

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">
            CaféOps Intelligence
          </p>

          <h1 className="mt-1 text-3xl font-bold tracking-tight">
            Sales Performance
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Review sales totals for the selected location and period.
          </p>

          <p className="mt-1 text-xs text-muted-foreground">
            {startDate} → {endDate}
            {locationId ? ` · ${locationId}` : ""}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadReport()}
          disabled={loading || !locationReady || !locationId}
          className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border bg-card p-4">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            Start date
          </span>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            End date
          </span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="ml-auto text-right">
          <p className="text-xs text-muted-foreground">Location</p>
          <p className="text-sm font-medium">
            {locationId ?? "No location selected"}
          </p>
        </div>
      </section>

      {!locationReady ? (
        <section className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          Loading workspace location…
        </section>
      ) : error ? (
        <section
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-900"
        >
          <p className="font-semibold">Could not load sales report</p>
          <p className="mt-1 break-words">{error}</p>
        </section>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              label="Net sales"
              value={loading ? "…" : money(report?.net_sales ?? null)}
              detail="Completed paid transactions"
            />

            <SummaryCard
              label="Transactions"
              value={
                loading ? "…" : integer(report?.transaction_count ?? null)
              }
              detail="Completed paid transactions"
            />

            <SummaryCard
              label="Average order value"
              value={loading ? "…" : money(averageOrderValue)}
              detail="Gross sales ÷ transactions"
            />

            <SummaryCard
              label="Units sold"
              value={loading ? "…" : integer(report?.units_sold ?? null)}
              detail="Units across sales lines"
            />
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="font-semibold">Daily sales</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Net sales by calendar day for the selected location and period.
              </p>
            </div>

            <div className="p-5">
              {loading ? (
                <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                  Loading daily sales…
                </div>
              ) : dailySales.length === 0 ? (
                <div className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                  No daily sales data available for this period.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <div
                    className="min-w-[760px]"
                    role="img"
                    aria-label={`Daily net sales from ${dateLabel(startDate)} to ${dateLabel(endDate)}`}
                  >
                    <div className="mb-3 flex items-end justify-between gap-2 text-xs text-muted-foreground">
                      <span>{dateLabel(dailySales[0].date)}</span>
                      <span>{dateLabel(dailySales[dailySales.length - 1].date)}</span>
                    </div>

                    <div className="grid h-72 grid-cols-[1fr] gap-2">
                      <div className="relative flex items-end gap-1 border-b border-l px-2 pb-0 pt-4">
                        {dailySales.map((point) => {
                          const maxSales = Math.max(
                            ...dailySales.map((item) => item.net_sales),
                            1,
                          );
                          const height = Math.max(
                            (point.net_sales / maxSales) * 100,
                            point.net_sales > 0 ? 2 : 0,
                          );

                          return (
                            <div
                              key={point.date}
                              className="group relative flex h-full min-w-0 flex-1 items-end"
                              title={`${dateLabel(point.date)}: ${money(point.net_sales)}`}
                            >
                              <div
                                className="w-full rounded-t bg-emerald-600/80 transition-colors group-hover:bg-emerald-700"
                                style={{ height: `${height}%` }}
                              />
                              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1.5 text-xs text-white shadow-lg group-hover:block">
                                <strong>{dateLabel(point.date)}</strong>
                                <span className="ml-2">{money(point.net_sales)}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-5 text-xs text-muted-foreground">
                      {[
                        dailySales[0],
                        dailySales[Math.floor((dailySales.length - 1) * 0.25)],
                        dailySales[Math.floor((dailySales.length - 1) * 0.5)],
                        dailySales[Math.floor((dailySales.length - 1) * 0.75)],
                        dailySales[dailySales.length - 1],
                      ].filter(
                        (point, index, values) =>
                          point &&
                          values.findIndex((candidate) => candidate?.date === point.date) === index,
                      ).map((point) => (
                        <span key={point.date} className="text-center first:text-left last:text-right">
                          {dateLabel(point.date)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
            <article className="rounded-xl border bg-card">
              <div className="border-b p-5">
                <h2 className="font-semibold">Sales summary</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Deterministic values returned by the sales reporting
                  service.
                </p>
              </div>

              <dl className="divide-y">
                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Gross sales
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : money(report?.gross_sales ?? null)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Discounts
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : money(report?.discounts ?? null)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Discount rate
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading
                      ? "…"
                      : discountRate === null
                        ? "—"
                        : `${discountRate.toFixed(2)}%`}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">Net sales</dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : money(report?.net_sales ?? null)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">Tax</dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : money(report?.tax ?? null)}
                  </dd>
                </div>

                <div className="flex items-center justify-between gap-4 px-5 py-4">
                  <dt className="text-sm text-muted-foreground">
                    Average order value
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {loading ? "…" : money(averageOrderValue)}
                  </dd>
                </div>
              </dl>
            </article>

            <aside className="rounded-xl border bg-card p-5">
              <h2 className="font-semibold">Reporting basis</h2>

              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Transaction scope
                  </p>
                  <p className="mt-1 text-sm">
                    Completed and paid transactions only.
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Currency
                  </p>
                  <p className="mt-1 text-sm">
                    {report?.currency ?? CURRENCY}
                  </p>
                </div>

                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Average order value
                  </p>
                  <p className="mt-1 text-sm">
                    Gross sales divided by completed paid transactions.
                  </p>
                </div>
              </div>

              <div className="mt-6 rounded-lg border bg-muted/30 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Demo data
                </p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  Sales records are synthetic POS data. Square API access and
                  source reconciliation remain unverified.
                </p>
              </div>
            </aside>
          </section>

          <section className="rounded-xl border bg-card">
            <div className="border-b p-5">
              <h2 className="font-semibold">Period details</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Exact reporting period and selected workspace location.
              </p>
            </div>

            <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs text-muted-foreground">Start</p>
                <p className="mt-1 font-medium">{dateLabel(startDate)}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">End</p>
                <p className="mt-1 font-medium">{dateLabel(endDate)}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="mt-1 font-medium">
                  {report?.location_id ?? locationId ?? "—"}
                </p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Units sold</p>
                <p className="mt-1 font-medium tabular-nums">
                  {loading ? "…" : integer(report?.units_sold ?? null)}
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </main>
  );
}
