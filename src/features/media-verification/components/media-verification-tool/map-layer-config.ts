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
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/cwfis_active_fires_updated_view/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const FIRE_DANGER_URL =
  "https://cwfis.cfs.nrcan.gc.ca/geoserver/public/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=public:fdr_current_shp&outputFormat=json&srsName=EPSG:4326";
const PERIMETERS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/perimeters/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=&returnGeometry=true&returnCentroid=false&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const AERODROMES_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/Aerodromes/FeatureServer/6/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const RAILWAYS_URL =
  "https://services.arcgis.com/zmLUiqh7X11gGV2d/ArcGIS/rest/services/Canada_National_Railway_System_FEB2020/FeatureServer/6/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
const HIGHWAYS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/ArcGIS/rest/services/highways_merged/FeatureServer/0/query?where=1%3D1&objectIds=&geometry=&geometryType=esriGeometryEnvelope&inSR=&spatialRel=esriSpatialRelIntersects&resultType=none&distance=0.0&units=esriSRUnit_Meter&outDistance=&relationParam=&returnGeodetic=false&outFields=*&returnGeometry=true&returnEnvelope=false&featureEncoding=esriDefault&multipatchOption=xyFootprint&maxAllowableOffset=&geometryPrecision=&outSR=&defaultSR=&datumTransformation=&applyVCSProjection=false&returnIdsOnly=false&returnUniqueIdsOnly=false&returnCountOnly=false&returnExtentOnly=false&returnQueryGeometry=false&returnDistinctValues=false&cacheHint=false&collation=&orderByFields=&groupByFieldsForStatistics=&returnAggIds=false&outStatistics=&having=&resultOffset=&resultRecordCount=&returnZ=false&returnM=false&returnTrueCurves=false&returnExceededLimitFeatures=true&quantizationParameters=&sqlFormat=none&f=pgeojson&token=";
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
  dangerLevel: FireDangerLevel | null;
  dangerLabel: string | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface PerimeterFeature {
  id: string;
  fid: number | null;
  uid: number | null;
  hcount: number | null;
  area: number | null;
  firstDate: string | null;
  lastDate: string | null;
  consisId: number | null;
  shapeArea: number | null;
  shapeLength: number | null;
  centroid: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface AerodromeFeature {
  id: string;
  icao: string | null;
  name: string | null;
  elevation: number | null;
  elevationUnit: string | null;
  organisation: string | null;
  latitude: number;
  longitude: number;
  province: string | null;
  runwayNumbers: string | null;
  facilityType: string | null;
  surfaceType: string | null;
  lightingType: string | null;
  lightingIntensity: string | null;
  properties: Record<string, unknown>;
}

export interface RailwayFeature {
  id: string;
  name: string | null;
  classLabel: string | null;
  regulator: string | null;
  status: string | null;
  useType: string | null;
  gauge: string | null;
  numTracks: number | null;
  speedFreight: number | null;
  speedPassenger: number | null;
  length: number | null;
  center: { longitude: number; latitude: number } | null;
  geometry: Geometry;
  properties: Record<string, unknown>;
}

export interface HighwayFeature {
  id: string;
  name: string | null;
  province: string | null;
  length: number | null;
  center: { longitude: number; latitude: number } | null;
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

const DEFAULT_FIRE_DANGER_PALETTE = {
  colorHex: "#94a3b8",
  hoverColorHex: "#64748b",
};

export const FIRE_DANGER_LEVEL_METADATA: Record<
  FireDangerLevel | "unknown",
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
  unknown: {
    label: "Fire Danger",
    colorHex: DEFAULT_FIRE_DANGER_PALETTE.colorHex,
    hoverColorHex: DEFAULT_FIRE_DANGER_PALETTE.hoverColorHex,
    description: "No fire danger metadata is available for this polygon.",
  },
};

const PAGINATED_GEOJSON_BATCH_SIZE = 2000;

type PolygonalFeature = Feature<Polygon | MultiPolygon, Record<string, unknown>>;
type PolygonalFeatureCollection = FeatureCollection<Polygon | MultiPolygon, Record<string, unknown>> & {
  properties?: { exceededTransferLimit?: boolean };
};
const DANGER_PROPERTY_KEYS = [
  "danger_level",
  "DANGER_LEVEL",
  "Danger_Level",
  "dangerlevel",
  "DangerLevel",
  "DANGERLEVEL",
  "danger",
  "fire_danger",
  "Fire_Danger",
  "FIREDANGER",
  "GRIDCODE",
];

const normalizeDangerString = (value?: string | null) => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseDangerLevelFromCode = (code?: number | string | null): FireDangerLevel | null => {
  if (code === null || code === undefined) {
    return null;
  }
  const numericCode = typeof code === "string" ? Number(code) : code;
  if (!Number.isFinite(numericCode)) {
    return null;
  }
  // GRIDCODE mapping: 0=Low, 1=Moderate, 2=High, 3=Very High, 4=Extreme
  switch (numericCode) {
    case 0:
      return "low";
    case 1:
      return "moderate";
    case 2:
      return "high";
    case 3:
      return "very-high";
    case 4:
      return "extreme";
    default:
      return "nil";
  }
};

const parseDangerLevelFromString = (value?: string | null): FireDangerLevel | null => {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith("low")) return "low";
  if (normalized.startsWith("moderate") || normalized.startsWith("mod")) return "moderate";
  if (normalized.startsWith("high") && !normalized.includes("very")) return "high";
  if (normalized.startsWith("very")) return "very-high";
  if (normalized.startsWith("extreme")) return "extreme";
  if (normalized.startsWith("nil")) return "nil";
  return null;
};

const extractDangerLevelMetadata = (properties: Record<string, unknown>): { level: FireDangerLevel | null; label: string | null } => {
  // First check for GRIDCODE (numeric code from WFS)
  if (Object.prototype.hasOwnProperty.call(properties, "GRIDCODE")) {
    const gridCode = properties.GRIDCODE;
    if (typeof gridCode === "number" || typeof gridCode === "string" || gridCode === null || gridCode === undefined) {
      const level = parseDangerLevelFromCode(gridCode as number | string | null | undefined);
      if (level) {
        const label = FIRE_DANGER_LEVEL_METADATA[level].label;
        return { level, label };
      }
    }
  }
  // Fallback to text-based danger level parsing
  for (const key of DANGER_PROPERTY_KEYS) {
    if (Object.prototype.hasOwnProperty.call(properties, key)) {
      const raw = properties[key];
      if (typeof raw === "string") {
        const label = normalizeDangerString(raw);
        const level = parseDangerLevelFromString(label);
        return { level, label };
      }
    }
  }
  return { level: null, label: null };
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

const parseArcGisTimestampToDate = (value?: string | number | null): Date | null => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "number") {
    const maybeMillis = value > 10_000_000_000 ? value : value * 1000;
    const date = new Date(maybeMillis);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const isoCandidate = trimmed.includes("T") ? trimmed : `${trimmed.replace(" ", "T")}Z`;
  const date = new Date(isoCandidate);
  return Number.isNaN(date.getTime()) ? null : date;
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

  const points =
    geometry.type === "GeometryCollection"
      ? geometry.geometries.flatMap((geom) => collectCoordinates((geom as Geometry & { coordinates?: unknown }).coordinates))
      : collectCoordinates((geometry as Geometry & { coordinates?: unknown }).coordinates);
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

const parseStringField = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeFireDangerFeatures = (collection: PolygonalFeatureCollection): FireDangerFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: FireDangerFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
      return;
    }
    const properties = feature.properties ?? {};
    const { level, label } = extractDangerLevelMetadata(properties);
    const id = String(properties.FID ?? properties.ObjectId ?? properties.OBJECTID ?? feature.id ?? `fire-danger-${index}`);
    const centroid = computeGeometryCentroid(feature.geometry);
    const normalizedFeature: FireDangerFeature = {
      id,
      uid: parseNumericField(properties.UID),
      hcount: parseNumericField(properties.HCOUNT),
      area: parseNumericField(properties.AREA),
      firstDate: formatArcGisTimestamp(typeof properties.FIRSTDATE === "string" ? properties.FIRSTDATE : null),
      lastDate: formatArcGisTimestamp(typeof properties.LASTDATE === "string" ? properties.LASTDATE : null),
      consisId: parseNumericField(properties.CONSIS_ID),
      dangerLevel: level,
      dangerLabel: label,
      centroid,
      geometry: feature.geometry,
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizePerimeterFeatures = (collection: PolygonalFeatureCollection): PerimeterFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: PerimeterFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry || (feature.geometry.type !== "Polygon" && feature.geometry.type !== "MultiPolygon")) {
      return;
    }
    const properties = feature.properties ?? {};
    const id = String(properties.FID ?? properties.ObjectId ?? properties.OBJECTID ?? feature.id ?? `perimeter-${index}`);
    const centroid = computeGeometryCentroid(feature.geometry);
    const normalizedFeature: PerimeterFeature = {
      id,
      fid: parseNumericField(properties.FID),
      uid: parseNumericField(properties.UID),
      hcount: parseNumericField(properties.HCOUNT),
      area: parseNumericField(properties.AREA),
      firstDate: formatArcGisTimestamp(typeof properties.FIRSTDATE === "string" ? properties.FIRSTDATE : null),
      lastDate: formatArcGisTimestamp(typeof properties.LASTDATE === "string" ? properties.LASTDATE : null),
      consisId: parseNumericField(properties.CONSIS_ID),
      shapeArea: parseNumericField(properties.Shape__Area),
      shapeLength: parseNumericField(properties.Shape__Length),
      centroid,
      geometry: feature.geometry,
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizeAerodromeFeatures = (collection: FeatureCollection): AerodromeFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: AerodromeFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    const properties = feature.properties ?? {};
    const coords = feature.geometry.type === "Point" ? feature.geometry.coordinates : null;
    const longitude = parseNumericField((coords as [number, number] | null)?.[0]) ?? parseNumericField(properties.DD_Lon);
    const latitude = parseNumericField((coords as [number, number] | null)?.[1]) ?? parseNumericField(properties.DD_Lat);
    if (longitude === null || latitude === null) {
      return;
    }
    const normalizedFeature: AerodromeFeature = {
      id: String(properties.GlobalID ?? properties.OBJECTID ?? feature.id ?? `aerodrome-${index}`),
      icao: parseStringField(properties.Identifica),
      name: parseStringField(properties.Name),
      elevation: parseNumericField(properties.Elevation),
      elevationUnit: parseStringField(properties.Unit_of_me),
      organisation: parseStringField(properties.Organisati),
      longitude,
      latitude,
      province: parseStringField(properties.Prov),
      runwayNumbers: parseStringField(properties.allRWY),
      facilityType: parseStringField(properties.Facility),
      surfaceType: parseStringField(properties.Surface_Type),
      lightingType: parseStringField(properties.Lighting_Type),
      lightingIntensity: parseStringField(properties.Lighting_Intensity),
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizeRailwayFeatures = (collection: FeatureCollection): RailwayFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: RailwayFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    if (feature.geometry.type !== "LineString" && feature.geometry.type !== "MultiLineString") {
      return;
    }
    const properties = feature.properties ?? {};
    const normalizedFeature: RailwayFeature = {
      id: String(properties.OBJECTID ?? properties.ObjectId ?? feature.id ?? `railway-${index}`),
      name: parseStringField(properties.TRACKNAME),
      classLabel: parseStringField(properties.TRACKCLASS),
      regulator: parseStringField(properties.REGULATOR),
      status: parseStringField(properties.STATUS),
      useType: parseStringField(properties.USETYPE),
      gauge: parseStringField(properties.GAUGE),
      numTracks: parseNumericField(properties.NUMTRACKS),
      speedFreight: parseNumericField(properties.SPEEDFREIT),
      speedPassenger: parseNumericField(properties.SPEEDPASSE),
      length: parseNumericField(properties.Shape__Length),
      center: computeGeometryCentroid(feature.geometry),
      geometry: feature.geometry,
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
};

const normalizeHighwayFeatures = (collection: FeatureCollection): HighwayFeature[] => {
  if (!collection?.features) {
    return [];
  }
  const normalized: HighwayFeature[] = [];
  collection.features.forEach((feature, index) => {
    if (!feature?.geometry) {
      return;
    }
    if (feature.geometry.type !== "LineString" && feature.geometry.type !== "MultiLineString") {
      return;
    }
    const properties = feature.properties ?? {};
    const normalizedFeature: HighwayFeature = {
      id: String(properties.OBJECTID ?? properties.ObjectId ?? feature.id ?? `highway-${index}`),
      name: parseStringField(properties.NAME),
      province: parseStringField(properties.PRNAME_R),
      length: parseNumericField(properties.Shape__Length),
      center: computeGeometryCentroid(feature.geometry),
      geometry: feature.geometry,
      properties,
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
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
  // WFS endpoint returns GeoJSON directly (not paginated ArcGIS format)
  const response = await fetch(FIRE_DANGER_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load fire danger polygons (${response.status})`);
  }
  const collection = (await response.json()) as PolygonalFeatureCollection;
  return normalizeFireDangerFeatures(collection) ?? [];
};

const fetchPerimeters = async ({ signal }: { signal: AbortSignal }): Promise<PerimeterFeature[]> => {
  const collection = await fetchPaginatedArcGisGeoJson(PERIMETERS_URL, signal);
  return normalizePerimeterFeatures(collection) ?? [];
};

const fetchAerodromes = async ({ signal }: { signal: AbortSignal }): Promise<AerodromeFeature[]> => {
  const response = await fetch(AERODROMES_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load aerodromes (${response.status})`);
  }
  const collection = (await response.json()) as FeatureCollection;
  return normalizeAerodromeFeatures(collection) ?? [];
};

const fetchRailways = async ({ signal }: { signal: AbortSignal }): Promise<RailwayFeature[]> => {
  const response = await fetch(RAILWAYS_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load railways (${response.status})`);
  }
  const collection = (await response.json()) as FeatureCollection;
  return normalizeRailwayFeatures(collection) ?? [];
};

const fetchHighways = async ({ signal }: { signal: AbortSignal }): Promise<HighwayFeature[]> => {
  const response = await fetch(HIGHWAYS_URL, { signal, cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Failed to load highways (${response.status})`);
  }
  const collection = (await response.json()) as FeatureCollection;
  return normalizeHighwayFeatures(collection) ?? [];
};

const normalizeBorderEntries = (
  features: Array<{ attributes?: Record<string, unknown>; geometry?: { x?: number; y?: number } }>,
  entryType: BorderEntryType,
): BorderEntryFeature[] => {
  if (!features) {
    return [];
  }
  const normalized: BorderEntryFeature[] = [];
  features.forEach((feature, index) => {
    if (!feature?.attributes) {
      return;
    }
    const coords = convertWebMercatorToLngLat(feature.geometry?.x, feature.geometry?.y);
    if (!coords) {
      return;
    }
    const attributes = feature.attributes;
    const objectIdComponent = attributes.objectid ?? attributes.OBJECTID ?? index;
    const normalizedFeature: BorderEntryFeature = {
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
    };
    normalized.push(normalizedFeature);
  });
  return normalized;
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
  return VIEW_TYPE_OPTIONS.map((view) => {
    const viewId = (view.id as ViewType) ?? "general";
    const viewLabel = typeof view.label === "string" && view.label.length > 0 ? view.label : viewId;
    return {
      id: `${viewId}-placeholder-2`,
      label: viewId === "wildfires" ? "WILDFIRE TOGGLE 2" : `${viewLabel.toUpperCase()} TOGGLE 2`,
      description: `Placeholder data feed for the ${viewLabel.toLowerCase()} view.`,
      colorHex: "#94a3b8",
      hoverColorHex: "#64748b",
      viewTypes: [viewId],
      kind: "placeholder",
    };
  });
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
    id: "perimeters",
    label: "Perimeters",
    description: "Fire perimeter polygons from the National Wildland Fire database.",
    colorHex: "#dc2626",
    hoverColorHex: "#b91c1c",
    viewTypes: ["wildfires"],
    kind: "data",
    fetcher: fetchPerimeters,
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
    id: "aerodromes",
    label: "Aerodromes",
    description: "Canadian aerodromes with ICAO codes, elevation, and runway info.",
    colorHex: "#7c3aed",
    hoverColorHex: "#6d28d9",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchAerodromes,
  },
  {
    id: "railways",
    label: "National Railway Network",
    description: "National railway track segments and operational attributes.",
    colorHex: "#f59e0b",
    hoverColorHex: "#d97706",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchRailways,
  },
  {
    id: "highways",
    label: "National Highway System",
    description: "National highway corridors and provincial ownership details.",
    colorHex: "#059669",
    hoverColorHex: "#047857",
    viewTypes: ["infrastructure"],
    kind: "data",
    fetcher: fetchHighways,
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
