import { ensureApiKeysLoaded, getApiKey } from "@/shared/config/api-keys";

export interface GeocodedLocation {
  label: string;
  latitude: number;
  longitude: number;
  confidence?: number;
  raw?: unknown;
}

const getGoogleMapsApiKey = (): string | undefined => getApiKey("google_maps");

export const hasGoogleMapsConfiguration = (): boolean => {
  const key = getGoogleMapsApiKey();
  return typeof key === "string" && key.trim().length > 0;
};

const googleLocationTypeToConfidence = (locationType?: string): number | undefined => {
  switch (locationType) {
    case "ROOFTOP":
      return 10;
    case "RANGE_INTERPOLATED":
      return 8;
    case "GEOMETRIC_CENTER":
      return 6;
    case "APPROXIMATE":
      return 4;
    default:
      return undefined;
  }
};

export const fetchGeocodedLocation = async (query: string): Promise<GeocodedLocation | null> => {
  await ensureApiKeysLoaded();
  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    console.warn("Google Maps Geocoding API key is not configured. Set VITE_GOOGLE_MAPS_API_KEY to enable geocoding.");
    return null;
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  const params = new URLSearchParams({
    address: trimmedQuery,
    key: apiKey,
    language: "en",
    region: "ca",
  });
  const endpoint = `https://maps.googleapis.com/maps/api/geocode/json?${params.toString()}`;

  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.debug("[Geocoding] request", { endpoint });
  }

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Google Geocoding request failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    console.debug("[Geocoding] response", { status: payload?.status, resultCount: payload?.results?.length });
  }
  const result = Array.isArray(payload?.results) ? payload.results[0] : undefined;
  if (!result) {
    if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
      console.debug("[Geocoding] no results");
    }
    return null;
  }

  const location = result.geometry?.location;
  const lat = typeof location?.lat === "number" ? location.lat : undefined;
  const lng = typeof location?.lng === "number" ? location.lng : undefined;
  if (typeof lat !== "number" || typeof lng !== "number") {
    return null;
  }

  const confidence = googleLocationTypeToConfidence(result.geometry?.location_type);
  const label = result.formatted_address ?? trimmedQuery;

  return {
    label,
    latitude: lat,
    longitude: lng,
    confidence,
    raw: result,
  };
};
