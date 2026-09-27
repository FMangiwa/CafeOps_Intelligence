"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getSelectedLocation,
  saveSelectedLocation,
} from "@/lib/location";

type Location = {
  location_id: string;
  location_name: string;
};

export const LOCATION_CHANGE_EVENT = "cafeops-location-change";

export function useSelectedLocation() {
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locationReady, setLocationReady] = useState(false);

  useEffect(() => {
    const sync = () => {
      setLocationId(getSelectedLocation());
      setLocationReady(true);
    };

    sync();

    window.addEventListener(LOCATION_CHANGE_EVENT, sync);
    window.addEventListener("storage", sync);

    return () => {
      window.removeEventListener(LOCATION_CHANGE_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return { locationId, locationReady };
}

export default function LocationSelector() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [locationId, setLocationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLocations = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

      if (!baseUrl) {
        throw new Error("API base URL is not configured.");
      }

      const supabase = createClient();
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session?.access_token) {
        throw new Error("Please sign in to select a location.");
      }

      const response = await fetch(
        `${baseUrl.replace(/\/$/, "")}/v1/locations`,
        {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            Accept: "application/json",
          },
          cache: "no-store",
        },
      );

      if (!response.ok) {
        throw new Error(`Could not load locations (${response.status}).`);
      }

      const payload: unknown = await response.json();

      if (!Array.isArray(payload)) {
        throw new Error("Unexpected locations response.");
      }

      const validLocations = payload.filter(
        (item): item is Location =>
          typeof item === "object" &&
          item !== null &&
          typeof item.location_id === "string" &&
          typeof item.location_name === "string",
      );

      setLocations(validLocations);

      const savedId = getSelectedLocation();
      const savedExists = validLocations.some(
        (item) => item.location_id === savedId,
      );

      const nextId = savedExists
        ? savedId!
        : validLocations[0]?.location_id ?? "";

      setLocationId(nextId);

      if (nextId && nextId !== savedId) {
        saveSelectedLocation(nextId);
        window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load locations.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLocations();
  }, [loadLocations]);

  function handleChange(nextId: string) {
    setLocationId(nextId);

    if (!nextId) return;

    saveSelectedLocation(nextId);
    window.dispatchEvent(new Event(LOCATION_CHANGE_EVENT));
  }

  const selectedLocation = locations.find(
    (item) => item.location_id === locationId,
  );

  return (
    <div className="space-y-1">
      <label
        htmlFor="cafeops-location-selector"
        className="block text-xs font-medium text-muted-foreground"
      >
        Location
      </label>

      <select
        id="cafeops-location-selector"
        value={locationId}
        onChange={(event) => handleChange(event.target.value)}
        disabled={loading || locations.length === 0}
        className="w-full max-w-sm rounded-lg border bg-background px-3 py-2 text-sm disabled:opacity-60"
      >
        {loading && <option value="">Loading locations…</option>}

        {!loading && locations.length === 0 && (
          <option value="">No locations available</option>
        )}

        {locations.map((location) => (
          <option
            key={location.location_id}
            value={location.location_id}
          >
            {location.location_name}
          </option>
        ))}
      </select>

      {selectedLocation && (
        <p className="text-xs text-muted-foreground">
          ID: {selectedLocation.location_id}
        </p>
      )}

      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
