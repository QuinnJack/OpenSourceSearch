export interface GeocodedLocation {
  label: string;
  latitude: number;
  longitude: number;
  confidence?: number;
  raw?: unknown;
}

const getGeoapifyApiKey = (): string | undefined => {
  if (typeof import.meta === "undefined" || typeof import.meta.env !== "object") {
    return undefined;
  }

  const env = import.meta.env as Record<string, string | undefined>;
  return env.VITE_GEOAPIFY_API_KEY;
};

export const hasGeoapifyConfiguration = (): boolean => {
  const key = getGeoapifyApiKey();
  return typeof key === "string" && key.trim().length > 0;
};

const coerceCoordinates = (payload: unknown): { lat?: number; lon?: number } => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  if ("lat" in payload && "lon" in payload && typeof (payload as { lat: unknown }).lat === "number" && typeof (payload as { lon: unknown }).lon === "number") {
    return {
      lat: (payload as { lat: number }).lat,
      lon: (payload as { lon: number }).lon,
    };
  }

  if ("geometry" in payload && Array.isArray((payload as { geometry?: { coordinates?: unknown } }).geometry?.coordinates)) {
    const coords = (payload as { geometry?: { coordinates?: unknown[] } }).geometry?.coordinates as unknown[];
    const lon = typeof coords?.[0] === "number" ? coords[0] : undefined;
    const lat = typeof coords?.[1] === "number" ? coords[1] : undefined;
    return { lat, lon };
  }

  return {};
};

const extractConfidence = (payload: unknown): number | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }
  const rank = (payload as { rank?: { confidence?: number } }).rank;
  return typeof rank?.confidence === "number" ? rank.confidence : undefined;
};

export const fetchGeocodedLocation = async (query: string): Promise<GeocodedLocation | null> => {
  const apiKey = getGeoapifyApiKey();
  if (!apiKey) {
    console.warn("Geoapify API key is not configured. Set VITE_GEOAPIFY_API_KEY to enable geocoding.");
    return null;
  }

  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return null;
  }

  const endpoint = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(trimmedQuery)}&limit=1&format=json&apiKey=${apiKey}`;
  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error(`Geoapify geocode request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const feature = Array.isArray(payload?.features) ? payload.features[0] : undefined;
  const result = Array.isArray(payload?.results) ? payload.results[0] : undefined;
  const record = result ?? feature?.properties ?? feature;

  const { lat, lon } = coerceCoordinates(result ?? feature);
  if (typeof lat !== "number" || typeof lon !== "number") {
    return null;
  }

  const confidence = extractConfidence(result ?? feature?.properties);
  const label =
    (result && (result.formatted || result.address_line1 || result.name)) ||
    feature?.properties?.formatted ||
    trimmedQuery;

  return {
    label,
    latitude: lat,
    longitude: lon,
    confidence,
    raw: record,
  };
};
