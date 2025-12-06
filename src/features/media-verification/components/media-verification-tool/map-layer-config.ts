import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from "geojson";

import type { SelectItemType } from "@/components/ui/select/select";

export type ViewType = "general" | "wildfires" | "hurricanes" | "infrastructure";

export const VIEW_TYPE_OPTIONS: SelectItemType[] = [
  { id: "general", label: "General" },
  { id: "wildfires", label: "Wildfires" },
  { id: "hurricanes", label: "Hurricanes" },
  { id: "infrastructure", label: "Infrastructure" },
];

export const CAMERA_LAYER_ID = "ottawa-cameras";

interface MapLayerBaseConfig {
  id: string;
  label: string;
  description: string;
  viewTypes: ViewType[];
  colorHex?: string;
  hoverColorHex?: string;
}

export interface DataMapLayerConfig<TData = unknown> extends MapLayerBaseConfig {
  kind: "data";
  fetcher: (options: { signal: AbortSignal }) => Promise<TData[]>;
}

export interface CameraLayerConfig extends MapLayerBaseConfig {
  kind: "camera";
}

export interface PlaceholderLayerConfig extends MapLayerBaseConfig {
  kind: "placeholder";
}

export type MapLayerConfig = DataMapLayerConfig | CameraLayerConfig | PlaceholderLayerConfig;

const DOB_INCIDENTS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/DOB_Incidents_public/FeatureServer/0/query?f=json&where=1%3D1&outFields=*&returnGeometry=true&spatialRel=esriSpatialRelIntersects";
const ACTIVE_WILDFIRES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/cwfis_active_fires_updated_view/FeatureServer/0/query?where=1%3D1&outFields=*&geometryType=esriGeometryEnvelope&spatialRel=esriSpatialRelIntersects&returnGeometry=true&f=pgeojson";
const FIRE_DANGER_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/perimeters/FeatureServer/0/query?where=1%3D1&outFields=*&returnGeometry=true&returnExceededLimitFeatures=true&f=pgeojson";
const MAX_WEB_MERCATOR_EXTENT = 20037508.34;
const POINT_OF_ENTRY_BASE_URL = "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/Point_of_Entry/FeatureServer";
const POINT_OF_ENTRY_LAYERS: Array<{ id: number; type: BorderEntryType }> = [
  { id: 0, type: "air" },
  { id: 1, type: "crossing" },
  { id: 2, type: "land" },
];

const DOB_STATUS_LABELS: Record<string, string> = {
  "1": "Open",
  "2": "Closed",
  "3": "Inactive",
  "4": "Resolved",
  "5": "Upcoming",
};

const WILDFIRE_STAGE_LABELS: Record<string, string> = {
  UC: "Under Control",
  BH: "Being Held",
  OC: "Out of Control",
  NW: "Not Yet Under Control",
};

export interface DobIncidentFeature {
  id: string;
  title: string;
  description: string;
  location: string;
  status: string;
  categoryCode: string | null;
  scope: string | null;
  approved: string | null;
  longitude: number;
  latitude: number;
  attributes: Record<string, unknown>;
}

export interface WildfireFeature {
  id: string;
  agency: string;
  name: string;
  longitude: number;
  latitude: number;
  hectares: number | null;
  stageOfControl: string;
  responseType: string;
  startDate: string | null;
  timezone: string | null;
}

export type FireDangerLevel = "low" | "moderate" | "high" | "very-high" | "extreme" | "nil";

export interface FireDangerFeature {
  id: string;
  uid: number | null;
  hcount: number | null;
  area: number | null;
  firstDate: string | null;
  lastDate: string | null;
  consisId: number | null;
  dangerLevel: FireDangerLevel;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export type BorderEntryType = "air" | "land" | "crossing";

export interface BorderEntryFeature {
  id: string;
  name: string;
  code?: string;
  region?: string;
  province?: string;
  address?: string;
  postalCode?: string;
  place?: string;
  longitude: number;
  latitude: number;
  entryType: BorderEntryType;
  url?: string;
}

const convertWebMercatorToLngLat = (x?: number, y?: number) => {
  if (typeof x !== "number" || typeof y !== "number") {
    return null;
  }
  const longitude = (x / MAX_WEB_MERCATOR_EXTENT) * 180;
  let latitude = (y / MAX_WEB_MERCATOR_EXTENT) * 180;
  latitude = (180 / Math.PI) * (2 * Math.atan(Math.exp((latitude * Math.PI) / 180)) - Math.PI / 2);
  return { longitude, latitude };
};

const normalizeDobIncidents = (features: Array<{ attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } }>) => {
  return (
    features
      ?.map((feature, index) => {
        if (!feature?.attributes) {
          return null;
        }
        const coords = convertWebMercatorToLngLat(feature.geometry?.x, feature.geometry?.y);
        if (!coords) {
          return null;
        }
        const statusValue = (feature.attributes.display_status ?? feature.attributes.Status) as string | undefined;
        const statusLabel = (() => {
          if (!statusValue) {
            return "Unknown";
          }
          const trimmed = String(statusValue).trim();
          return DOB_STATUS_LABELS[trimmed] ?? trimmed;
        })();
        return {
          id: String(
            feature.attributes.GlobalID ??
              feature.attributes.OBJECTID ??
              feature.attributes.display_IncidentNum ??
              feature.attributes.IncidentNum ??
              `incident-${index}`,
          ),
          title: String(feature.attributes.display_Title_EN ?? feature.attributes.Title_EN ?? "Untitled"),
          description: String(feature.attributes.display_Description_EN ?? feature.attributes.Description_EN ?? ""),
          location: String(feature.attributes.display_location ?? feature.attributes.Location ?? "Unknown location"),
          status: statusLabel,
          categoryCode: typeof feature.attributes.display_IncidentCat === "string" ? feature.attributes.display_IncidentCat : null,
          scope: typeof feature.attributes.display_Scope === "string" ? feature.attributes.display_Scope : null,
          approved: typeof feature.attributes.Approved === "string" ? feature.attributes.Approved : null,
          longitude: coords.longitude,
          latitude: coords.latitude,
          attributes: feature.attributes,
        } satisfies DobIncidentFeature;
      })
      .filter((feature): feature is DobIncidentFeature => Boolean(feature))
  );
};

export const formatWildfireDate = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const cleaned = value.trim();
  if (!/^\d{8}$/.test(cleaned)) {
    return cleaned || null;
  }
  const year = Number(cleaned.slice(0, 4));
  const month = Number(cleaned.slice(4, 6)) - 1;
  const day = Number(cleaned.slice(6, 8));
  const date = new Date(Date.UTC(year, month, day));
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export const formatWildfireArea = (value?: number | null, options?: { minimumFractionDigits?: number; maximumFractionDigits?: number }) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const formatter = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: options?.minimumFractionDigits ?? (value < 10 ? 1 : 0),
    maximumFractionDigits: options?.maximumFractionDigits ?? (value < 10 ? 1 : 0),
  });
  return formatter.format(value);
};

export const FIRE_DANGER_LEVEL_METADATA: Record<
  FireDangerLevel,
  { label: string; colorHex: string; hoverColorHex: string; description: string }
> = {
  low: {
    label: "Low",
    colorHex: "#3b82f6",
    hoverColorHex: "#2563eb",
    description: "Fires likely to be self-extinguishing and new ignitions unlikely. Any existing fires limited to smoldering in deep, drier layers.",
  },
  moderate: {
    label: "Moderate",
    colorHex: "#22c55e",
    hoverColorHex: "#16a34a",
    description: "Creeping or gentle surface fires. Fires easily contained by ground crews with pumps and hand tools.",
  },
  high: {
    label: "High",
    colorHex: "#eab308",
    hoverColorHex: "#ca8a04",
    description:
      "Moderate to vigorous surface fire with intermittent crown involvement. Challenging for ground crews; heavy equipment often required.",
  },
  "very-high": {
    label: "Very High",
    colorHex: "#f97316",
    hoverColorHex: "#ea580c",
    description:
      "High-intensity fire with partial to full crown involvement. Head fire conditions beyond ground crews; retardant drops required for the head.",
  },
  extreme: {
    label: "Extreme",
    colorHex: "#dc2626",
    hoverColorHex: "#b91c1c",
    description:
      "Fast-spreading, high-intensity crown fire. Very difficult to control. Suppression limited to flanks with indirect action on the head.",
  },
  nil: {
    label: "Nil",
    colorHex: "#94a3b8",
    hoverColorHex: "#64748b",
    description: "No calculations were performed for this region.",
  },
};

const PAGINATED_GEOJSON_BATCH_SIZE = 2000;

type PolygonalFeature = Feature<Polygon | MultiPolygon, Record<string, unknown>>;
type PolygonalFeatureCollection = FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>> & {
  properties?: { exceededTransferLimit?: boolean };
};

const fetchPaginatedArcGisGeoJson = async (baseUrl: string, signal: AbortSignal): Promise<PolygonalFeatureCollection> => {
  const features: PolygonalFeature[] = [];
  let resultOffset = 0;

  while (true) {
    const url = new URL(baseUrl);
    url.searchParams.set("resultOffset", String(resultOffset));
    url.searchParams.set("resultRecordCount", String(PAGINATED_GEOJSON_BATCH_SIZE));

    const response = await fetch(url.toString(), { signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load fire danger polygons (${response.status})`);
    }
    const json = (await response.json()) as PolygonalFeatureCollection;
    const batch = json?.features ?? [];
    features.push(...batch);
    const exceededLimit = json?.properties?.exceededTransferLimit;
    if (!exceededLimit || batch.length === 0) {
      break;
    }
    resultOffset += batch.length;
  }

  return {
    type: "FeatureCollection",
    features,
  };
};

const resolveFireDangerLevel = (properties: Record<string, unknown>): FireDangerLevel => {
  const stringKeys = ["danger_level", "dangerlevel", "fire_danger", "fireDanger", "danger", "dangerstatus", "danger_status"];
  for (const key of stringKeys) {
    const raw = properties[key];
    if (typeof raw === "string") {
      const normalized = raw.trim().toLowerCase();
      if (normalized.startsWith("low")) return "low";
      if (normalized.startsWith("moderate") || normalized.startsWith("mod")) return "moderate";
      if (normalized.startsWith("high") && !normalized.includes("very")) return "high";
      if (normalized.startsWith("very")) return "very-high";
      if (normalized.startsWith("extreme")) return "extreme";
      if (normalized.startsWith("nil")) return "nil";
    }
  }

  const numericKeys = ["danger_level", "dangerlevel", "dangeridx", "danger_index"];
  for (const key of numericKeys) {
    const raw = properties[key];
    const value = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : null;
    if (typeof value === "number" && Number.isFinite(value)) {
      if (value <= 0) return "nil";
      if (value <= 2) return "low";
      if (value <= 3) return "moderate";
      if (value <= 4) return "high";
      if (value <= 5) return "very-high";
      return "extreme";
    }
  }

  return "nil";
};

const formatArcGisTimestamp = (value?: string | null) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const isoCandidate = trimmed.includes("T") ? trimmed : `${trimmed.replace(" ", "T")}Z`;
  const date = new Date(isoCandidate);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }
  return date.toLocaleString();
};

const computeGeometryCentroid = (geometry?: Geometry): { longitude: number; latitude: number } | null => {
  if (!geometry) {
    return null;
  }
  const collectCoordinates = (coords: unknown): Array<[number, number]> => {
    if (!Array.isArray(coords)) {
      return [];
    }
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      return [[coords[0], coords[1]]];
    }
    return coords.flatMap((child) => collectCoordinates(child));
  };

  if (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon") {
    return null;
  }
  const points = collectCoordinates(geometry.coordinates);
  if (points.length === 0) {
    return null;
  }
  let minLng = Infinity;
  let maxLng = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  points.forEach(([lng, lat]) => {
    if (Number.isFinite(lng) && Number.isFinite(lat)) {
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  });
  if (!Number.isFinite(minLng) || !Number.isFinite(maxLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) {
    return null;
  }
  return {
    longitude: (minLng + maxLng) / 2,
    latitude: (minLat + maxLat) / 2,
  };
};

const parseNumericField = (value: unknown): number | null => {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeFireDangerFeatures = (collection: PolygonalFeatureCollection): FireDangerFeature[] => {
  return (
    collection?.features
      ?.map((feature, index) => {
        if (!feature?.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
          return null;
        }
        const properties = feature.properties ?? {};
        const id = String(
          properties.FID ?? properties.ObjectId ?? properties.OBJECTID ?? feature.id ?? `fire-danger-${index}`,
        );
        const centroid = computeGeometryCentroid(feature.geometry);
        return {
          id,
          uid: parseNumericField(properties.UID),
          hcount: parseNumericField(properties.HCOUNT),
          area: parseNumericField(properties.AREA),
          firstDate: formatArcGisTimestamp(typeof properties.FIRSTDATE === "string" ? properties.FIRSTDATE : null),
          lastDate: formatArcGisTimestamp(typeof properties.LASTDATE === "string" ? properties.LASTDATE : null),
          consisId: parseNumericField(properties.CONSIS_ID),
          dangerLevel: resolveFireDangerLevel(properties),
          centroid,
          geometry: feature.geometry,
          properties,
        } satisfies FireDangerFeature;
      })
      .filter((feature): feature is FireDangerFeature => Boolean(feature))
  );
};

const normalizeWildfires = (featureCollection: {
  features?: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: [number, number] } }>;
}) => {
  return (
    featureCollection?.features
      ?.map((feature, index) => {
        const coordinates = feature.geometry?.coordinates;
        const properties = feature.properties ?? {};
        const longitude = typeof coordinates?.[0] === "number" ? coordinates[0] : (properties.lon as number | undefined);
        const latitude = typeof coordinates?.[1] === "number" ? coordinates[1] : (properties.lat as number | undefined);
        if (typeof longitude !== "number" || typeof latitude !== "number") {
          return null;
        }
        const stageValue = typeof properties.stage_of_control === "string" ? properties.stage_of_control.trim() : "";
        const responseValue = typeof properties.response_type === "string" ? properties.response_type.trim() : "";
        return {
          id: String(properties.ObjectId ?? properties.OBJECTID ?? `wildfire-${index}`),
          agency: String(properties.agency ?? "Unknown jurisdiction"),
          name: String(properties.firename ?? "Unnamed Fire"),
          longitude,
          latitude,
          hectares: typeof properties.hectares === "number" ? properties.hectares : null,
          stageOfControl: WILDFIRE_STAGE_LABELS[stageValue] ?? (stageValue || "Unknown status"),
          responseType: responseValue.length > 0 ? responseValue : "Unknown response",
          startDate: formatWildfireDate(typeof properties.startdate === "string" ? properties.startdate : null),
          timezone: typeof properties.timezone === "string" ? properties.timezone : null,
        } satisfies WildfireFeature;
      })
      .filter((feature): feature is WildfireFeature => Boolean(feature))
  );
};

const fetchDobIncidents = async ({ signal }: { signal: AbortSignal }): Promise<DobIncidentFeature[]> => {
  const response = await fetch(DOB_INCIDENTS_URL, { signal });
  if (!response.ok) {
    throw new Error(`Failed to load DOB incidents (${response.status})`);
  }
  const json = await response.json();
  return normalizeDobIncidents(json?.features ?? []) ?? [];
};

const fetchActiveWildfires = async ({ signal }: { signal: AbortSignal }): Promise<WildfireFeature[]> => {
  const response = await fetch(ACTIVE_WILDFIRES_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load active wildfires (${response.status})`);
  }
  const json = await response.json();
  return normalizeWildfires(json) ?? [];
};

const fetchFireDangerAreas = async ({ signal }: { signal: AbortSignal }): Promise<FireDangerFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(FIRE_DANGER_URL, signal);
  return normalizeFireDangerFeatures(collection) ?? [];
};

const normalizeBorderEntries = (features: Array<{ attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } }>, entryType: BorderEntryType) => {
  return (
    features
      ?.map((feature, index) => {
        if (!feature?.attributes) {
          return null;
        }
        const coords = convertWebMercatorToLngLat(feature.geometry?.x, feature.geometry?.y);
        if (!coords) {
          return null;
        }
        const attributes = feature.attributes;
        const objectIdComponent = attributes.objectid ?? attributes.OBJECTID ?? index;
        return {
          id: `${entryType}-${objectIdComponent}`,
          name: String(attributes.office_name ?? attributes.office_name__short_ ?? attributes.Name ?? "Unnamed Port"),
          code: typeof attributes.office_code === "string" ? attributes.office_code : undefined,
          region: typeof attributes.region === "string" ? attributes.region : undefined,
          province: typeof attributes.province === "string" ? attributes.province : undefined,
          address: typeof attributes.address === "string" ? attributes.address : undefined,
          postalCode: typeof attributes.postal_code === "string" ? attributes.postal_code : undefined,
          place: typeof attributes.place === "string" ? attributes.place : undefined,
          longitude: coords.longitude,
          latitude: coords.latitude,
          entryType,
          url: typeof attributes.url === "string" ? attributes.url : undefined,
        } satisfies BorderEntryFeature;
      })
      .filter((feature): feature is BorderEntryFeature => Boolean(feature))
  );
};

const fetchBorderEntries = async ({ signal }: { signal: AbortSignal }): Promise<BorderEntryFeature[]> => {
  const layerRequests = POINT_OF_ENTRY_LAYERS.map(async ({ id, type }) => {
    const url = `${POINT_OF_ENTRY_BASE_URL}/${id}/query?where=1%3D1&outFields=*&returnGeometry=true&f=json`;
    const response = await fetch(url, { signal, cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Failed to load border entry layer ${id} (${response.status})`);
    }
    const json = await response.json();
    return normalizeBorderEntries(json?.features ?? [], type) ?? [];
  });

  const results = await Promise.all(layerRequests);
  return results.flat();
};

const createPlaceholderLayers = (): PlaceholderLayerConfig[] => {
  return VIEW_TYPE_OPTIONS.map((view) => ({
    id: `${view.id}-placeholder-2`,
    label: view.id === "wildfires" ? "WILDFIRE TOGGLE 2" : `${view.label.toUpperCase()} TOGGLE 2`,
    description: `Placeholder data feed for the ${view.label.toLowerCase()} view.`,
    colorHex: "#94a3b8",
    hoverColorHex: "#64748b",
    viewTypes: [view.id as ViewType],
    kind: "placeholder",
  }));
};

export const MAP_LAYER_CONFIGS: MapLayerConfig[] = [
  {
    id: "dob-incidents",
    label: "DOB Incidents",
    description: "Live Department Operations Branch incident feed.",
    colorHex: "#dc2626",
    hoverColorHex: "#b91c1c",
    viewTypes: ["general"],
    kind: "data",
    fetcher: fetchDobIncidents,
  },
  {
    id: "active-wildfires",
    label: "Active Wildfires",
    description: "Current wildfires sourced from the CWFIS national overview.",
    colorHex: "#f97316",
    hoverColorHex: "#ea580c",
    viewTypes: ["wildfires"],
    kind: "data",
    fetcher: fetchActiveWildfires,
  },
  {
    id: "fire-danger",
    label: "Fire Danger",
    description: "Polygons representing current wildland fire danger assessments.",
    colorHex: FIRE_DANGER_LEVEL_METADATA.extreme.colorHex,
    hoverColorHex: FIRE_DANGER_LEVEL_METADATA.extreme.hoverColorHex,
    viewTypes: ["wildfires"],
    kind: "data",
    fetcher: fetchFireDangerAreas,
  },
  {
    id: "border-entries",
    label: "Border Points of Entry",
    description: "Air, land, and crossing offices maintained by CBSA.",
    colorHex: "#0f172a",
    hoverColorHex: "#1e293b",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchBorderEntries,
  },
  {
    id: CAMERA_LAYER_ID,
    label: "Ottawa traffic cameras",
    description: "City of Ottawa & MTO roadside feeds with live stills.",
    colorHex: "#0ea5e9",
    hoverColorHex: "#0284c7",
    viewTypes: ["general", "infrastructure"],
    kind: "camera",
  },
  ...createPlaceholderLayers(),
];

export const DATA_LAYER_CONFIGS = MAP_LAYER_CONFIGS.filter((layer): layer is DataMapLayerConfig => layer.kind === "data");

export const MAP_LAYER_LOOKUP = MAP_LAYER_CONFIGS.reduce<Record<string, MapLayerConfig>>((acc, layer) => {
  acc[layer.id] = layer;
  return acc;
}, {});
