"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getSelectedLocation, saveSelectedLocation } from "@/lib/location";
import ApiStatus from "../ApiStatus";

const navigation = [
  { label: "Overview", icon: "◫", path: null },
  { label: "Sales", icon: "↗", path: "/sales" },
  { label: "Inventory", icon: "▤", path: "/inventory" },
  { label: "Menu & Costs", icon: "☷", path: "/menu-costs" },
  { label: "Labor", icon: "♙", path: "/labor" },
  { label: "Vendors", icon: "♧", path: "/vendors" },
];

type LocationOption = {
  location_id: string;
  location_name: string;
  status: string;
};

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000;
    const SESSION_STARTED_KEY = "cafeops_session_started_at";

    async function validateSession() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (cancelled) return;

      if (!session) {
        router.replace("/login");
        return;
      }

      const storedStartedAt = window.localStorage.getItem(SESSION_STARTED_KEY);
      const startedAt = storedStartedAt ? Number(storedStartedAt) : NaN;

      if (!Number.isFinite(startedAt)) {
        window.localStorage.setItem(SESSION_STARTED_KEY, String(Date.now()));
        return;
      }

      if (Date.now() - startedAt >= SESSION_MAX_AGE_MS) {
        window.localStorage.removeItem(SESSION_STARTED_KEY);
        await supabase.auth.signOut();
        if (!cancelled) router.replace("/login?expired=1");
      }
    }

    void validateSession();
    const timer = window.setInterval(() => void validateSession(), 60_000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router]);

  const [preview, setPreview] = useState<{ label: string; path: string } | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState<string>("");
  const [locationLoading, setLocationLoading] = useState(true);
  const [locationRefreshKey, setLocationRefreshKey] = useState(0);
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2026-08-31");
  const [reportCreating, setReportCreating] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [dailySales, setDailySales] = useState<Array<{ date: string; sales: number }>>([]);
  const [hoveredSalesIndex, setHoveredSalesIndex] = useState<number | null>(null);
  const [overviewMetrics, setOverviewMetrics] = useState({
    netSales: null as number | null,
    transactions: null as number | null,
    laborCost: null as number | null,
    inventoryItems: null as number | null,
    theoreticalCogs: null as number | null,
    grossProfit: null as number | null,
    grossMarginPct: null as number | null,
    contributionAfterLabor: null as number | null,
    uncostedSalesLines: null as number | null,
    loading: false,
  });

  useEffect(() => {
    const selected = getSelectedLocation();
    if (selected) setLocationId(selected);

    let cancelled = false;

    async function loadLocations() {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
        if (!apiBase) return;

        const response = await fetch(`${apiBase.replace(/\/$/, "")}/v1/locations`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: "no-store",
        });
        if (!response.ok) return;

        const data = await response.json();
        if (!Array.isArray(data) || cancelled) return;

        const activeLocations = (data as LocationOption[]).filter(
          (location) => location.status === "active",
        );
        setLocations(activeLocations);

        const savedLocation = getSelectedLocation();
        const savedIsValid = activeLocations.some(
          (location) => location.location_id === savedLocation,
        );

        if (savedIsValid && savedLocation) {
          setLocationId(savedLocation);
        } else if (activeLocations[0]) {
          saveSelectedLocation(activeLocations[0].location_id);
          setLocationId(activeLocations[0].location_id);
        }
      } finally {
        if (!cancelled) setLocationLoading(false);
      }
    }

    void loadLocations();
    return () => { cancelled = true; };
  }, []);

  const selectedLocation = locations.find((location) => location.location_id === locationId);


  useEffect(() => {
    if (!locationId) return;

    let cancelled = false;

    async function loadOverviewMetrics() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
      if (!session?.access_token || !apiBase) return;

      setOverviewMetrics((current) => ({ ...current, loading: true }));
      const base = apiBase.replace(/\/$/, "");
      const headers = { Authorization: `Bearer ${session.access_token}` };
      const query = `start_date=${startDate}&end_date=${endDate}&location_id=${encodeURIComponent(locationId)}`;

      try {
        const response = await fetch(`${base}/v1/reports/overview?${query}`, {
          headers,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Overview report failed");

        const data = await response.json();
        const dailySeries = Array.isArray(data?.daily_sales)
          ? data.daily_sales.map((point: { date: string; net_sales: number }) => ({
              date: point.date,
              sales: typeof point.net_sales === "number" ? point.net_sales : 0,
            }))
          : [];

        if (!cancelled) {
          setOverviewMetrics({
            netSales: typeof data?.sales?.net_sales === "number" ? data.sales.net_sales : null,
            transactions: typeof data?.sales?.transaction_count === "number" ? data.sales.transaction_count : null,
            laborCost: typeof data?.labor?.labor_cost === "number" ? data.labor.labor_cost : null,
            inventoryItems: typeof data?.inventory?.ingredient_count === "number" ? data.inventory.ingredient_count : null,
            theoreticalCogs: typeof data?.profit?.theoretical_cogs === "number" ? data.profit.theoretical_cogs : null,
            grossProfit: typeof data?.profit?.gross_profit === "number" ? data.profit.gross_profit : null,
            grossMarginPct: typeof data?.profit?.gross_margin_pct === "number" ? data.profit.gross_margin_pct : null,
            contributionAfterLabor: typeof data?.profit?.contribution_after_labor === "number" ? data.profit.contribution_after_labor : null,
            uncostedSalesLines: typeof data?.profit?.uncosted_sales_lines === "number" ? data.profit.uncosted_sales_lines : null,
            loading: false,
          });
          setDailySales(dailySeries);
        }
      } catch {
        if (!cancelled) {
          setOverviewMetrics((current) => ({ ...current, loading: false }));
          setDailySales([]);
        }
      }
    }

    void loadOverviewMetrics();
    return () => { cancelled = true; };
  }, [locationId, startDate, endDate]);

  const formatCurrency = (value: number | null) =>
    value == null ? "—" : new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(value);

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning." : now.getHours() < 18 ? "Good afternoon." : "Good evening.";
  const currentDateLabel = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(now).toUpperCase();

  const metrics = [
    { label: "Net sales", value: overviewMetrics.loading ? "…" : formatCurrency(overviewMetrics.netSales), change: selectedLocation ? selectedLocation.location_name : "Demo data", icon: "↗" },
    { label: "Transactions", value: overviewMetrics.loading ? "…" : overviewMetrics.transactions == null ? "—" : overviewMetrics.transactions.toLocaleString(), change: selectedLocation ? selectedLocation.location_name : "Demo data", icon: "▦" },
    { label: "Labor cost", value: overviewMetrics.loading ? "…" : formatCurrency(overviewMetrics.laborCost), change: selectedLocation ? selectedLocation.location_name : "Demo data", icon: "♙" },
    { label: "Inventory items", value: overviewMetrics.loading ? "…" : overviewMetrics.inventoryItems == null ? "—" : String(overviewMetrics.inventoryItems), change: selectedLocation ? selectedLocation.location_name : "Demo data", icon: "▤" },
  ];

  const handleLocationChange = (nextLocationId: string) => {
    if (!nextLocationId) return;
    saveSelectedLocation(nextLocationId);
    setLocationId(nextLocationId);
    setLocationRefreshKey((key) => key + 1);
  };

  const openPreview = (item: (typeof navigation)[number]) => {
    if (item.path) {
      setPreview({ label: item.label, path: item.path });
    } else {
      setPreview(null);
    }
  };

  const dateRangeValid = startDate <= endDate;

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      const supabase = createClient();
      window.localStorage.removeItem("cafeops_session_started_at");
      await supabase.auth.signOut();
      router.replace("/login");
    } catch {
      // Even if the remote sign-out request fails, remove the local app session marker.
      window.localStorage.removeItem("cafeops_session_started_at");
      router.replace("/login");
    }
  };

  const createReport = () => {
    if (!dateRangeValid || reportCreating) return;
    setReportCreating(true);

    try {
      const locationName = selectedLocation?.location_name ?? (locationId || "Selected location");
      const generatedAt = new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date());

      const moneyValue = (value: number | null) =>
        value == null ? "—" : new Intl.NumberFormat("en-GB", {
          style: "currency",
          currency: "GBP",
        }).format(value);

      const percentValue = (value: number | null) =>
        value == null ? "—" : `${value.toFixed(2)}%`;

      const dailyRows = dailySales.length
        ? dailySales.map((point) => `
            <tr>
              <td>${new Intl.DateTimeFormat("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              }).format(new Date(`${point.date}T00:00:00`))}</td>
              <td class="number">${moneyValue(point.sales)}</td>
            </tr>
          `).join("")
        : `<tr><td colspan="2" class="muted">No daily sales data available.</td></tr>`;

      const reportHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>CaféOps Overview Report — ${locationName}</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    color: #1f2937;
    background: #fff;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11px;
    line-height: 1.5;
  }
  .report { max-width: 760px; margin: 0 auto; }
  .header {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding-bottom: 18px;
    border-bottom: 2px solid #243f35;
  }
  .brand { color: #243f35; font-size: 22px; font-weight: 800; letter-spacing: .2px; }
  .subtitle { margin-top: 3px; color: #667085; font-size: 10px; text-transform: uppercase; letter-spacing: 1.2px; }
  .meta { text-align: right; color: #667085; font-size: 10px; }
  h1 { margin: 24px 0 4px; color: #17221e; font-size: 24px; }
  .period { color: #667085; margin-bottom: 20px; }
  .section { margin-top: 24px; break-inside: avoid; }
  .section h2 {
    margin: 0 0 10px;
    color: #243f35;
    font-size: 13px;
    border-bottom: 1px solid #d9e0dc;
    padding-bottom: 6px;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }
  .kpi {
    border: 1px solid #d9e0dc;
    border-radius: 8px;
    padding: 12px;
    background: #f8faf9;
  }
  .kpi-label { color: #667085; font-size: 9px; text-transform: uppercase; letter-spacing: .7px; }
  .kpi-value { margin-top: 4px; color: #17221e; font-size: 18px; font-weight: 700; }
  .kpi-note { margin-top: 2px; color: #667085; font-size: 9px; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    color: #667085;
    background: #f4f6f5;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: .5px;
  }
  th, td { padding: 7px 8px; border-bottom: 1px solid #e6ebe8; }
  .number { text-align: right; font-variant-numeric: tabular-nums; }
  .muted { color: #667085; }
  .note {
    margin-top: 12px;
    padding: 10px 12px;
    border-left: 3px solid #477e66;
    background: #f4f7f5;
    color: #4b5563;
    font-size: 10px;
  }
  .footer {
    margin-top: 30px;
    padding-top: 10px;
    border-top: 1px solid #d9e0dc;
    display: flex;
    justify-content: space-between;
    color: #7b857f;
    font-size: 9px;
  }
  @media print {
    .report { max-width: none; }
    .section { break-inside: avoid; }
  }
</style>
</head>
<body>
<div class="report">
  <header class="header">
    <div>
      <div class="brand">CaféOps Intelligence</div>
      <div class="subtitle">Operations Performance Report</div>
    </div>
    <div class="meta">
      <div><strong>${locationName}</strong></div>
      <div>Generated ${generatedAt}</div>
    </div>
  </header>

  <h1>Overview Performance Report</h1>
  <div class="period">${startDate} to ${endDate} · ${locationName}</div>

  <section class="section">
    <h2>Executive Summary</h2>
    <div class="kpis">
      <div class="kpi"><div class="kpi-label">Net Sales</div><div class="kpi-value">${moneyValue(overviewMetrics.netSales)}</div><div class="kpi-note">Selected reporting period</div></div>
      <div class="kpi"><div class="kpi-label">Transactions</div><div class="kpi-value">${overviewMetrics.transactions == null ? "—" : overviewMetrics.transactions.toLocaleString("en-GB")}</div><div class="kpi-note">Completed transactions</div></div>
      <div class="kpi"><div class="kpi-label">Labor Cost</div><div class="kpi-value">${moneyValue(overviewMetrics.laborCost)}</div><div class="kpi-note">Recorded labor spend</div></div>
      <div class="kpi"><div class="kpi-label">Inventory Items</div><div class="kpi-value">${overviewMetrics.inventoryItems == null ? "—" : overviewMetrics.inventoryItems}</div><div class="kpi-note">Ingredient records</div></div>
    </div>
  </section>

  <section class="section">
    <h2>Profit Analysis</h2>
    <table>
      <tbody>
        <tr><td>Theoretical COGS</td><td class="number">${moneyValue(overviewMetrics.theoreticalCogs)}</td></tr>
        <tr><td>Gross Profit</td><td class="number">${moneyValue(overviewMetrics.grossProfit)}</td></tr>
        <tr><td>Gross Margin</td><td class="number">${percentValue(overviewMetrics.grossMarginPct)}</td></tr>
        <tr><td>Contribution After Labor</td><td class="number">${moneyValue(overviewMetrics.contributionAfterLabor)}</td></tr>
      </tbody>
    </table>
    <div class="note">
      Profit is an estimated gross-profit view based on theoretical recipe cost. It excludes rent, utilities,
      payment fees, waste, taxes, and other operating expenses not represented in the demo data.
    </div>
  </section>

  <section class="section">
    <h2>Daily Sales</h2>
    <table>
      <thead><tr><th>Date</th><th class="number">Net Sales</th></tr></thead>
      <tbody>${dailyRows}</tbody>
    </table>
  </section>

  <footer class="footer">
    <span>CaféOps Intelligence · Portfolio demo</span>
    <span>Synthetic data</span>
  </footer>
</div>
</body>
</html>`;

      // Render the report in one hidden print frame.
      // Printing is triggered only once from the iframe load handler.
      const printFrame = document.createElement("iframe");
      printFrame.setAttribute("aria-hidden", "true");
      printFrame.style.position = "fixed";
      printFrame.style.width = "1px";
      printFrame.style.height = "1px";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.border = "0";
      printFrame.style.opacity = "0";
      document.body.appendChild(printFrame);

      const printDocument = printFrame.contentDocument;
      const printWindow = printFrame.contentWindow;

      if (!printDocument || !printWindow) {
        printFrame.remove();
        throw new Error("Unable to prepare the report for printing.");
      }

      printDocument.open();
      printDocument.write(reportHtml);
      printDocument.close();

      printFrame.onload = () => {
        window.setTimeout(() => {
          printWindow.focus();
          printWindow.print();
          window.setTimeout(() => printFrame.remove(), 1000);
        }, 250);
      };
    } finally {
      setReportCreating(false);
    }
  };

  return (
    <main className="app-shell">
      <style>{`
        /* Compact sidebar: content-sized, fixed independently from the main page height. */
        .app-shell > .sidebar {
          align-self: flex-start !important;
          height: fit-content !important;
          min-height: 0 !important;
          max-height: calc(100vh - 24px) !important;
          position: sticky !important;
          top: 10px !important;
          overflow: visible !important;
          display: flex !important;
          flex-direction: column !important;
          gap: 0 !important;
        }
        .app-shell > .sidebar .brand {
          flex: 0 0 auto !important;
          margin-bottom: 30px !important;
        }
        .app-shell > .sidebar .workspace-label {
          margin-bottom: 6px !important;
          margin-top: 15px !important;
          letter-spacing: .08em !important;
        }
        .app-shell > .sidebar .location-selector-shell {
          flex: 0 0 auto !important;
          margin-bottom: 8px !important;
        }
        .app-shell > .sidebar .location-select {
          min-height: 44px !important;
          padding: 10px 9px !important;
        }
        .app-shell > .sidebar .location-select-copy {
          line-height: 1.15 !important;
        }
        .app-shell > .sidebar .location-select-copy strong {
          font-size: 12px !important;
        }
        .app-shell > .sidebar .location-select-copy small {
          font-size: 10px !important;
        }
        .app-shell > .sidebar .navigation {
          flex: 0 0 auto !important;
          margin-top: 0 !important;
          gap: 2px !important;
        }
        .app-shell > .sidebar .ai-card {
          flex: 0 0 auto !important;
          margin-top: 30px !important;
          margin-bottom: 30px !important;
          padding: 8px !important;
        }
        .app-shell > .sidebar .nav-link {
          min-height: 31px !important;
          padding: 5px 9px !important;
          font-size: 12px !important;
        }
        .app-shell > .sidebar .nav-icon {
          font-size: 14px !important;
        }
        .app-shell > .sidebar .sidebar-bottom {
          flex: 0 0 auto !important;
          margin-top: 14px !important;
          padding-top: 10px !important;
          border-top: 1px solid rgba(148, 163, 184, 0.22) !important;
        }
        .app-shell > .sidebar .ai-card p {
          margin: 5px 5px 7px 5px !important;
          font-size: 12px !important;
          line-height: 1.35 !important;
        }
        .app-shell > .sidebar .ai-card button {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 5px !important;
          min-height: 29px !important;
          padding: 5px 10px !important;
          border: 1px solid rgba(71, 126, 102, 0.22) !important;
          border-radius: 7px !important;
          background: rgba(71, 126, 102, 0.04) !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          cursor: pointer !important;
          transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease !important;
        }
        .app-shell > .sidebar .ai-card button:hover,
        .app-shell > .sidebar .ai-card button:focus-visible {
          transform: translateY(-1px) !important;
          background: rgba(71, 126, 102, 0.10) !important;
          border-color: rgba(71, 126, 102, 0.35) !important;
          box-shadow: 0 2px 8px rgba(15, 23, 42, 0.12) !important;
        }
        .app-shell > .sidebar .ai-card button:active {
          transform: translateY(0) !important;
        }
        .app-shell > .sidebar .profile {
          min-height: 40px !important;
          margin-top: 30px !important;
          padding: 15px 10px !important;
        }
        .app-shell > .sidebar .profile small {
          font-size: 12px !important;
        }
        .app-shell > .sidebar .profile-menu {
          min-width: 68px !important;
          width: auto !important;
          height: 30px !important;
        }
        .app-shell > .sidebar .logout-button {
          position: relative !important;
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          flex: 0 0 34px !important;
          min-width: 34px !important;
          width: 34px !important;
          height: 30px !important;
          padding: 0 !important;
          border: 1px solid transparent !important;
          border-radius: 7px !important;
          background: transparent !important;
          cursor: pointer !important;
          transition: background-color 120ms ease, border-color 120ms ease, transform 120ms ease !important;
        }
        .app-shell > .sidebar .logout-button:hover,
        .app-shell > .sidebar .logout-button:focus-visible {
          background: rgba(15, 23, 42, 0.07) !important;
          border-color: rgba(15, 23, 42, 0.12) !important;
          transform: translateY(-1px) !important;
        }
        .app-shell > .sidebar .logout-power-icon {
          display: inline-flex !important;
          align-items: center !important;
          justify-content: center !important;
          font-size: 19px !important;
          line-height: 1 !important;
          transition: transform 120ms ease !important;
        }
        .app-shell > .sidebar .logout-button:hover .logout-power-icon,
        .app-shell > .sidebar .logout-button:focus-visible .logout-power-icon {
          transform: scale(1.08) !important;
        }
        .app-shell > .sidebar .logout-button:disabled {
          cursor: wait !important;
          opacity: 0.6 !important;
        }
        @media (max-height: 760px) {
          .app-shell > .sidebar .brand { margin-bottom: 22px !important; }
          .app-shell > .sidebar .location-selector-shell { margin-bottom: 5px !important; }
          .app-shell > .sidebar .location-select { min-height: 42px !important; padding: 6px 8px !important; }
          .app-shell > .sidebar .nav-link { min-height: 30px !important; padding: 5px 8px !important; }
          .app-shell > .sidebar .ai-card { padding: 7px !important; }
          .app-shell > .sidebar .ai-card p { display: none !important; }
          .app-shell > .sidebar .sidebar-bottom { margin-top: 9px !important; padding-top: 7px !important; }
        }
      `}</style>
      <aside
        className="sidebar"
        style={{
          alignSelf: "flex-start",
          height: "fit-content",
          maxHeight: "calc(100vh - 24px)",
          position: "sticky",
          top: 12,
          overflow: "visible",
        }}
      >
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>CaféOps</strong>
            <span>INTELLIGENCE</span>
          </div>
        </div>

        <div className="workspace-label">WORKSPACE</div>
        <div className="location-selector-shell">
          <label className="location-select" htmlFor="workspace-location">
            <span className="location-dot" />
            <span className="location-select-copy">
              <strong>{selectedLocation?.location_name ?? (locationLoading ? "Loading location…" : "Choose workspace location")}</strong>
              <small>{selectedLocation?.location_id ?? "Location"}</small>
            </span>
            <select
              id="workspace-location"
              value={locationId}
              onChange={(event) => handleLocationChange(event.target.value)}
              disabled={locationLoading || locations.length === 0}
              aria-label="Select café location"
            >
              {!locationId && <option value="">Select location</option>}
              {locations.map((location) => (
                <option key={location.location_id} value={location.location_id}>
                  {location.location_name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <nav className="navigation" aria-label="Main navigation">
          {navigation.map((item) => (
            <button
              key={item.label}
              type="button"
              className={`nav-link ${
                (item.path === null && preview === null) ||
                preview?.label === item.label
                  ? "active"
                  : ""
              }`}
              aria-current={
                (item.path === null && preview === null) ||
                preview?.label === item.label
                  ? "page"
                  : undefined
              }
              onClick={() => openPreview(item)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="ai-card">
          <div className="ai-symbol">✳</div>
          <strong>Ask CaféOps AI Assistant</strong>
          <p>Explore your café performance with natural language.</p>
          <button
            type="button"
            onClick={() => setPreview({ label: "AI Assistant", path: "/assistant" })}
          >
            Ask now <span>↗</span>
          </button>
        </div>

        <div className="sidebar-bottom">
          <div className="profile" aria-label="Signed-in account">
            <div className="avatar">FM</div>
            <div>
              <strong>Workspace user</strong>
              <small>Demo account</small>
            </div>
            <button
              type="button"
              className="profile-menu logout-button"
              onClick={() => void handleLogout()}
              disabled={loggingOut}
              aria-label={loggingOut ? "Signing out" : "Sign out"}
              title={loggingOut ? "Signing out…" : "Sign out"}
            >
              <span className="logout-power-icon" aria-hidden="true">⏻</span>
              <span className="sr-only">{loggingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>
        </div>
      </aside>

      <section className={`main-panel${preview ? " module-mode" : ""}`}>
        {preview ? (
          <div className="module-workspace" aria-label={`${preview.label} module`}>
            <div className="module-preview-body">
              <iframe
                key={`${preview.path}:${locationId}`}
                src={preview.path}
                title={`${preview.label} module`}
                className="module-preview-frame"
              />
            </div>
          </div>
        ) : (
        <>
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span>/</span>
            <strong>Overview</strong>
            {selectedLocation && (
              <>
                <span>/</span>
                <strong>{selectedLocation.location_name}</strong>
              </>
            )}
          </div>
          <div className="topbar-right">
            <span className="demo-badge">
              <span /> DEMO MODE
            </span>
            <ApiStatus />
            <div className="date-button date-range-picker" role="group" aria-label="Overview date range">
              <span aria-hidden="true">◷</span>
              <label>
                <span className="sr-only">Start date</span>
                <input
                  type="date"
                  value={startDate}
                  max={endDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  aria-label="Start date"
                />
              </label>
              <span>–</span>
              <label>
                <span className="sr-only">End date</span>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(event) => setEndDate(event.target.value)}
                  aria-label="End date"
                />
              </label>
            </div>
          </div>
        </header>

        <div className="dashboard-content" key={locationRefreshKey}>
          <section className="welcome">
            <div>
              <p className="eyebrow">{currentDateLabel}</p>
              <h1>{greeting}</h1>
              <p className="welcome-copy">
                Here&apos;s what&apos;s happening at {selectedLocation?.location_name ?? "your selected location"}.
              </p>
            </div>
            <button
              className="report-button"
              type="button"
              onClick={createReport}
              disabled={!dateRangeValid || reportCreating || overviewMetrics.loading}
              title={!dateRangeValid ? "Choose a valid date range." : "Download the current overview as a CSV report."}
            >
              <span>＋</span> {reportCreating ? "Creating…" : "Create report"}
            </button>
          </section>

          <div className="demo-notice">
            <span className="notice-icon">ⓘ</span>
            <p>
              <strong>{selectedLocation?.location_name ?? "Demo dashboard"}</strong> — metrics below use synthetic
              data for the selected workspace location and selected date range.
            </p>
          </div>
          {!dateRangeValid && (
            <p className="text-sm text-red-700" role="alert">
              End date must be on or after the start date.
            </p>
          )}

          <section className="metrics-grid" aria-label="Key metrics">
            {metrics.map((metric) => (
              <article className="metric-card" key={metric.label}>
                <div className="metric-top">
                  <span>{metric.label}</span>
                  <span className="metric-icon">{metric.icon}</span>
                </div>
                <strong className="metric-value">{metric.value}</strong>
                <div className="metric-foot">
                  <span className="neutral-dot" />
                  {metric.change}
                </div>
              </article>
            ))}
          </section>

          <section className="content-grid">
            <article className="panel sales-panel">
              <div className="panel-heading">
                <div>
                  <h2>Sales performance</h2>
                  <p>Net sales across the selected period</p>
                </div>
                <button type="button" className="more-button" disabled>
                  •••
                </button>
              </div>

              <div className="chart-summary">
                <strong>{overviewMetrics.loading ? "…" : formatCurrency(overviewMetrics.netSales)}</strong>
                <span>August 2026 · {selectedLocation?.location_name ?? "Demo"}</span>
              </div>

              <div className="chart-placeholder">
                <div className="chart-y-labels">
                  {(() => {
                    const maxSales = Math.max(...dailySales.map((point) => point.sales), 0);
                    const step = maxSales > 0 ? Math.ceil(maxSales / 4 / 100) * 100 : 100;
                    const ceiling = Math.max(step * 4, 100);
                    return [ceiling, step * 3, step * 2, step, 0].map((value) => (
                      <span key={value}>{value >= 1000 ? `£${(value / 1000).toFixed(value % 1000 ? 1 : 0)}k` : `£${value}`}</span>
                    ));
                  })()}
                </div>
                <div className="chart-area">
                  <div className="chart-grid-lines">
                    <i /><i /><i /><i /><i />
                  </div>
                  {dailySales.length > 0 ? (
                    <svg
                      className="chart-line"
                      viewBox="0 0 600 190"
                      preserveAspectRatio="none"
                      role="img"
                      aria-label={`Daily net sales for ${selectedLocation?.location_name ?? "selected location"} from ${startDate} through ${endDate}`}
                    >
                      {(() => {
                        const maxSales = Math.max(...dailySales.map((point) => point.sales), 1);
                        const chartPoints = dailySales.map((point, index) => ({
                          ...point,
                          x: (index / Math.max(dailySales.length - 1, 1)) * 600,
                          y: 175 - (point.sales / maxSales) * 155,
                        }));
                        const points = chartPoints.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(" ");
                        return (
                          <>
                            <polyline points={`${points} 600,190 0,190`} fill="rgba(71,126,102,.10)" stroke="none" />
                            <polyline points={points} fill="none" stroke="#477e66" strokeWidth="3" vectorEffect="non-scaling-stroke" />
                            {chartPoints.map((point, index) => (
                              <g
                                key={point.date}
                                onMouseEnter={() => setHoveredSalesIndex(index)}
                                onMouseLeave={() => setHoveredSalesIndex(null)}
                                style={{ cursor: "crosshair" }}
                              >
                                <circle cx={point.x} cy={point.y} r="12" fill="transparent" />
                                <circle
                                  cx={point.x}
                                  cy={point.y}
                                  r={hoveredSalesIndex === index ? 5 : 3}
                                  fill="#477e66"
                                  stroke="white"
                                  strokeWidth="2"
                                  vectorEffect="non-scaling-stroke"
                                />
                                <title>{`${new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${point.date}T00:00:00`))}: £${point.sales.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}</title>
                              </g>
                            ))}
                          </>
                        );
                      })()}
                    </svg>
                  ) : (
                    <div className="chart-unavailable-message">
                      <strong>Loading daily sales…</strong>
                      <span>Loading every calendar day in the selected period.</span>
                    </div>
                  )}
                  {hoveredSalesIndex !== null && dailySales[hoveredSalesIndex] && (() => {
                    const hoveredPoint = dailySales[hoveredSalesIndex];
                    const maxSales = Math.max(...dailySales.map((point) => point.sales), 1);
                    const pointX = (hoveredSalesIndex / Math.max(dailySales.length - 1, 1)) * 100;
                    const pointY = 92 - (hoveredPoint.sales / maxSales) * 81.5;
                    return (
                      <div
                        className="sales-chart-tooltip"
                        role="status"
                        style={{
                          left: `${Math.min(96, Math.max(4, pointX))}%`,
                          top: `${Math.max(2, pointY)}%`,
                        }}
                      >
                        <strong>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${hoveredPoint.date}T00:00:00`))}</strong>
                        <span>£{hoveredPoint.sales.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    );
                  })()}
                  <div className="chart-x-labels">
                    {dailySales.map((point, index) => (
                      index === 0 || index === 7 || index === 14 || index === 21 || index === 30 ? (
                        <span key={point.date}>{new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric" }).format(new Date(`${point.date}T00:00:00`))}</span>
                      ) : <span key={point.date} aria-hidden="true" />
                    ))}
                  </div>
                </div>
              </div>
              <p className="chart-caption">
                Daily net sales · {selectedLocation?.location_name ?? "selected location"} · {startDate} to {endDate}
              </p>
            </article>

            <article className="panel operations-panel">
              <div className="panel-heading">
                <div>
                  <h2>Operations snapshot</h2>
                  <p>Items to review</p>
                </div>
                <span className="snapshot-icon">⌁</span>
              </div>

              <button type="button" className="snapshot-item" onClick={() => setPreview({ label: "Inventory", path: "/inventory" })}>
                <div className="snapshot-symbol inventory-symbol">▤</div>
                <div className="snapshot-copy">
                  <strong>Inventory overview</strong>
                  <p>{overviewMetrics.inventoryItems ?? "—"} ingredient records in demo snapshot</p>
                </div>
                <span className="snapshot-arrow">→</span>
              </button>

              <button type="button" className="snapshot-item" onClick={() => setPreview({ label: "Menu & Costs", path: "/menu-costs" })}>
                <div className="snapshot-symbol cost-symbol">£</div>
                <div className="snapshot-copy">
                  <strong>Menu costing</strong>
                  <p>12 menu items in demo snapshot</p>
                </div>
                <span className="snapshot-arrow">→</span>
              </button>

              <button type="button" className="snapshot-item" onClick={() => setPreview({ label: "Labor", path: "/labor" })}>
                <div className="snapshot-symbol labor-symbol">♙</div>
                <div className="snapshot-copy">
                  <strong>Labor performance</strong>
                  <p>744 scheduled hours in demo data</p>
                </div>
                <span className="snapshot-arrow">→</span>
              </button>

              <div className="snapshot-foot">
                <span className="status-dot" />
                Snapshot values are synthetic
              </div>
            </article>
          </section>

          <section className="panel profit-panel">
            <div className="panel-heading">
              <div>
                <h2>Profit analysis</h2>
                <p>Gross profit based on theoretical recipe cost for the selected period</p>
              </div>
              <span className="snapshot-icon">£</span>
            </div>

            <div className="profit-grid">
              <div className="profit-metric">
                <span>Theoretical COGS</span>
                <strong>{overviewMetrics.loading ? "…" : formatCurrency(overviewMetrics.theoreticalCogs)}</strong>
                <small>Current ingredient unit costs × sold recipe quantities</small>
              </div>
              <div className="profit-metric">
                <span>Gross profit</span>
                <strong>{overviewMetrics.loading ? "…" : formatCurrency(overviewMetrics.grossProfit)}</strong>
                <small>Net sales − theoretical COGS</small>
              </div>
              <div className="profit-metric">
                <span>Gross margin</span>
                <strong>{overviewMetrics.loading ? "…" : overviewMetrics.grossMarginPct == null ? "—" : `${overviewMetrics.grossMarginPct.toFixed(2)}%`}</strong>
                <small>Gross profit ÷ net sales</small>
              </div>
              <div className="profit-metric">
                <span>Contribution after labor</span>
                <strong>{overviewMetrics.loading ? "…" : formatCurrency(overviewMetrics.contributionAfterLabor)}</strong>
                <small>Gross profit − recorded labor cost</small>
              </div>
            </div>

            <div className="profit-note">
              <span className="status-dot" />
              {overviewMetrics.uncostedSalesLines && overviewMetrics.uncostedSalesLines > 0
                ? `${overviewMetrics.uncostedSalesLines} sales lines could not be fully costed; profit is shown as unavailable.`
                : "Profit is an estimated gross-profit view. It excludes rent, utilities, fees, waste, taxes, and other operating expenses not represented in the demo data."}
            </div>
          </section>

          <footer className="dashboard-footer">
            <span>© 2026 CaféOps Intelligence</span>
            <span>Portfolio demo · Synthetic data</span>
          </footer>
        </div>
        </>
        )}
      </section>
    </main>
  );
}
