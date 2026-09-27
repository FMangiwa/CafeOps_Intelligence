"use client";

import { saveSelectedLocation } from "@/lib/location";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Location = {
  location_id: string;
  location_name: string;
  status: string;
};

export default function LocationsPage() {
  const router = useRouter();
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error("Unable to read your login session.");
      }

      if (!session) {
        router.replace("/login");
        return;
      }

      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

      if (!apiBaseUrl) {
        throw new Error("The API base URL is not configured.");
      }

      const response = await fetch(`${apiBaseUrl}/v1/locations`, {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        cache: "no-store",
      });

      if (response.status === 401) {
        await supabase.auth.signOut();
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        throw new Error(
          response.status === 403
            ? "Your account has no access to these locations."
            : `The API returned an error (${response.status}).`,
        );
      }

      const data: unknown = await response.json();

      if (!Array.isArray(data)) {
        throw new Error("Unexpected locations response from the API.");
      }

      setLocations(data as Location[]);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load locations.",
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const handleSelectLocation = (locationId: string) => {
    const selectedLocation = locations.find(
      (location) => location.location_id === locationId
    );
  
    if (!selectedLocation || selectedLocation.status !== "active") {
      return;
    }
  
    saveSelectedLocation(locationId);
    router.push("/");
  };

  return (
    <main className="locations-page">
      <header className="locations-header">
        <div className="brand">
          <div className="brand-mark">C</div>
          <div>
            <strong>CaféOps</strong>
            <span>INTELLIGENCE</span>
          </div>
        </div>

        <button
          type="button"
          className="signout-button"
          onClick={handleSignOut}
        >
          Sign out
        </button>
      </header>

      <section className="locations-content">
        <p className="eyebrow">WORKSPACE</p>
        <h1>Your locations</h1>
        <p className="locations-description">
          Choose a location to continue to CaféOps.
        </p>

        {loading && <p>Loading locations…</p>}

        {error && (
          <div className="locations-error" role="alert">
            <p>{error}</p>
            <button
              type="button"
              onClick={() => void loadLocations()}
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && locations.length === 0 && (
          <div className="locations-empty">
            No accessible locations were returned for this account.
          </div>
        )}

        {!loading && !error && locations.length > 0 && (
          <div className="locations-list">
            {locations.map((location) => {
              const isActive = location.status === "active";

              return (
                <button
                  type="button"
                  className="location-card"
                  key={location.location_id}
                  disabled={!isActive}
                  onClick={() => handleSelectLocation(location.location_id)}
                >
                  <span
                    className={`location-card-dot ${
                      isActive ? "is-active" : "is-inactive"
                    }`}
                  />

                  <span className="location-card-info">
                    <strong>{location.location_name}</strong>
                    <span>
                      {location.location_id} · {location.status}
                    </span>
                  </span>

                  <span className="location-card-action">
                    {isActive ? "Open →" : "Unavailable"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}