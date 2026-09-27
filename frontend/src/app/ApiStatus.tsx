
"use client";

import { useEffect, useState } from "react";

type HealthResponse = {
  status: string;
  service: string;
  version: string;
};

export default function ApiStatus() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

    if (!apiBaseUrl) {
      setError(true);
      return;
    }

    const controller = new AbortController();

    async function checkHealth() {
      try {
        const response = await fetch(`${apiBaseUrl}/health`, {
          signal: controller.signal,
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error("API health request failed");
        }

        const data: HealthResponse = await response.json();
        setHealth(data);
        setError(false);
      } catch {
        if (!controller.signal.aborted) {
          setHealth(null);
          setError(true);
        }
      }
    }

    void checkHealth();

    return () => controller.abort();
  }, []);

  if (health?.status === "ok") {
    return (
      <span className="api-status api-online" title={`${health.service} v${health.version}`}>
        <span />
        API CONNECTED
      </span>
    );
  }

  return (
    <span className="api-status api-offline">
      <span />
      {error ? "API OFFLINE" : "CHECKING API"}
    </span>
  );
}