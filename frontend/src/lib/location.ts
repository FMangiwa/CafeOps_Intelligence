export const SELECTED_LOCATION_KEY = "cafeops_selected_location";

export function saveSelectedLocation(locationId: string) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    SELECTED_LOCATION_KEY,
    locationId
  );
}

export function getSelectedLocation(): string | null {
  if (typeof window === "undefined") return null;

  return window.localStorage.getItem(
    SELECTED_LOCATION_KEY
  );
}