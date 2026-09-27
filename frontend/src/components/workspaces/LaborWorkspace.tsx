"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LaborReport = {
  location_id?: string | null;
  start_date: string;
  end_date: string;
  hours_worked: number;
  labor_cost: number;
  net_sales: number | null;
  labor_cost_pct: number | null;
  sales_per_labor_hour: number | null;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 2,
  }).format(value);
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">{value}</p>
    </section>
  );
}

export type LaborWorkspaceProps = {
  locationId: string | null;
};

export default function LaborWorkspace({ locationId }: LaborWorkspaceProps) {
  const [report, setReport] = useState<LaborReport | null>(null);
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2026-08-31");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReport = useCallback(async () => {
    if (!locationId) {
      setReport(null);
      setLoading(false);
      setError("Select a location to view labor performance.");
      return;
    }

    if (!startDate || !endDate || startDate > endDate) {
      setError("Select a valid date range.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (!API_BASE_URL) throw new Error("API base URL is not configured.");

      const supabase = createClient();
      const { data: { session }, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError) throw sessionError;
      if (!session?.access_token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
        location_id: locationId,
      });

      const response = await fetch(
        `${API_BASE_URL}/v1/reports/labor?${params.toString()}`,
        {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.detail || `Labor report request failed (${response.status}).`);
      }

      setReport(await response.json());
    } catch (err) {
      setReport(null);
      setError(err instanceof Error ? err.message : "Unable to load labor report.");
    } finally {
      setLoading(false);
    }
  }, [locationId, startDate, endDate]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">Labor Performance</h1>
        <p className="mt-1 text-sm text-gray-500">
          Labor hours, cost, and sales efficiency for the selected location and period.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border bg-white p-4">
        <div>
          <label htmlFor="labor-start-date" className="mb-1 block text-sm font-medium text-gray-700">
            Start date
          </label>
          <input id="labor-start-date" type="date" value={startDate}
            max={endDate} onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border px-3 py-2" />
        </div>
        <div>
          <label htmlFor="labor-end-date" className="mb-1 block text-sm font-medium text-gray-700">
            End date
          </label>
          <input id="labor-end-date" type="date" value={endDate}
            min={startDate} onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border px-3 py-2" />
        </div>
        <button type="button" onClick={() => void loadReport()} disabled={loading || !locationId}
          className="rounded-lg bg-gray-900 px-5 py-2 font-medium text-white disabled:opacity-50">
          {loading ? "Loading..." : "Refresh report"}
        </button>
      </section>

      {loading && <p className="text-sm text-gray-500">Loading labor report...</p>}

      {!loading && error && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">Unable to load labor data</p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </section>
      )}

      {!loading && !error && report && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Hours worked" value={report.hours_worked.toLocaleString()} />
            <MetricCard label="Labor cost" value={formatMoney(report.labor_cost)} />
            <MetricCard label="Labor cost %" value={report.labor_cost_pct == null ? "—" : `${report.labor_cost_pct.toFixed(2)}%`} />
            <MetricCard label="Sales / labor hour" value={formatMoney(report.sales_per_labor_hour)} />
          </section>

          <section className="rounded-xl border bg-white p-5">
            <h2 className="font-semibold text-gray-900">Report details</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">Period</dt><dd className="font-medium">{report.start_date} – {report.end_date}</dd></div>
              <div><dt className="text-gray-500">Location</dt><dd className="font-medium">{locationId}</dd></div>
              <div><dt className="text-gray-500">Net sales</dt><dd className="font-medium">{formatMoney(report.net_sales)}</dd></div>
            </dl>
          </section>
        </>
      )}
    </section>
  );
}
