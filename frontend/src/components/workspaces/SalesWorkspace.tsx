
"use client";

import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useState } from "react";

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
  currency: string;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function MetricCard({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-gray-900">
        {value}
      </p>
    </section>
  );
}

export type SalesWorkspaceProps = {
  locationId: string | null;
};

export default function SalesWorkspace({ locationId }: SalesWorkspaceProps) {
  const [report, setReport] = useState<SalesReport | null>(null);
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2026-08-31");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const locationReady = true;

  const loadReport = useCallback(async () => {
    if (!locationReady) return;

    if (!startDate || !endDate) {
      setError("Select both a start date and an end date.");
      return;
    }

    if (startDate > endDate) {
      setError("Start date must be before or equal to end date.");
      return;
    }

    setLoading(true);
    setError("");

    try {
        const supabase = createClient();

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      const token = session?.access_token;

      if (!token) {
        throw new Error("Your session has expired. Please sign in again.");
      }

      if (!API_BASE_URL) {
        throw new Error("API base URL is not configured.");
      }

      const params = new URLSearchParams({
        start_date: startDate,
        end_date: endDate,
      });

      if (locationId) {
        params.set("location_id", locationId);
      }

      const response = await fetch(
        `${API_BASE_URL}/v1/reports/sales?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
        }
      );

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(
          body?.detail ||
            `Sales report request failed (${response.status}).`
        );
      }

      const data: SalesReport = await response.json();
      setReport(data);
    } catch (err) {
      setReport(null);
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load sales report."
      );
    } finally {
      setLoading(false);
    }
  }, [locationReady, locationId, startDate, endDate]);

  useEffect(() => {
    if (locationReady) {
      void loadReport();
    }
  }, [locationReady, loadReport]);

  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-gray-900">
          Sales Performance
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Review sales totals for the selected location and period.
        </p>
      </header>

      <section className="flex flex-wrap items-end gap-4 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label
            htmlFor="sales-start-date"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            Start date
          </label>
          <input
            id="sales-start-date"
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <div>
          <label
            htmlFor="sales-end-date"
            className="mb-1 block text-sm font-medium text-gray-700"
          >
            End date
          </label>
          <input
            id="sales-end-date"
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2"
          />
        </div>

        <button
          type="button"
          onClick={() => void loadReport()}
          disabled={loading || !locationReady}
          className="rounded-lg bg-gray-900 px-5 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Loading..." : "Refresh report"}
        </button>
      </section>

      {loading && (
        <p className="text-sm text-gray-500">
          Loading sales report...
        </p>
      )}

      {!loading && error && (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="font-medium text-red-800">
            Unable to load sales data
          </p>
          <p className="mt-1 text-sm text-red-700">{error}</p>
        </section>
      )}

      {!loading && !error && report && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="Net sales"
              value={formatMoney(report.net_sales, report.currency)}
            />
            <MetricCard
              label="Gross sales"
              value={formatMoney(report.gross_sales, report.currency)}
            />
            <MetricCard
              label="Discounts"
              value={formatMoney(report.discounts, report.currency)}
            />
            <MetricCard
              label="Tax"
              value={formatMoney(report.tax, report.currency)}
            />
            <MetricCard
              label="Transactions"
              value={report.transaction_count.toLocaleString()}
            />
            <MetricCard
              label="Units sold"
              value={report.units_sold.toLocaleString()}
            />
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900">
              Report details
            </h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-gray-500">Period</dt>
                <dd className="font-medium text-gray-900">
                  {report.start_date} – {report.end_date}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Location</dt>
                <dd className="font-medium text-gray-900">
                  {locationId
                    ? report.location_id === locationId
                      ? "Selected location"
                      : report.location_id || "All locations"
                    : "All locations"}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">Currency</dt>
                <dd className="font-medium text-gray-900">
                  {report.currency}
                </dd>
              </div>
            </dl>
          </section>

          <p className="text-xs text-gray-500">
            Data is returned by the API. The current project dataset is
            synthetic demo data, not live café transactions.
          </p>
        </>
      )}

      {!loading && !error && !report && (
        <p className="text-sm text-gray-500">
          No sales report is available for this selection.
        </p>
      )}
    </section>
  );
}
