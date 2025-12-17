import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, Popup, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, FeatureCollection, Geometry } from "geojson";

import { useTheme } from "@/app/providers/theme-context";
import { AnalysisCardFrame } from "@/components/analysis";
import { Button } from "@/components/ui/buttons/button";
import { Dialog, Modal, ModalOverlay } from "@/components/ui/modals/modal";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion/accordion";
import { Select } from "@/components/ui/select/select";
import { Toggle } from "@/components/ui/toggle/toggle";
import { Car, Maximize2, Plane, RefreshCw, TowerControl, X } from "lucide-react";
import type { GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import type {
  GeolocationAnalysis,
  LocationLayerRecommendation,
} from "@/features/media-verification/api/geolocation";
import type { GeocodedLocation } from "@/features/media-verification/api/geocoding";
import { GeolocationCard } from "./GeolocationCard";
import { MapSearchControl } from "./MapSearchControl";
import { CORS_PROXY_ORIGIN } from "@/shared/constants/network";
import ottawaCameraList from "../../../../../docs/cameralist.json";
import {
  CAMERA_LAYER_ID,
  DATA_LAYER_CONFIGS,
  MAP_LAYER_CONFIGS,
  MAP_LAYER_LOOKUP,
  VIEW_TYPE_OPTIONS,
  type ViewType,
  type MapBounds,
  type DobIncidentFeature,
  type WildfireFeature,
  type BorderEntryFeature,
  type BorderEntryType,
  type FireDangerFeature,
  type PerimeterFeature,
  type AerodromeFeature,
  type RailwayFeature,
  type HighwayFeature,
  type HurricaneFeature,
  type HurricaneCenterFeature,
  type HurricaneTrackFeature,
  type HurricaneErrorFeature,
  type HurricaneWindRadiusFeature,
  type RecentHurricaneFeature,
  type HydrometricStationFeature,
  type BuildingFootprintFeature,
  type PropertyBoundaryFeature,
  type IndigenousLandBoundaryFeature,
  type SourceLayerFeature,
  type CHCResponseZoneFeature,
  type EnvironmentCanadaWeatherAlertFeature,
  type InuitCommunityFeature,
  type Census2021DisseminationAreaFeature,
  FIRE_DANGER_LEVEL_METADATA,
  formatWildfireArea as formatWildfireAreaValue,
} from "./map-layer-config";

interface ContextTabProps {
  visionResult?: GoogleVisionWebDetectionResult;
  isVisionLoading: boolean;
  geolocationAnalysis?: GeolocationAnalysis;
  geolocationLoading?: boolean;
  geolocationError?: string;
  geolocationRequested?: boolean;
  geolocationEnabled?: boolean;
  geolocationAvailable?: boolean;
  geolocationCoordinates?: GeocodedLocation | null;
  geolocationCoordinatesLoading?: boolean;
  geolocationCoordinatesError?: string;
  locationLayerRecommendation?: LocationLayerRecommendation;
  locationLayerRecommendationLoading?: boolean;
  locationLayerRecommendationError?: string;
  geolocationConfidence?: number | null;
  resizeTrigger?: string;
}

type TrafficCameraType = "CITY" | "MTO";

interface OttawaCameraRecord {
  number?: number;
  latitude?: number;
  longitude?: number;
  description?: string;
  descriptionFr?: string;
  type?: string;
  id?: number;
}

interface OttawaCameraFeature {
  id: string;
  stateKey: string;
  number: number;
  latitude: number;
  longitude: number;
  description: string;
  descriptionFr?: string;
  type: TrafficCameraType;
}

interface CameraPreviewState {
  objectUrl: string | null;
  fetchedAt: number | null;
  isLoading: boolean;
  error: string | null;
}

const createCameraPreviewState = (): CameraPreviewState => ({
  objectUrl: null,
  fetchedAt: null,
  isLoading: false,
  error: null,
});

const computeGeoCentroid = (geometry?: Geometry): { longitude: number; latitude: number } | null => {
  if (!geometry) {
    return null;
  }
  const collect = (coords: unknown): Array<[number, number]> => {
    if (!Array.isArray(coords)) {
      return [];
    }
    if (typeof coords[0] === "number" && typeof coords[1] === "number") {
      return [[coords[0], coords[1]]];
    }
    return coords.flatMap((child) => collect(child));
  };
  const points =
    geometry.type === "GeometryCollection"
      ? geometry.geometries.flatMap((geom) => collect((geom as Geometry & { coordinates?: unknown }).coordinates))
      : collect((geometry as Geometry & { coordinates?: unknown }).coordinates);
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

type SurroundingContextHit = {
  layerId: string;
  layerLabel: string;
  featureId: string;
  distanceKm: number;
  coordinates: { longitude: number; latitude: number };
  summary: string;
  feature: unknown;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const getFeatureCoordinates = (layerId: string, feature: unknown): { longitude: number; latitude: number } | null => {
  switch (layerId) {
    case "dob-incidents": {
      const cast = feature as DobIncidentFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "active-wildfires": {
      const cast = feature as WildfireFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "fire-danger": {
      const cast = feature as FireDangerFeature;
      if (cast.centroid && isFiniteNumber(cast.centroid.longitude) && isFiniteNumber(cast.centroid.latitude)) {
        return { longitude: cast.centroid.longitude, latitude: cast.centroid.latitude };
      }
      return null;
    }
    case "perimeters": {
      const cast = feature as PerimeterFeature;
      if (cast.centroid && isFiniteNumber(cast.centroid.longitude) && isFiniteNumber(cast.centroid.latitude)) {
        return { longitude: cast.centroid.longitude, latitude: cast.centroid.latitude };
      }
      return null;
    }
    case "border-entries": {
      const cast = feature as BorderEntryFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "aerodromes": {
      const cast = feature as AerodromeFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "railways": {
      const cast = feature as RailwayFeature;
      if (cast.center && isFiniteNumber(cast.center.longitude) && isFiniteNumber(cast.center.latitude)) {
        return { longitude: cast.center.longitude, latitude: cast.center.latitude };
      }
      return null;
    }
    case "highways": {
      const cast = feature as HighwayFeature;
      if (cast.center && isFiniteNumber(cast.center.longitude) && isFiniteNumber(cast.center.latitude)) {
        return { longitude: cast.center.longitude, latitude: cast.center.latitude };
      }
      return null;
    }
    case "active-hurricanes": {
      const cast = feature as HurricaneFeature;
      if (cast.geometry?.type === "Point") {
        const [longitude, latitude] = cast.geometry.coordinates as [number, number];
        if (isFiniteNumber(longitude) && isFiniteNumber(latitude)) {
          return { longitude, latitude };
        }
      }
      return computeGeoCentroid(cast.geometry);
    }
    case "recent-hurricanes": {
      const cast = feature as RecentHurricaneFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "hydrometric-stations": {
      const cast = feature as HydrometricStationFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "building-footprints": {
      const cast = feature as BuildingFootprintFeature;
      if (cast.centroid) {
        return cast.centroid;
      }
      return computeGeoCentroid(cast.geometry);
    }
    case "property-boundaries": {
      const cast = feature as PropertyBoundaryFeature;
      if (cast.centroid) {
        return cast.centroid;
      }
      return computeGeoCentroid(cast.geometry);
    }
    case "indigenous-land-boundaries": {
      const cast = feature as IndigenousLandBoundaryFeature;
      if (cast.centroid) {
        return cast.centroid;
      }
      return computeGeoCentroid(cast.geometry);
    }
    case "environment-canada-weather-alerts": {
      const cast = feature as EnvironmentCanadaWeatherAlertFeature;
      if (cast.centroid) {
        return cast.centroid;
      }
      return computeGeoCentroid(cast.geometry);
    }
    case "chc-response-zone": {
      const cast = feature as CHCResponseZoneFeature;
      if (cast.centroid) {
        return cast.centroid;
      }
      return computeGeoCentroid(cast.geometry);
    }
    case "sources": {
      const cast = feature as SourceLayerFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "inuit-communities": {
      const cast = feature as InuitCommunityFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      if (cast.centroid) {
        return cast.centroid;
      }
      return null;
    }
    case "indigenous-land-boundaries": {
      const cast = feature as IndigenousLandBoundaryFeature;
      if (cast.centroid) {
        return cast.centroid;
      }
      return computeGeoCentroid(cast.geometry);
    }
    default:
      return null;
  }
};

const haversineDistanceKm = (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371; // km
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const c = 2 * Math.atan2(
    Math.sqrt(sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon),
    Math.sqrt(1 - (sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon)),
  );

  return R * c;
};

const buildSourceTitle = (source: SourceLayerFeature) => source.sourceName ?? source.globalId ?? "Source";

const buildSourceSubtitle = (source: SourceLayerFeature): string | null => {
  const parts = [source.region, source.sourceType, source.scope].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : null;
};

const buildListPreview = (items: string[], limit: number) => {
  if (items.length === 0) {
    return null;
  }
  const excerpt = items.slice(0, limit);
  const suffix = items.length > limit ? "…" : "";
  return `${excerpt.join(", ")}${suffix}`;
};

const buildFeatureSummary = (layerId: string, feature: unknown): string => {
  switch (layerId) {
    case "dob-incidents": {
      const cast = feature as DobIncidentFeature;
      const status = cast.status ? ` • ${cast.status}` : "";
      return `${cast.title ?? cast.id ?? "Incident"}${status}`;
    }
    case "active-wildfires": {
      const cast = feature as WildfireFeature;
      const label = cast.name || cast.id || "Wildfire";
      const stage = cast.stageOfControl ? ` • ${cast.stageOfControl}` : "";
      return `${label}${stage}`;
    }
    case "fire-danger": {
      const cast = feature as FireDangerFeature;
      const label = cast.dangerLabel || cast.dangerLevel || "Fire danger area";
      return `Fire danger: ${label}`;
    }
    case "perimeters": {
      const cast = feature as PerimeterFeature;
      return `Perimeter ${cast.id ?? ""}`.trim();
    }
    case "border-entries": {
      const cast = feature as BorderEntryFeature;
      const type = cast.entryType ? ` • ${cast.entryType}` : "";
      return `${cast.name ?? cast.id ?? "Border entry"}${type}`;
    }
    case "aerodromes": {
      const cast = feature as AerodromeFeature;
      const label = cast.name || cast.icao || cast.id || "Aerodrome";
      return label;
    }
    case "railways": {
      const cast = feature as RailwayFeature;
      const label = cast.name || "Railway segment";
      const classLabel = cast.classLabel ? ` • ${cast.classLabel}` : "";
      return `${label}${classLabel}`;
    }
    case "highways": {
      const cast = feature as HighwayFeature;
      return cast.name || cast.id || "Highway corridor";
    }
    case "active-hurricanes": {
      const cast = feature as HurricaneFeature;
      if (cast.featureType === "center") {
        const center = cast as HurricaneCenterFeature;
        const intensity = center.stormForce ? ` • ${center.stormForce}` : "";
        return `${center.stormName ?? "Storm"}${intensity}`;
      }
      return cast.stormName ?? "Hurricane overlay";
    }
    case "recent-hurricanes": {
      const cast = feature as RecentHurricaneFeature;
      const typeLabel = cast.stormType ? ` • ${cast.stormType}` : "";
      return `${cast.stormName ?? "Storm"}${typeLabel}`;
    }
    case "hydrometric-stations": {
      const cast = feature as HydrometricStationFeature;
      const region = cast.region ? ` • ${cast.region}` : "";
      return `${cast.stationName ?? cast.stationNumber ?? "Hydrometric Station"}${region}`;
    }
    case "building-footprints": {
      const cast = feature as BuildingFootprintFeature;
      const location = cast.municipalityEn ?? cast.municipalityFr ?? cast.provinceEn ?? "";
      const locationSuffix = location ? ` • ${location}` : "";
      const name = cast.nameEn ?? cast.nameFr ?? cast.structureNumber ?? "Building";
      return `${name}${locationSuffix}`;
    }
    case "property-boundaries": {
      const cast = feature as PropertyBoundaryFeature;
      const location = cast.municipalityEn ?? cast.municipalityFr ?? cast.provinceEn ?? "";
      const locationSuffix = location ? ` • ${location}` : "";
      const name = cast.nameEn ?? cast.nameFr ?? cast.propertyNumber ?? "Property";
      return `${name}${locationSuffix}`;
    }
    case "indigenous-land-boundaries": {
      return buildIndigenousBoundarySummary(feature as IndigenousLandBoundaryFeature);
    }
    case "environment-canada-weather-alerts": {
      const cast = feature as EnvironmentCanadaWeatherAlertFeature;
      return buildWeatherAlertSummary(cast);
    }
    case "chc-response-zone": {
      const cast = feature as CHCResponseZoneFeature;
      return buildChcResponseZoneSummary(cast);
    }
    case "sources": {
      const cast = feature as SourceLayerFeature;
      return buildSourceTitle(cast);
    }
    case "inuit-communities": {
      return buildInuitCommunitySummary(feature as InuitCommunityFeature);
    }
    case "indigenous-land-boundaries": {
      return buildIndigenousBoundarySummary(feature as IndigenousLandBoundaryFeature);
    }
    default:
      return "Feature";
  }
};

const getFeatureId = (feature: unknown): string => {
  if (feature && typeof feature === "object" && "id" in feature && typeof (feature as { id?: unknown }).id === "string") {
    return (feature as { id: string }).id;
  }
  return Math.random().toString(36).slice(2);
};

const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1Ijoic3RhbmRhbG9uZXF1aW5uIiwiYSI6ImNtaW5odWs1czFtbnkzZ3EzMWozanN2cmsifQ.P8ZoDe9WKINxE4qGnx3sHg";
const MAPBOX_STYLE_LIGHT_URL = "mapbox://styles/mapbox/light-v11";
const MAPBOX_STYLE_DARK_URL = "mapbox://styles/mapbox/dark-v11";
const MAP_INITIAL_VIEW_STATE = {
  longitude: -92.67,
  latitude: 59.12,
  zoom: 2.69,
};
const CAMERA_MARKER_MIN_ZOOM = 10;
const CAMERA_IMAGE_URL = "https://traffic.ottawa.ca/opendata/camera";
const OTTAWA_CAMERA_CERTIFICATE = "757642026101eunava160awatt";
const OTTAWA_CAMERA_CLIENT_ID = "OpenSrcSearch";
const CAMERA_REFRESH_DEBOUNCE_MS = 5_000;
const buildCameraImageUrl = (cameraNumber: number, nonce: number) => {
  const params = new URLSearchParams({
    c: String(cameraNumber),
    certificate: OTTAWA_CAMERA_CERTIFICATE,
    id: OTTAWA_CAMERA_CLIENT_ID,
    ts: String(nonce),
  });
  return `${CAMERA_IMAGE_URL}?${params.toString()}`;
};

const CAMERA_USE_CORS_PROXY_ENV = import.meta.env?.VITE_CAMERA_USE_CORS_PROXY as string | undefined;
const SHOULD_USE_CAMERA_CORS_PROXY =
  CAMERA_USE_CORS_PROXY_ENV !== undefined ? CAMERA_USE_CORS_PROXY_ENV === "true" : !import.meta.env.PROD;

const buildCameraRequestUrl = (cameraNumber: number) => {
  const targetUrl = buildCameraImageUrl(cameraNumber, Date.now());
  return SHOULD_USE_CAMERA_CORS_PROXY ? `${CORS_PROXY_ORIGIN}${targetUrl}` : targetUrl;
};

const CAMERA_MARKER_BUTTON_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-sky-600/90 p-0.5 shadow-md shadow-sky-600/30 transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70";
const CAMERA_MARKER_DOT_CLASS = "block h-1.5 w-1.5 rounded-full bg-white transition group-hover:scale-110";
const LAYERS_PER_PAGE = 4;
const AUTO_ENABLED_LAYER_EXCLUSIONS = new Set(["sources"]);
const BORDER_ENTRY_MARKER_BASE_CLASS =
  "group -translate-y-1 rounded-full border p-1 shadow-md transition focus-visible:outline-none focus-visible:ring-2";
const BORDER_ENTRY_ICON_CLASSES: Record<BorderEntryType, string> = {
  air: "text-sky-300",
  land: "text-emerald-300",
  crossing: "text-amber-300",
};
const BORDER_ENTRY_ICON_COMPONENTS: Record<BorderEntryType, typeof Plane> = {
  air: Plane,
  land: Car,
  crossing: TowerControl,
};
const AERODROME_MARKER_BASE_CLASS =
  "group -translate-y-1 rounded-full border p-1 shadow-md transition focus-visible:outline-none focus-visible:ring-2";
const AERODROME_ICON_CLASS = "h-3 w-3";
const HURRICANE_CENTER_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-sky-500/90 p-1 shadow-md shadow-sky-500/40 transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const RECENT_HURRICANE_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-pink-500/90 p-1 shadow-md shadow-pink-500/40 transition hover:bg-pink-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const HYDROMETRIC_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-emerald-500/90 p-1 shadow-md shadow-emerald-500/30 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const SOURCES_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-purple-500/90 p-1 shadow-md shadow-purple-500/30 transition hover:bg-purple-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const FIRE_DANGER_SOURCE_ID = "fire-danger-source";
const FIRE_DANGER_FILL_LAYER_ID = "fire-danger-fill";
const FIRE_DANGER_OUTLINE_LAYER_ID = "fire-danger-outline";
const PERIMETERS_SOURCE_ID = "perimeters-source";
const PERIMETERS_FILL_LAYER_ID = "perimeters-fill";
const PERIMETERS_OUTLINE_LAYER_ID = "perimeters-outline";
const HURRICANE_TRACK_SOURCE_ID = "active-hurricanes-track-source";
const HURRICANE_TRACK_LAYER_ID = "active-hurricanes-track";
const HURRICANE_ERROR_SOURCE_ID = "active-hurricanes-error-source";
const HURRICANE_ERROR_LAYER_ID = "active-hurricanes-error";
const HURRICANE_WIND_SOURCE_ID = "active-hurricanes-wind-source";
const HURRICANE_WIND_LAYER_ID = "active-hurricanes-wind";
const RAILWAYS_SOURCE_ID = "railways-source";
const RAILWAYS_LINE_LAYER_ID = "railways-line";
const HIGHWAYS_SOURCE_ID = "highways-source";
const HIGHWAYS_LINE_LAYER_ID = "highways-line";
const BUILDING_FOOTPRINT_SOURCE_ID = "building-footprints-source";
const BUILDING_FOOTPRINT_FILL_LAYER_ID = "building-footprints-fill";
const BUILDING_FOOTPRINT_OUTLINE_LAYER_ID = "building-footprints-outline";
const PROPERTY_BOUNDARIES_SOURCE_ID = "property-boundaries-source";
const PROPERTY_BOUNDARIES_FILL_LAYER_ID = "property-boundaries-fill";
const PROPERTY_BOUNDARIES_OUTLINE_LAYER_ID = "property-boundaries-outline";
const INDIGENOUS_BOUNDARIES_SOURCE_ID = "indigenous-land-boundaries-source";
const INDIGENOUS_BOUNDARIES_FILL_LAYER_ID = "indigenous-land-boundaries-fill";
const INDIGENOUS_BOUNDARIES_OUTLINE_LAYER_ID = "indigenous-land-boundaries-outline";
const WEATHER_ALERTS_SOURCE_ID = "weather-alerts-source";
const WEATHER_ALERTS_FILL_LAYER_ID = "weather-alerts-fill";
const WEATHER_ALERTS_OUTLINE_LAYER_ID = "weather-alerts-outline";
const buildingFootprintPaint = {
  fillColor: "#c084fc",
  fillOpacity: 0.25,
  outlineColor: "#9333ea",
  outlineWidth: 1.3,
  fillEmissive: 0.6,
  outlineEmissive: 0.9,
};
const propertyBoundaryPaint = {
  fillColor: "#7dd3fc",
  fillOpacity: 0.25,
  outlineColor: "#0ea5e9",
  outlineWidth: 1.5,
  fillEmissive: 0.5,
  outlineEmissive: 0.85,
};
const indigenousBoundaryPaint = {
  fillColor: "#22c55e",
  fillOpacity: 0.25,
  outlineColor: "#16a34a",
  outlineWidth: 1.4,
  fillEmissive: 0.55,
  outlineEmissive: 0.95,
};
const CHC_RESPONSE_SOURCE_ID = "chc-response-source";
const CHC_RESPONSE_LAYER_ID = "chc-response-layer";
const CHC_RESPONSE_PAINT = {
  color: "#fb923c",
  width: 1.6,
  dashArray: [3, 3],
  emissive: 0.85,
};
const INUIT_COMMUNITIES_SOURCE_ID = "inuit-communities-source";
const INUIT_COMMUNITIES_LAYER_ID = "inuit-communities-layer";
const inuitCommunitiesPaint = {
  circleColor: "#0d9488",
  circleRadius: 5,
  circleActiveRadius: 8,
  circleStrokeColor: "#ffffff",
  circleStrokeWidth: 1.5,
  circleEmissive: 0.8,
};
const CENSUS_2021_SOURCE_ID = "census-2021-da-source";
const CENSUS_2021_FILL_LAYER_ID = "census-2021-da-fill";
const CENSUS_2021_OUTLINE_LAYER_ID = "census-2021-da-outline";
const census2021Paint = {
  fillColor: "#e879f9",
  fillOpacity: 0.35,
  outlineColor: "#c026d3",
  outlineWidth: 1.2,
  fillEmissive: 0.5,
  outlineEmissive: 0.8,
};

const OTTAWA_CAMERAS: OttawaCameraFeature[] = (ottawaCameraList as OttawaCameraRecord[])
  .reduce<OttawaCameraFeature[]>((acc, camera, index) => {
    const latitude = Number(camera.latitude);
    const longitude = Number(camera.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return acc;
    }
    const cameraNumberSource = typeof camera.number === "number" ? camera.number : Number(camera.number);
    if (!Number.isFinite(cameraNumberSource)) {
      return acc;
    }
    const cameraNumber = Number(cameraNumberSource);
    const rawId = typeof camera.id === "number" ? camera.id : Number(camera.id);
    const cameraIdComponent = Number.isFinite(rawId) ? `ottawa-id-${rawId}` : null;
    const fallbackId = `ottawa-num-${cameraNumber}-${index}`;
    const stateKey = cameraIdComponent ?? fallbackId;
    const rawDescription = typeof camera.description === "string" ? camera.description.trim() : "";
    const description = rawDescription.length > 0 ? rawDescription : `Camera ${cameraNumber}`;
    const descriptionFr =
      typeof camera.descriptionFr === "string" && camera.descriptionFr.trim().length > 0
        ? camera.descriptionFr.trim()
        : undefined;
    const type: TrafficCameraType = camera.type === "MTO" ? "MTO" : "CITY";
    acc.push({
      id: stateKey,
      stateKey,
      number: cameraNumber,
      latitude,
      longitude,
      description,
      descriptionFr,
      type,
    });
    return acc;
  }, [])
  .sort((a, b) => a.number - b.number);

const getEntityLabels = (visionResult?: GoogleVisionWebDetectionResult): string[] => {
  return (visionResult?.entities ?? [])
    .map((entity) => entity.description)
    .filter((description): description is string => Boolean(description && description.trim().length > 0));
};

const getHighlightTerms = (visionResult?: GoogleVisionWebDetectionResult): string[] => {
  const bestGuesses = visionResult?.bestGuesses ?? [];
  if (bestGuesses.length > 0) {
    return bestGuesses;
  }
  return getEntityLabels(visionResult);
};

type DataLayerRuntimeState<T = unknown> = {
  data: T[];
  loading: boolean;
  error: string | null;
  activeFeatureId: string | null;
  hasFetched: boolean;
};

const useDataLayerManager = (layerVisibility: Record<string, boolean>, currentBounds: MapBounds | null) => {
  const [layerDataState, setLayerDataState] = useState<Record<string, DataLayerRuntimeState>>(() => {
    return DATA_LAYER_CONFIGS.reduce<Record<string, DataLayerRuntimeState>>((acc, config) => {
      acc[config.id] = {
        data: [],
        loading: false,
        error: null,
        activeFeatureId: null,
        hasFetched: false,
      };
      return acc;
    }, {});
  });
  const layerDataStateRef = useRef(layerDataState);
  const currentBoundsRef = useRef(currentBounds);

  const abortControllersRef = useRef<Record<string, AbortController | null>>({});

  useEffect(() => {
    currentBoundsRef.current = currentBounds;
  }, [currentBounds]);

  useEffect(() => {
    layerDataStateRef.current = layerDataState;
  }, [layerDataState]);

  useEffect(() => {
    return () => {
      Object.values(abortControllersRef.current).forEach((controller) => controller?.abort());
    };
  }, []);

  useEffect(() => {
    DATA_LAYER_CONFIGS.forEach((config) => {
      if (!layerVisibility[config.id]) {
        return;
      }
      const state = layerDataStateRef.current[config.id];
      if (!state || state.loading || state.hasFetched) {
        return;
      }
      const controller = new AbortController();
      abortControllersRef.current[config.id] = controller;
      setLayerDataState((prev) => ({
        ...prev,
        [config.id]: {
          ...prev[config.id],
          loading: true,
          error: null,
        },
      }));
      config
        .fetcher({ signal: controller.signal, bbox: currentBounds })
        .then((data) => {
          if (controller.signal.aborted) {
            return;
          }
          setLayerDataState((prev) => ({
            ...prev,
            [config.id]: {
              ...prev[config.id],
              data,
              loading: false,
              error: null,
              hasFetched: true,
            },
          }));
        })
        .catch((error) => {
          if ((error as Error).name === "AbortError") {
            return;
          }
          setLayerDataState((prev) => ({
            ...prev,
            [config.id]: {
              ...prev[config.id],
              loading: false,
              error: (error as Error).message ?? "Layer unavailable.",
              hasFetched: true,
            },
          }));
        })
        .finally(() => {
          if (abortControllersRef.current[config.id] === controller) {
            abortControllersRef.current[config.id] = null;
          }
        });
    });
  }, [layerVisibility, currentBounds]); // Re-run when visibility OR bounds change

  const setActiveFeature = useCallback((layerId: string, featureId: string | null) => {
    setLayerDataState((prev) => ({
      ...prev,
      [layerId]: {
        ...prev[layerId],
        activeFeatureId: featureId,
      },
    }));
  }, []);

  return { layerDataState, setActiveFeature };
};

const formatTitleCase = (value?: string | null) => {
  if (!value) {
    return "Unknown";
  }
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};

const buildWildfireSummary = (wildfire: WildfireFeature) => {
  const identifier = wildfire.name && wildfire.name !== "Unnamed Fire" ? wildfire.name : wildfire.id;
  const declaredDate = wildfire.startDate ?? "an unknown date";
  const jurisdiction = wildfire.agency || "an unknown jurisdiction";
  const hectaresLabel = formatWildfireAreaValue(wildfire.hectares, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const areaText = hectaresLabel ? `${hectaresLabel} hectares` : "an unknown number of hectares";
  const responseLabel = formatTitleCase(wildfire.responseType);
  return `A fire with ID ${identifier} was declared on ${declaredDate} in the jurisdiction of ${jurisdiction} and has burned ${areaText} up until now. The fire is deemed to be ${wildfire.stageOfControl} with a ${responseLabel} response.`;
};

const buildBorderEntrySummary = (entry: BorderEntryFeature) => {
  const typeLabel =
    entry.entryType === "air" ? "air" : entry.entryType === "land" ? "land border" : "international crossing";
  const regionLabel = entry.region ? `${entry.region} region` : "an unspecified region";
  const provinceLabel = entry.province ? `, ${entry.province}` : "";
  return `The ${typeLabel} port ${entry.name} serves the ${regionLabel}${provinceLabel}. ${entry.address ? `It is located at ${entry.address}.` : ""
    }`;
};

const formatDangerAttributeNumber = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return new Intl.NumberFormat().format(value);
};

const formatSquareMeters = (value?: number | null) => {
  const formatted = formatDangerAttributeNumber(value);
  return formatted ? `${formatted} m²` : null;
};

const formatSquareKilometers = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const km2 = value / 1_000_000;
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: km2 < 10 ? 2 : 1,
    maximumFractionDigits: km2 < 10 ? 2 : 1,
  }).format(km2);
  return `${formatted} km²`;
};

const formatHectaresLabel = (value?: number | null) => {
  const formatted = formatDangerAttributeNumber(value);
  return formatted ? `${formatted} ha` : null;
};

const buildBuildingFootprintSummary = (building: BuildingFootprintFeature) => {
  const name = building.nameEn ?? building.nameFr ?? building.structureNumber ?? building.id;
  const location = building.municipalityEn ?? building.municipalityFr ?? building.provinceEn ?? "an unspecified location";
  const custodian = building.custodianEn ?? building.custodianFr ?? "an unspecified custodian";
  const useLabel = building.useEn ?? building.useFr ?? building.interestEn ?? "an unspecified purpose";
  return `${name} is managed by ${custodian} in ${location} for ${useLabel}.`;
};

const buildPropertyBoundarySummary = (property: PropertyBoundaryFeature) => {
  const name = property.nameEn ?? property.nameFr ?? property.propertyNumber ?? property.id;
  const location = property.municipalityEn ?? property.municipalityFr ?? property.provinceEn ?? "an unspecified location";
  const area = formatHectaresLabel(property.landAreaHa) ?? "an unspecified size";
  const custodian = property.custodianEn ?? property.custodianFr ?? "an unspecified custodian";
  return `${name} spans ${area} in ${location} and is managed by ${custodian}.`;
};

const buildIndigenousBoundarySummary = (boundary: IndigenousLandBoundaryFeature) => {
  const primaryName = boundary.names.find((entry) => entry.name)?.name ?? boundary.alCode ?? boundary.nid ?? boundary.id;
  const provider = boundary.provider ?? "an unspecified provider";
  const jurisdictionLabel = boundary.jurisdictions.length > 0 ? boundary.jurisdictions.join(", ") : null;
  const accuracyLabel = typeof boundary.accuracy === "number" ? `${boundary.accuracy}m accuracy` : null;
  const parts = [jurisdictionLabel, accuracyLabel, provider ? `Provider: ${provider}` : null].filter(Boolean);
  const suffix = parts.length > 0 ? ` • ${parts.join(" • ")}` : "";
  return `${primaryName}${suffix}`;
};

const buildInuitCommunitySummary = (community: InuitCommunityFeature) => {
  const name = community.name ?? community.identifier ?? community.id;
  const nameInuktitut = community.nameInuktitut ? ` (${community.nameInuktitut})` : "";
  const region = community.region ? ` in ${community.region}` : "";
  const population = community.population ? `. Population: ${community.population}` : "";
  const tradName = community.traditionalName ? ` Traditional Name: ${community.traditionalName}` : "";
  const meaning = community.traditionalNameMeaningEn ? ` (${community.traditionalNameMeaningEn})` : "";
  return `Community of ${name}${nameInuktitut}${region}${population}.${tradName}${meaning}`;
};

const WEATHER_ALERT_TYPE_STYLES = {
  warning: { fill: "#dc2626", outline: "#dc2626" },
  watch: { fill: "#f97316", outline: "#f97316" },
  advisory: { fill: "#facc15", outline: "#facc15" },
  statement: { fill: "#38bdf8", outline: "#38bdf8" },
  summary: { fill: "#a855f7", outline: "#a855f7" },
  default: { fill: "#6ee7b7", outline: "#6ee7b7" },
} as const;

const WEATHER_ALERT_NAME_STYLES: Record<string, { fill: string; outline: string }> = {
  "blizzard warning": { fill: "#537ae9", outline: "#537ae9" },
  "blowing snow advisory": { fill: "#93c5fd", outline: "#93c5fd" },
  "freezing rain warning": { fill: "#59b6e1", outline: "#59b6e1" },
  "rainfall warning": { fill: "#026ec7", outline: "#026ec7" },
  "snow squall warning": { fill: "#6ab7d9", outline: "#6ab7d9" },
  "snow squall watch": { fill: "#6ab7d9", outline: "#6ab7d9" },
  "snowfall warning": { fill: "#c1e1ee", outline: "#c1e1ee" },
  "special weather statement": { fill: "#90e2e0", outline: "#90e2e0" },
  "wind warning": { fill: "#b9c2cb", outline: "#b9c2cb" },
  "winter storm warning": { fill: "#85a4b8", outline: "#85a4b8" },
  "cold warning": { fill: "#bfdbfe", outline: "#bfdbfe" },
};

const resolveWeatherAlertStyle = (alert: EnvironmentCanadaWeatherAlertFeature) => {
  const normalizedName = (alert.alertNameEn ?? alert.alertNameFr ?? "").trim().toLowerCase();
  if (normalizedName && WEATHER_ALERT_NAME_STYLES[normalizedName]) {
    return WEATHER_ALERT_NAME_STYLES[normalizedName];
  }
  const searchKey = `${alert.alertType ?? ""} ${alert.alertNameEn ?? ""} `.toLowerCase();
  if (searchKey.includes("warning")) {
    return WEATHER_ALERT_TYPE_STYLES.warning;
  }
  if (searchKey.includes("watch")) {
    return WEATHER_ALERT_TYPE_STYLES.watch;
  }
  if (searchKey.includes("advisory")) {
    return WEATHER_ALERT_TYPE_STYLES.advisory;
  }
  if (searchKey.includes("statement")) {
    return WEATHER_ALERT_TYPE_STYLES.statement;
  }
  if (searchKey.includes("summary")) {
    return WEATHER_ALERT_TYPE_STYLES.summary;
  }
  return WEATHER_ALERT_TYPE_STYLES.default;
};

const WEATHER_ALERT_RISK_COLOR_MAP: Record<string, { swatch: string; text: string }> = {
  red: { swatch: "#dc2626", text: "#fef2f2" },
  orange: { swatch: "#ea580c", text: "#fff7ed" },
  yellow: { swatch: "#facc15", text: "#422006" },
  amber: { swatch: "#fbbf24", text: "#451a03" },
  green: { swatch: "#22c55e", text: "#052e16" },
  blue: { swatch: "#3b82f6", text: "#e0f2fe" },
  purple: { swatch: "#a855f7", text: "#faf5ff" },
  pink: { swatch: "#ec4899", text: "#fdf2f8" },
  white: { swatch: "#f8fafc", text: "#0f172a" },
  black: { swatch: "#0f172a", text: "#f8fafc" },
  grey: { swatch: "#6b7280", text: "#f8fafc" },
  gray: { swatch: "#6b7280", text: "#f8fafc" },
} as const;

const resolveRiskColorSwatch = (code?: string | null) => {
  if (!code) {
    return null;
  }
  const normalized = code.trim().toLowerCase();
  const preset = WEATHER_ALERT_RISK_COLOR_MAP[normalized];
  if (preset) {
    return { label: code, ...preset };
  }
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(code.trim())) {
    return { label: code, swatch: code.trim(), text: "#0f172a" };
  }
  return { label: code, swatch: code, text: "#0f172a" };
};

const WEATHER_ALERT_DESCRIPTION_FOOTER_REGEX =
  /Please continue to monitor alerts[\s\S]*?(?:#QCStorm\.)?[\s\S]*$/i;

const sanitizeWeatherAlertDescription = (value?: string | null) => {
  if (!value) {
    return null;
  }
  const withoutFooter = value.replace(WEATHER_ALERT_DESCRIPTION_FOOTER_REGEX, "").trim();
  if (withoutFooter.length === 0) {
    return null;
  }
  return withoutFooter;
};

const buildFireDangerSummary = (area: FireDangerFeature) => {
  const meta = FIRE_DANGER_LEVEL_METADATA[area.dangerLevel ?? "unknown"];
  const levelLabel = area.dangerLabel ?? meta.label;
  const start = area.firstDate ?? "an unknown start date";
  const end = area.lastDate ?? "the latest available reading";
  if (area.firstDate && area.lastDate) {
    return `This zone is rated ${levelLabel} based on observations between ${start} and ${end}.`;
  }
  if (area.firstDate && !area.lastDate) {
    return `This zone is rated ${levelLabel} based on observations starting ${start}.`;
  }
  if (!area.firstDate && area.lastDate) {
    return `This zone is rated ${levelLabel} based on the latest observation on ${end}.`;
  }
  return `This zone is rated ${levelLabel} using the most recent available modelling.`;
};

const formatCount = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return new Intl.NumberFormat().format(value);
};

const buildChcResponseZoneSummary = (zone: CHCResponseZoneFeature) => {
  const idValue = zone.properties?.Id ?? zone.properties?.id ?? zone.id;
  return `CHC response zone ${idValue} `;
};

const buildWeatherAlertTitle = (alert: EnvironmentCanadaWeatherAlertFeature) => {
  return (
    alert.alertNameEn ??
    alert.alertNameFr ??
    alert.nameEn ??
    alert.nameFr ??
    alert.featureId ??
    `Weather alert ${alert.id} `
  );
};

const buildWeatherAlertSummary = (alert: EnvironmentCanadaWeatherAlertFeature) => {
  const title = buildWeatherAlertTitle(alert);
  const typeLabel = alert.alertType ? ` • ${alert.alertType} ` : "";
  const provinceLabel = alert.provinceCode ? ` • ${alert.provinceCode} ` : "";
  return `${title}${typeLabel}${provinceLabel} `;
};

const buildWeatherAlertSubtitle = (alert: EnvironmentCanadaWeatherAlertFeature): string | null => {
  const parts = [alert.provinceCode, alert.alertType, alert.urgency].filter(Boolean);
  return parts.length > 0 ? parts.join(" • ") : null;
};

const formatWeatherAlertWindow = (alert: EnvironmentCanadaWeatherAlertFeature): string | null => {
  const effective = formatTimestamp(alert.effectiveDate);
  const expiry = formatTimestamp(alert.expireDate);
  if (effective && expiry) {
    return `${effective} → ${expiry} `;
  }
  if (effective) {
    return `Effective ${effective} `;
  }
  if (expiry) {
    return `Expires ${expiry} `;
  }
  return null;
};

const formatPerimeterAreaLabel = (value?: number | null) => {
  return formatWildfireAreaValue(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatHydrometricLevel = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `${value.toFixed(2)} m`;
};

const formatHydrometricFlow = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `${value.toFixed(1)} m³/s`;
};

const formatSignedDelta = (value?: number | null, unitLabel: string = "") => {
  if (typeof value !== "number" || Number.isNaN(value) || value === 0) {
    return null;
  }
  const formatter = new Intl.NumberFormat(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always" });
  return `${formatter.format(value)} ${unitLabel}`;
};

const formatStormWind = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `${value.toFixed(0)} kt`;
};

const formatStormPressure = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `${value.toFixed(0)} hPa`;
};

const formatStormCategory = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  if (value <= 0) {
    return "Tropical";
  }
  return `Category ${value}`;
};

const DOB_CATEGORY_ICON_MAP: Record<string, string> = {
  "1": "cahs.incident.civil.civilDemonstration",
  "2": "cahs.incident.civil.civilDemonstration",
  "3": "cahs.incident.civil",
  "4": "cahs.incident.rescue",
  "5": "cahs.incident.meteorological.drought",
  "6": "cahs.incident.temperature.coldWave",
  "7": "cahs.incident.temperature.heatWave",
  "8": "cahs.incident.meteorological.hail",
  "9": "cahs.incident.meteorological.windStorm",
  "10": "cahs.incident.meteorological.rainFall",
  "11": "cahs.incident.flood.stormSurge",
  "12": "cahs.incident.meteorological.tornado",
  "13": "cahs.incident.meteorological.winterStorm",
  "14": "cahs.incident.fire",
  "15": "cahs.incident.fire.urbanFire",
  "16": "cahs.incident.fire.wildlandUrbanInterfaceFire",
  "17": "cahs.incident.flood",
  "18": "cahs.incident.flood.damOverflow",
  "19": "cahs.incident.flood.highWater",
  "20": "cahs.incident.ice.iceJam",
  "21": "cahs.incident.flood.overlandFlowFlood",
  "22": "cahs.incident.flood.tsunami",
  "23": "cahs.incident.geophysical.avalanche",
  "24": "cahs.incident.geophysical.earthquake",
  "25": "cahs.incident.geophysical.landslide",
  "26": "cahs.incident.geophysical.volcanicEvent",
  "27": "cahs.incident.hazardousMaterial",
  "28": "cahs.incident.hazardousMaterial.biologicalHazard",
  "29": "cahs.incident.hazardousMaterial.chemicalHazard",
  "30": "cahs.incident.hazardousMaterial.poisonousGasHazard",
  "31": "cahs.incident.hazardousMaterial.radiologicalHazard",
  "32": "cahs.incident.health",
  "33": "cahs.incident.hazardousMaterial.explosiveHazard",
  "34": "cahs.incident.fire.industrialFire",
  "35": "cahs.incident.crime.bombThreat",
  "36": "cahs.incident.crime.bombExplosion",
  "37": "cahs.infrastructure.transportation.borderServices",
  "38": "cahs.incident.crime.dangerousPerson",
  "39": "cahs.incident.cyberIncident",
  "40": "cahs.incident.civil.dignitaryVisit",
  "41": "cahs.incident.crime.illegalMigration",
  "42": "cahs.incident.civil.publicEvent",
  "43": "cahs.incident.publicService.schoolLockdown",
  "44": "cahs.incident.crime.shooting",
  "45": "cahs.incident.civil.civilEmergency",
  "46": "cahs.incident.crime.suspiciousPackage",
  "47": "cahs.incident.aviation.spaceDebris",
  "48": "cahs.incident.geophysical.magneticStorm",
  "49": "cahs.incident.geophysical.meteorite",
  "50": "cahs.incident.aviation.rocketLaunch",
  "51": "cahs.incident.geophysical.magneticStorm",
  "52": "cahs.incident.aviation.aircraftCrash",
  "53": "cahs.incident.aviation",
  "54": "cahs.incident.roadway.bridgeClosure",
  "55": "cahs.incident.marine.nauticalAccident",
  "56": "cahs.incident.marine",
  "57": "cahs.incident.cyclonicEvent.hurricane",
  "58": "cahs.incident.cyclonicEvent.tropicalStorm",
  "59": "cahs.incident.cyclonicEvent.postTropicalStorm",
  "60": "cahs.incident.cyclonicEvent.tropicalDepression",
  "61": "cahs.incident.cyclonicEvent.postTropicalDepression",
  "62": "cahs.incident.cyclonicEvent.hurricane",
  "63": "cahs.incident.cyclonicEvent",
};

const resolveDobIncidentIconKey = (incident: DobIncidentFeature): string => {
  const attributes = incident.attributes ?? {};
  const categoryCode = attributes.display_IncidentCat as string | number | undefined;
  const mapped =
    typeof categoryCode === "string"
      ? DOB_CATEGORY_ICON_MAP[categoryCode]
      : typeof categoryCode === "number"
        ? DOB_CATEGORY_ICON_MAP[String(categoryCode)]
        : undefined;
  return mapped ?? "cahs.incident.disruption";
};

const resolveDobIncidentIconSrc = (incident: DobIncidentFeature): { src: string; alt: string } => {
  const iconKey = resolveDobIncidentIconKey(incident);
  const sanitized = iconKey.replace(/\s+/g, "");
  const src = `/OpenSourceSearch/CAHS/${sanitized}.png`;
  return { src, alt: iconKey };
};

const DobIncidentIconImage = ({ incident, isDarkMode }: { incident: DobIncidentFeature; isDarkMode: boolean }) => {
  const { src, alt } = resolveDobIncidentIconSrc(incident);
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      className="h-8 w-8 shrink-0"
      style={isDarkMode ? { filter: "invert(1) brightness(1.1)" } : undefined}
    />
  );
};

const parseArcGisDate = (value?: unknown): Date | null => {
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

const formatTimestamp = (value?: unknown, options?: { timeZone?: string; hour12?: boolean }) => {
  const date = parseArcGisDate(value);
  if (!date) {
    return null;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
    timeZone: options?.timeZone,
    hour12: options?.hour12 ?? false,
  }).format(date);
};

type PopupCardProps = {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  accentColor?: string;
  trailing?: ReactNode;
};

const PopupCard = ({ title, subtitle, children, onClose, accentColor, trailing }: PopupCardProps) => {
  return (
    <div className="min-w-[15rem] max-w-xs overflow-hidden rounded-xl border border-secondary/30 bg-primary shadow-lg shadow-black/20 ring-1 ring-black/5">
      <div className="flex items-start justify-between gap-3 border-b border-secondary/15 px-3 py-2">
        <div className="space-y-0.5">
          <p className="text-sm font-semibold leading-tight">{title}</p>
          {subtitle ? <div className="text-xs text-tertiary">{subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          {trailing}
          {onClose ? (
            <button
              type="button"
              aria-label="Close popup"
              className="rounded-full p-1 text-tertiary transition hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40 hover:cursor-pointer"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      </div>
      <div className="space-y-1 px-3 py-2 text-xs text-secondary">{children}</div>
      {accentColor ? <div className="h-1 w-full" style={{ background: accentColor }} /> : null}
    </div>
  );
};

export function ContextTab({
  visionResult,
  isVisionLoading,
  geolocationAnalysis,
  geolocationLoading,
  geolocationError,
  geolocationRequested,
  geolocationEnabled,
  geolocationAvailable,
  geolocationCoordinates,
  geolocationCoordinatesLoading,
  geolocationCoordinatesError,
  locationLayerRecommendation,
  locationLayerRecommendationLoading,
  locationLayerRecommendationError,
  geolocationConfidence,
  resizeTrigger,
}: ContextTabProps) {
  const highlightTerms = getHighlightTerms(visionResult);
  const mapRef = useRef<MapRef | null>(null);
  const lastAppliedMapStyleRef = useRef<string | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const lastAppliedRecommendationId = useRef<string | null>(null);
  const lastAutoCenterKey = useRef<string | null>(null);
  const { theme } = useTheme();
  const getSystemDarkPreference = useCallback(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }, []);
  const resolveIsDark = useCallback(() => {
    if (theme === "dark") {
      return true;
    }
    if (theme === "light") {
      return false;
    }
    return getSystemDarkPreference();
  }, [theme, getSystemDarkPreference]);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(resolveIsDark);
  useEffect(() => {
    setIsDarkMode(resolveIsDark());
  }, [resolveIsDark]);
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handlePreferenceChange = (event: MediaQueryListEvent) => {
      if (theme === "system") {
        setIsDarkMode(event.matches);
      }
    };
    mediaQuery.addEventListener("change", handlePreferenceChange);
    return () => {
      mediaQuery.removeEventListener("change", handlePreferenceChange);
    };
  }, [theme]);
  const mapStyleUrl = useMemo(() => (isDarkMode ? MAPBOX_STYLE_DARK_URL : MAPBOX_STYLE_LIGHT_URL), [isDarkMode]);
  const [selectedViewType, setSelectedViewType] = useState<ViewType>((VIEW_TYPE_OPTIONS[0]?.id as ViewType) ?? "general");
  /* --------------------------------------------------------------------------------
   * MAP & DATA STATE
   * -------------------------------------------------------------------------------- */
  const [currentBounds, setCurrentBounds] = useState<MapBounds | null>(null);

  useEffect(() => {
    // Initial bounds check if map is ready?
    // Actually we accept null initially and data load might happen without bounds for global layers,
    // but for our bounded layers they will wait or warn.
    // We can rely on onMoveEnd to set it.
  }, []);

  const handleMoveEnd = useCallback((evt: { target: mapboxgl.Map }) => {
    const bounds = evt.target.getBounds();
    if (bounds) {
      setCurrentBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
    }
  }, []);

  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(() =>
    MAP_LAYER_CONFIGS.reduce(
      (acc, layer) => {
        acc[layer.id] = false;
        return acc;
      },
      {} as Record<string, boolean>,
    ),
  );
  const [layerPageIndex, setLayerPageIndex] = useState(0);

  const toggleLayer = useCallback((layerId: string) => {
    setLayerVisibility((prev) => ({
      ...prev,
      [layerId]: !prev[layerId],
    }));
  }, []);

  const { layerDataState, setActiveFeature: setLayerActiveFeature } = useDataLayerManager(layerVisibility, currentBounds);
  const [activeCamera, setActiveCamera] = useState<OttawaCameraFeature | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(MAP_INITIAL_VIEW_STATE.zoom);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const [cameraPreviewStates, setCameraPreviewStates] = useState<Record<string, CameraPreviewState>>({});
  const [fullscreenCameraId, setFullscreenCameraId] = useState<string | null>(null);
  const [cameraCooldowns, setCameraCooldowns] = useState<Record<string, boolean>>({});
  const cameraRequestControllers = useRef<Record<string, AbortController | null>>({});
  const cameraObjectUrlsRef = useRef<Record<string, string | undefined>>({});
  const cameraPreviewStatesRef = useRef<Record<string, CameraPreviewState>>({});
  const cameraCooldownTimeoutsRef = useRef<Record<string, number>>({});
  const [contextQueryLat, setContextQueryLat] = useState<string>("");
  const [contextQueryLng, setContextQueryLng] = useState<string>("");
  const [contextQueryRadiusKm, setContextQueryRadiusKm] = useState<string>("25");
  const [contextQueryResults, setContextQueryResults] = useState<SurroundingContextHit[]>([]);
  const [contextQueryError, setContextQueryError] = useState<string | null>(null);
  const [contextQueryLoading, setContextQueryLoading] = useState<boolean>(false);
  const hasHighlightTerms = highlightTerms.length > 0;
  const computeZoomFromConfidence = (confidence?: number | null) => {
    if (typeof confidence !== "number" || Number.isNaN(confidence)) {
      return 9;
    }
    const clamped = Math.min(10, Math.max(0, confidence));
    const bonus = clamped >= 9 ? 1 : 0;
    return 4 + clamped + bonus; // 10 -> 15, 9 -> 14, etc.
  };
  const cardDescriptionText = isVisionLoading
    ? "Scanning the upload to personalize situational layers."
    : hasHighlightTerms
      ? "Map overlays adapt to the context detected in the upload."
      : "Use the situational layers to manually explore the map.";
  const layersForSelectedView = useMemo(
    () => MAP_LAYER_CONFIGS.filter((layer) => layer.viewTypes.includes(selectedViewType)),
    [selectedViewType],
  );
  const totalLayerPages = Math.max(1, Math.ceil(layersForSelectedView.length / LAYERS_PER_PAGE));
  const currentLayerPage = Math.min(layerPageIndex, totalLayerPages - 1);
  const paginatedLayers = layersForSelectedView.slice(
    currentLayerPage * LAYERS_PER_PAGE,
    currentLayerPage * LAYERS_PER_PAGE + LAYERS_PER_PAGE,
  );
  const activeLayerLabels = useMemo(
    () =>
      Object.entries(layerVisibility)
        .filter(([, isEnabled]) => isEnabled)
        .map(([layerId]) => MAP_LAYER_LOOKUP[layerId]?.label)
        .filter((label): label is string => Boolean(label)),
    [layerVisibility],
  );
  const recommendedLayerLabels = useMemo(() => {
    const ids = locationLayerRecommendation?.recommendedLayerIds ?? [];
    return ids
      .map((id) => MAP_LAYER_LOOKUP[id]?.label ?? id)
      .filter((label): label is string => Boolean(label));
  }, [locationLayerRecommendation]);
  const dobLayerState = layerDataState["dob-incidents"] as DataLayerRuntimeState<DobIncidentFeature>;
  const wildfireLayerState = layerDataState["active-wildfires"] as DataLayerRuntimeState<WildfireFeature>;
  const borderEntryLayerState = layerDataState["border-entries"] as DataLayerRuntimeState<BorderEntryFeature>;
  const fireDangerLayerState = layerDataState["fire-danger"] as DataLayerRuntimeState<FireDangerFeature>;
  const perimetersLayerState = layerDataState["perimeters"] as DataLayerRuntimeState<PerimeterFeature>;
  const aerodromeLayerState = layerDataState["aerodromes"] as DataLayerRuntimeState<AerodromeFeature>;
  const railwayLayerState = layerDataState["railways"] as DataLayerRuntimeState<RailwayFeature>;
  const highwayLayerState = layerDataState["highways"] as DataLayerRuntimeState<HighwayFeature>;
  const hurricaneLayerState = layerDataState["active-hurricanes"] as DataLayerRuntimeState<HurricaneFeature>;
  const recentHurricaneLayerState = layerDataState["recent-hurricanes"] as DataLayerRuntimeState<RecentHurricaneFeature>;
  const hydrometricLayerState = layerDataState["hydrometric-stations"] as DataLayerRuntimeState<HydrometricStationFeature>;
  const buildingFootprintLayerState = layerDataState["building-footprints"] as DataLayerRuntimeState<BuildingFootprintFeature>;
  const propertyBoundaryLayerState = layerDataState["property-boundaries"] as DataLayerRuntimeState<PropertyBoundaryFeature>;
  const indigenousBoundaryLayerState =
    layerDataState["indigenous-land-boundaries"] as DataLayerRuntimeState<IndigenousLandBoundaryFeature>;
  const chcResponseLayerState = layerDataState["chc-response-zone"] as DataLayerRuntimeState<CHCResponseZoneFeature>;
  const weatherAlertsLayerState = layerDataState["environment-canada-weather-alerts"] as DataLayerRuntimeState<EnvironmentCanadaWeatherAlertFeature>;
  const sourcesLayerState = layerDataState["sources"] as DataLayerRuntimeState<SourceLayerFeature>;
  const inuitCommunitiesLayerState = layerDataState["inuit-communities"] as DataLayerRuntimeState<InuitCommunityFeature>;
  const census2021LayerState = layerDataState["census-2021-da"] as DataLayerRuntimeState<Census2021DisseminationAreaFeature>;
  const dobLayerEnabled = Boolean(layerVisibility["dob-incidents"]);
  const wildfireLayerEnabled = Boolean(layerVisibility["active-wildfires"]);
  const borderEntriesEnabled = Boolean(layerVisibility["border-entries"]);
  const fireDangerLayerEnabled = Boolean(layerVisibility["fire-danger"]);
  const perimetersLayerEnabled = Boolean(layerVisibility["perimeters"]);
  const aerodromeLayerEnabled = Boolean(layerVisibility["aerodromes"]);
  const railwayLayerEnabled = Boolean(layerVisibility["railways"]);
  const highwayLayerEnabled = Boolean(layerVisibility["highways"]);
  const hurricaneLayerEnabled = Boolean(layerVisibility["active-hurricanes"]);
  const recentHurricanesEnabled = Boolean(layerVisibility["recent-hurricanes"]);
  const hydrometricLayerEnabled = Boolean(layerVisibility["hydrometric-stations"]);
  const buildingFootprintsEnabled = Boolean(layerVisibility["building-footprints"]);
  const propertyBoundariesEnabled = Boolean(layerVisibility["property-boundaries"]);
  const indigenousBoundariesEnabled = Boolean(layerVisibility["indigenous-land-boundaries"]);
  const chcResponseEnabled = Boolean(layerVisibility["chc-response-zone"]);
  const weatherAlertsEnabled = Boolean(layerVisibility["environment-canada-weather-alerts"]);
  const sourcesLayerEnabled = Boolean(layerVisibility["sources"]);
  const inuitCommunitiesEnabled = Boolean(layerVisibility["inuit-communities"]);
  const census2021Enabled = Boolean(layerVisibility["census-2021-da"]);
  const showOttawaCameras = Boolean(layerVisibility[CAMERA_LAYER_ID]);
  const visibleDobIncidents = useMemo(() => (dobLayerEnabled ? dobLayerState.data : []), [dobLayerEnabled, dobLayerState.data]);
  const visibleWildfires = useMemo(() => (wildfireLayerEnabled ? wildfireLayerState.data : []), [wildfireLayerEnabled, wildfireLayerState.data]);
  const visibleBorderEntries = useMemo(
    () => (borderEntriesEnabled ? borderEntryLayerState.data : []),
    [borderEntriesEnabled, borderEntryLayerState.data],
  );
  const visibleFireDangerAreas = useMemo(
    () => (fireDangerLayerEnabled ? fireDangerLayerState.data : []),
    [fireDangerLayerEnabled, fireDangerLayerState.data],
  );
  const visiblePerimeters = useMemo(
    () => (perimetersLayerEnabled ? perimetersLayerState.data : []),
    [perimetersLayerEnabled, perimetersLayerState.data],
  );
  const visibleAerodromes = useMemo(
    () => (aerodromeLayerEnabled ? aerodromeLayerState.data : []),
    [aerodromeLayerEnabled, aerodromeLayerState.data],
  );
  const visibleRailways = useMemo(
    () => (railwayLayerEnabled ? railwayLayerState.data : []),
    [railwayLayerEnabled, railwayLayerState.data],
  );
  const visibleHighways = useMemo(
    () => (highwayLayerEnabled ? highwayLayerState.data : []),
    [highwayLayerEnabled, highwayLayerState.data],
  );
  const visibleHurricaneCenters = useMemo(
    () =>
      hurricaneLayerEnabled
        ? (hurricaneLayerState.data.filter((feature) => feature.featureType === "center") as HurricaneCenterFeature[])
        : [],
    [hurricaneLayerEnabled, hurricaneLayerState.data],
  );
  const visibleHurricaneTracks = useMemo(
    () =>
      hurricaneLayerEnabled
        ? (hurricaneLayerState.data.filter((feature) => feature.featureType === "track") as HurricaneTrackFeature[])
        : [],
    [hurricaneLayerEnabled, hurricaneLayerState.data],
  );
  const visibleHurricaneErrorPolygons = useMemo(
    () =>
      hurricaneLayerEnabled
        ? (hurricaneLayerState.data.filter((feature) => feature.featureType === "error-cone") as HurricaneErrorFeature[])
        : [],
    [hurricaneLayerEnabled, hurricaneLayerState.data],
  );
  const visibleHurricaneWindPolygons = useMemo(
    () =>
      hurricaneLayerEnabled
        ? (hurricaneLayerState.data.filter((feature) => feature.featureType === "wind-radius") as HurricaneWindRadiusFeature[])
        : [],
    [hurricaneLayerEnabled, hurricaneLayerState.data],
  );
  const visibleRecentHurricanes = useMemo(
    () => (recentHurricanesEnabled ? recentHurricaneLayerState.data : []),
    [recentHurricanesEnabled, recentHurricaneLayerState.data],
  );
  const visibleHydrometricStations = useMemo(
    () => (hydrometricLayerEnabled ? hydrometricLayerState.data : []),
    [hydrometricLayerEnabled, hydrometricLayerState.data],
  );
  const visibleBuildingFootprints = useMemo(
    () => (buildingFootprintsEnabled ? buildingFootprintLayerState.data : []),
    [buildingFootprintsEnabled, buildingFootprintLayerState.data],
  );
  const visiblePropertyBoundaries = useMemo(
    () => (propertyBoundariesEnabled ? propertyBoundaryLayerState.data : []),
    [propertyBoundariesEnabled, propertyBoundaryLayerState.data],
  );
  const visibleIndigenousBoundaries = useMemo(
    () => (indigenousBoundariesEnabled ? indigenousBoundaryLayerState.data : []),
    [indigenousBoundariesEnabled, indigenousBoundaryLayerState.data],
  );
  const visibleWeatherAlerts = useMemo(
    () => (weatherAlertsEnabled ? weatherAlertsLayerState.data : []),
    [weatherAlertsEnabled, weatherAlertsLayerState.data],
  );
  const visibleChcResponseZones = useMemo(
    () => (chcResponseEnabled ? chcResponseLayerState.data : []),
    [chcResponseEnabled, chcResponseLayerState.data],
  );
  const visibleSources = useMemo(
    () => (sourcesLayerEnabled ? sourcesLayerState.data : []),
    [sourcesLayerEnabled, sourcesLayerState.data],
  );
  const visibleInuitCommunities = useMemo(
    () => (inuitCommunitiesEnabled ? inuitCommunitiesLayerState.data : []),
    [inuitCommunitiesEnabled, inuitCommunitiesLayerState.data],
  );
  const visibleCensus2021 = useMemo(
    () => (census2021Enabled ? census2021LayerState.data : []),
    [census2021Enabled, census2021LayerState.data],
  );
  const visibleOttawaCameras = useMemo(
    () => (showOttawaCameras && mapZoom >= CAMERA_MARKER_MIN_ZOOM ? OTTAWA_CAMERAS : []),
    [showOttawaCameras, mapZoom],
  );
  const activeDobIncident = useMemo(() => {
    if (!dobLayerState.activeFeatureId || !dobLayerEnabled) {
      return null;
    }
    return dobLayerState.data.find((incident) => incident.id === dobLayerState.activeFeatureId) ?? null;
  }, [dobLayerState.activeFeatureId, dobLayerState.data, dobLayerEnabled]);
  const activeWildfire = useMemo(() => {
    if (!wildfireLayerState.activeFeatureId || !wildfireLayerEnabled) {
      return null;
    }
    return wildfireLayerState.data.find((fire) => fire.id === wildfireLayerState.activeFeatureId) ?? null;
  }, [wildfireLayerState.activeFeatureId, wildfireLayerState.data, wildfireLayerEnabled]);
  const activeWildfireSizeLabel = activeWildfire ? formatWildfireAreaValue(activeWildfire.hectares) : null;
  const activeWildfireSummary = activeWildfire ? buildWildfireSummary(activeWildfire) : null;
  const activeBorderEntry = useMemo(() => {
    if (!borderEntryLayerState.activeFeatureId || !borderEntriesEnabled) {
      return null;
    }
    return borderEntryLayerState.data.find((entry) => entry.id === borderEntryLayerState.activeFeatureId) ?? null;
  }, [borderEntryLayerState.activeFeatureId, borderEntryLayerState.data, borderEntriesEnabled]);
  const activeBorderEntrySummary = activeBorderEntry ? buildBorderEntrySummary(activeBorderEntry) : null;
  const activeFireDangerArea = useMemo(() => {
    if (!fireDangerLayerState.activeFeatureId || !fireDangerLayerEnabled) {
      return null;
    }
    return fireDangerLayerState.data.find((area) => area.id === fireDangerLayerState.activeFeatureId) ?? null;
  }, [fireDangerLayerState.activeFeatureId, fireDangerLayerState.data, fireDangerLayerEnabled]);
  const activePerimeter = useMemo(() => {
    if (!perimetersLayerState.activeFeatureId || !perimetersLayerEnabled) {
      return null;
    }
    return perimetersLayerState.data.find((perimeter) => perimeter.id === perimetersLayerState.activeFeatureId) ?? null;
  }, [perimetersLayerState.activeFeatureId, perimetersLayerState.data, perimetersLayerEnabled]);
  const activeInuitCommunity = useMemo(() => {
    if (!inuitCommunitiesLayerState.activeFeatureId || !inuitCommunitiesEnabled) {
      return null;
    }
    return inuitCommunitiesLayerState.data.find((c) => c.id === inuitCommunitiesLayerState.activeFeatureId) ?? null;
  }, [inuitCommunitiesLayerState.activeFeatureId, inuitCommunitiesLayerState.data, inuitCommunitiesEnabled]);
  const activeCensus2021 = useMemo(() => {
    if (!census2021LayerState.activeFeatureId || !census2021Enabled) {
      return null;
    }
    return census2021LayerState.data.find((c) => c.id === census2021LayerState.activeFeatureId) ?? null;
  }, [census2021LayerState.activeFeatureId, census2021LayerState.data, census2021Enabled]);
  const activeInuitCommunitySummary = activeInuitCommunity ? buildInuitCommunitySummary(activeInuitCommunity) : null;
  const activeAerodrome = useMemo(() => {
    if (!aerodromeLayerState.activeFeatureId || !aerodromeLayerEnabled) {
      return null;
    }
    return aerodromeLayerState.data.find((entry) => entry.id === aerodromeLayerState.activeFeatureId) ?? null;
  }, [aerodromeLayerEnabled, aerodromeLayerState.activeFeatureId, aerodromeLayerState.data]);
  const activeRailway = useMemo(() => {
    if (!railwayLayerState.activeFeatureId || !railwayLayerEnabled) {
      return null;
    }
    return railwayLayerState.data.find((segment) => segment.id === railwayLayerState.activeFeatureId) ?? null;
  }, [railwayLayerEnabled, railwayLayerState.activeFeatureId, railwayLayerState.data]);
  const activeHighway = useMemo(() => {
    if (!highwayLayerState.activeFeatureId || !highwayLayerEnabled) {
      return null;
    }
    return highwayLayerState.data.find((corridor) => corridor.id === highwayLayerState.activeFeatureId) ?? null;
  }, [highwayLayerEnabled, highwayLayerState.activeFeatureId, highwayLayerState.data]);
  const activeHurricaneCenter = useMemo(() => {
    if (!hurricaneLayerState.activeFeatureId || !hurricaneLayerEnabled) {
      return null;
    }
    const feature = hurricaneLayerState.data.find((item) => item.id === hurricaneLayerState.activeFeatureId);
    return feature && feature.featureType === "center" ? (feature as HurricaneCenterFeature) : null;
  }, [hurricaneLayerEnabled, hurricaneLayerState.activeFeatureId, hurricaneLayerState.data]);
  const activeRecentHurricane = useMemo(() => {
    if (!recentHurricaneLayerState.activeFeatureId || !recentHurricanesEnabled) {
      return null;
    }
    return (
      recentHurricaneLayerState.data.find((storm) => storm.id === recentHurricaneLayerState.activeFeatureId) ?? null
    );
  }, [recentHurricanesEnabled, recentHurricaneLayerState.activeFeatureId, recentHurricaneLayerState.data]);
  const activeHydrometricStation = useMemo(() => {
    if (!hydrometricLayerState.activeFeatureId || !hydrometricLayerEnabled) {
      return null;
    }
    return (
      hydrometricLayerState.data.find((station) => station.id === hydrometricLayerState.activeFeatureId) ?? null
    );
  }, [hydrometricLayerEnabled, hydrometricLayerState.activeFeatureId, hydrometricLayerState.data]);
  const activeBuildingFootprint = useMemo(() => {
    if (!buildingFootprintsEnabled || !buildingFootprintLayerState.activeFeatureId) {
      return null;
    }
    return (
      buildingFootprintLayerState.data.find(
        (footprint) => footprint.id === buildingFootprintLayerState.activeFeatureId,
      ) ?? null
    );
  }, [buildingFootprintsEnabled, buildingFootprintLayerState.activeFeatureId, buildingFootprintLayerState.data]);
  const activePropertyBoundary = useMemo(() => {
    if (!propertyBoundariesEnabled || !propertyBoundaryLayerState.activeFeatureId) {
      return null;
    }
    return (
      propertyBoundaryLayerState.data.find(
        (boundary) => boundary.id === propertyBoundaryLayerState.activeFeatureId,
      ) ?? null
    );
  }, [propertyBoundariesEnabled, propertyBoundaryLayerState.activeFeatureId, propertyBoundaryLayerState.data]);
  const activeIndigenousBoundary = useMemo(() => {
    if (!indigenousBoundariesEnabled || !indigenousBoundaryLayerState.activeFeatureId) {
      return null;
    }
    return (
      indigenousBoundaryLayerState.data.find(
        (boundary) => boundary.id === indigenousBoundaryLayerState.activeFeatureId,
      ) ?? null
    );
  }, [
    indigenousBoundariesEnabled,
    indigenousBoundaryLayerState.activeFeatureId,
    indigenousBoundaryLayerState.data,
  ]);
  const activeWeatherAlert = useMemo(() => {
    if (!weatherAlertsEnabled || !weatherAlertsLayerState.activeFeatureId) {
      return null;
    }
    return (
      weatherAlertsLayerState.data.find(
        (alert) => alert.id === weatherAlertsLayerState.activeFeatureId,
      ) ?? null
    );
  }, [weatherAlertsEnabled, weatherAlertsLayerState.activeFeatureId, weatherAlertsLayerState.data]);
  const activeCHCResponseZone = useMemo(() => {
    if (!chcResponseEnabled || !chcResponseLayerState.activeFeatureId) {
      return null;
    }
    return (
      chcResponseLayerState.data.find((zone) => zone.id === chcResponseLayerState.activeFeatureId) ?? null
    );
  }, [chcResponseEnabled, chcResponseLayerState.activeFeatureId, chcResponseLayerState.data]);
  const activeSource = useMemo(() => {
    if (!sourcesLayerEnabled || !sourcesLayerState.activeFeatureId) {
      return null;
    }
    return sourcesLayerState.data.find((source) => source.id === sourcesLayerState.activeFeatureId) ?? null;
  }, [sourcesLayerEnabled, sourcesLayerState.activeFeatureId, sourcesLayerState.data]);
  const sourcePopupDetails = useMemo(() => {
    if (!activeSource) {
      return null;
    }
    return {
      reportingPreview: buildListPreview(activeSource.reportingCriteria, 4),
      tagsPreview: buildListPreview(activeSource.tags, 4),
      createdAt: formatTimestamp(activeSource.creationDate),
      editedAt: formatTimestamp(activeSource.editDate),
    };
  }, [activeSource]);
  const activeBuildingFootprintSummary = useMemo(
    () => (activeBuildingFootprint ? buildBuildingFootprintSummary(activeBuildingFootprint) : null),
    [activeBuildingFootprint],
  );
  const activePropertyBoundarySummary = useMemo(
    () => (activePropertyBoundary ? buildPropertyBoundarySummary(activePropertyBoundary) : null),
    [activePropertyBoundary],
  );
  const activeIndigenousBoundarySummary = useMemo(
    () => (activeIndigenousBoundary ? buildIndigenousBoundarySummary(activeIndigenousBoundary) : null),
    [activeIndigenousBoundary],
  );
  const activeWeatherAlertSubtitle = useMemo(
    () => (activeWeatherAlert ? buildWeatherAlertSubtitle(activeWeatherAlert) : null),
    [activeWeatherAlert],
  );
  const weatherAlertValidityWindow = useMemo(
    () => (activeWeatherAlert ? formatWeatherAlertWindow(activeWeatherAlert) : null),
    [activeWeatherAlert],
  );
  const activeWeatherAlertStyle = useMemo(
    () => (activeWeatherAlert ? resolveWeatherAlertStyle(activeWeatherAlert) : WEATHER_ALERT_TYPE_STYLES.default),
    [activeWeatherAlert],
  );
  const weatherAlertRiskSwatch = useMemo(
    () => (activeWeatherAlert ? resolveRiskColorSwatch(activeWeatherAlert.alertRiskColorCode) : null),
    [activeWeatherAlert],
  );
  const weatherAlertDescription = useMemo(() => {
    if (!activeWeatherAlert) {
      return null;
    }
    const english = sanitizeWeatherAlertDescription(activeWeatherAlert.alertDescriptionEn);
    if (english) {
      return english;
    }
    return sanitizeWeatherAlertDescription(activeWeatherAlert.alertDescriptionFr);
  }, [activeWeatherAlert]);
  const weatherAlertSubtitleNode = useMemo(() => {
    if (!activeWeatherAlertSubtitle) {
      return null;
    }
    if (!weatherAlertRiskSwatch) {
      return activeWeatherAlertSubtitle;
    }
    const borderColor = isDarkMode ? "rgba(255,255,255,0.45)" : "rgba(15,23,42,0.35)";
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="h-2.5 w-2.5 rounded-full border"
          style={{ backgroundColor: weatherAlertRiskSwatch.swatch, borderColor }}
          aria-hidden="true"
        />
        <span>{activeWeatherAlertSubtitle}</span>
      </span>
    );
  }, [activeWeatherAlertSubtitle, isDarkMode, weatherAlertRiskSwatch]);
  const perimeterLatestLabel = useMemo(
    () =>
      activePerimeter
        ? formatTimestamp(activePerimeter.lastDate ?? activePerimeter.properties?.LASTDATE, { timeZone: "UTC", hour12: false })
        : null,
    [activePerimeter],
  );
  const perimeterEarliestLabel = useMemo(
    () =>
      activePerimeter
        ? formatTimestamp(activePerimeter.firstDate ?? activePerimeter.properties?.FIRSTDATE, { hour12: true })
        : null,
    [activePerimeter],
  );
  const activeIndigenousBoundaryAreaLabel = useMemo(() => {
    if (!activeIndigenousBoundary) {
      return null;
    }
    return (
      formatSquareKilometers(activeIndigenousBoundary.areaSqMeters) ??
      formatSquareMeters(activeIndigenousBoundary.areaSqMeters)
    );
  }, [activeIndigenousBoundary]);
  const borderMarkerButtonClass = useMemo(
    () =>
      isDarkMode
        ? `${BORDER_ENTRY_MARKER_BASE_CLASS} border-white/30 bg-black/80 hover:bg-black/60 focus-visible:ring-white/60`
        : `${BORDER_ENTRY_MARKER_BASE_CLASS} border-black/10 bg-white hover:bg-white/80 focus-visible:ring-black/30`,
    [isDarkMode],
  );
  const aerodromeMarkerButtonClass = useMemo(
    () =>
      isDarkMode
        ? `${AERODROME_MARKER_BASE_CLASS} border-white/30 bg-violet-700/80 text-violet-100 shadow-violet-500/30 hover:bg-violet-700 focus-visible:ring-violet-200/70`
        : `${AERODROME_MARKER_BASE_CLASS} border-violet-200 bg-white text-violet-700 shadow-violet-500/20 hover:bg-violet-50 focus-visible:ring-violet-300/70`,
    [isDarkMode],
  );
  const fireDangerOpacity = useMemo(
    () => ({
      active: isDarkMode ? 0.6 : 0.5,
      default: isDarkMode ? 0.42 : 0.28,
      emissive: isDarkMode ? 0.85 : 0.15,
      outlineEmissive: isDarkMode ? 0.9 : 0.2,
    }),
    [isDarkMode],
  );
  const perimeterPaint = useMemo(
    () => ({
      fillColor: isDarkMode ? "#f87171" : "#dc2626",
      outlineColor: isDarkMode ? "#fecdd3" : "#b91c1c",
      activeOpacity: isDarkMode ? 0.62 : 0.5,
      defaultOpacity: isDarkMode ? 0.45 : 0.3,
      activeWidth: isDarkMode ? 2.4 : 2,
      defaultWidth: isDarkMode ? 1.4 : 1,
      fillEmissive: isDarkMode ? 0.9 : 0.2,
      outlineEmissive: isDarkMode ? 0.9 : 0.25,
    }),
    [isDarkMode],
  );
  const railwayPaint = useMemo(
    () => ({
      color: isDarkMode ? "#fbbf24" : "#b45309",
      activeColor: isDarkMode ? "#f59e0b" : "#d97706",
      activeWidth: isDarkMode ? 3 : 2.4,
      defaultWidth: isDarkMode ? 2 : 1.6,
      emissive: isDarkMode ? 0.9 : 0.25,
    }),
    [isDarkMode],
  );
  const highwayPaint = useMemo(
    () => ({
      color: isDarkMode ? "#34d399" : "#059669",
      activeColor: isDarkMode ? "#22c55e" : "#047857",
      activeWidth: isDarkMode ? 3.2 : 2.6,
      defaultWidth: isDarkMode ? 2.2 : 1.7,
      emissive: isDarkMode ? 0.9 : 0.25,
    }),
    [isDarkMode],
  );
  const hurricaneTrackPaint = useMemo(
    () => ({
      color: isDarkMode ? "#bae6fd" : "#0284c7",
      width: isDarkMode ? 2.2 : 1.8,
      emissive: isDarkMode ? 0.8 : 0.2,
    }),
    [isDarkMode],
  );
  const hurricaneErrorPaint = useMemo(
    () => ({
      color: isDarkMode ? "rgba(251, 191, 36, 0.35)" : "rgba(251, 191, 36, 0.22)",
      emissive: isDarkMode ? 0.8 : 0.2,
    }),
    [isDarkMode],
  );
  const hurricaneWindPaint = useMemo(
    () => ({
      color: isDarkMode ? "rgba(96, 165, 250, 0.35)" : "rgba(96, 165, 250, 0.2)",
      emissive: isDarkMode ? 0.8 : 0.2,
    }),
    [isDarkMode],
  );
  const weatherAlertPaint = useMemo(
    () => ({
      defaultFillOpacity: 0.45,
      activeFillOpacity: isDarkMode ? 0.55 : 0.45,
      fillEmissive: isDarkMode ? 0.1 : 0.1,
      outlineWidth: isDarkMode ? 2 : 1.6,
      activeOutlineWidth: isDarkMode ? 3 : 2.4,
      outlineEmissive: isDarkMode ? 0.8 : 0.55,
    }),
    [isDarkMode],
  );
  const fireDangerGeoJson = useMemo<FeatureCollection>(() => {
    if (!fireDangerLayerEnabled || visibleFireDangerAreas.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleFireDangerAreas.map((area) => ({
        type: "Feature",
        geometry: area.geometry,
        properties: {
          id: area.id,
          dangerLevel: area.dangerLevel,
          fillColor: (FIRE_DANGER_LEVEL_METADATA[area.dangerLevel ?? "unknown"] ?? FIRE_DANGER_LEVEL_METADATA.unknown).colorHex,
          outlineColor: (
            FIRE_DANGER_LEVEL_METADATA[area.dangerLevel ?? "unknown"] ?? FIRE_DANGER_LEVEL_METADATA.unknown
          ).hoverColorHex,
        },
      })),
    };
  }, [fireDangerLayerEnabled, visibleFireDangerAreas]);
  const fireDangerInteractiveLayerIds = useMemo(() => {
    if (!fireDangerLayerEnabled || fireDangerGeoJson.features.length === 0) {
      return [];
    }
    return [FIRE_DANGER_FILL_LAYER_ID];
  }, [fireDangerGeoJson.features.length, fireDangerLayerEnabled]);
  const perimetersGeoJson = useMemo<FeatureCollection>(() => {
    if (!perimetersLayerEnabled || visiblePerimeters.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visiblePerimeters.map((perimeter) => ({
        type: "Feature",
        geometry: perimeter.geometry,
        properties: {
          id: perimeter.id,
        },
      })),
    };
  }, [perimetersLayerEnabled, visiblePerimeters]);
  const hurricaneTrackGeoJson = useMemo<FeatureCollection>(() => {
    if (!hurricaneLayerEnabled || visibleHurricaneTracks.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleHurricaneTracks.map((track) => ({
        type: "Feature",
        geometry: track.geometry,
        properties: { id: track.id, stormName: track.stormName ?? undefined },
      })),
    };
  }, [hurricaneLayerEnabled, visibleHurricaneTracks]);
  const hurricaneErrorGeoJson = useMemo<FeatureCollection>(() => {
    if (!hurricaneLayerEnabled || visibleHurricaneErrorPolygons.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleHurricaneErrorPolygons.map((polygon) => ({
        type: "Feature",
        geometry: polygon.geometry,
        properties: { id: polygon.id, stormName: polygon.stormName ?? undefined },
      })),
    };
  }, [hurricaneLayerEnabled, visibleHurricaneErrorPolygons]);
  const hurricaneWindGeoJson = useMemo<FeatureCollection>(() => {
    if (!hurricaneLayerEnabled || visibleHurricaneWindPolygons.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleHurricaneWindPolygons.map((polygon) => ({
        type: "Feature",
        geometry: polygon.geometry,
        properties: { id: polygon.id, stormName: polygon.stormName ?? undefined, windForce: polygon.windForce ?? undefined },
      })),
    };
  }, [hurricaneLayerEnabled, visibleHurricaneWindPolygons]);
  const perimetersInteractiveLayerIds = useMemo(() => {
    if (!perimetersLayerEnabled || perimetersGeoJson.features.length === 0) {
      return [];
    }
    return [PERIMETERS_FILL_LAYER_ID];
  }, [perimetersGeoJson.features.length, perimetersLayerEnabled]);
  const railwayGeoJson = useMemo<FeatureCollection>(() => {
    if (!railwayLayerEnabled || visibleRailways.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleRailways.map((rail) => ({
        type: "Feature",
        geometry: rail.geometry,
        properties: {
          id: rail.id,
          name: rail.name,
        },
      })),
    };
  }, [railwayLayerEnabled, visibleRailways]);
  const railwayInteractiveLayerIds = useMemo(() => {
    if (!railwayLayerEnabled || railwayGeoJson.features.length === 0) {
      return [];
    }
    return [RAILWAYS_LINE_LAYER_ID];
  }, [railwayGeoJson.features.length, railwayLayerEnabled]);
  const highwayGeoJson = useMemo<FeatureCollection>(() => {
    if (!highwayLayerEnabled || visibleHighways.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleHighways.map((highway) => ({
        type: "Feature",
        geometry: highway.geometry,
        properties: {
          id: highway.id,
          name: highway.name,
        },
      })),
    };
  }, [highwayLayerEnabled, visibleHighways]);
  const highwayInteractiveLayerIds = useMemo(() => {
    if (!highwayLayerEnabled || highwayGeoJson.features.length === 0) {
      return [];
    }
    return [HIGHWAYS_LINE_LAYER_ID];
  }, [highwayGeoJson.features.length, highwayLayerEnabled]);
  const buildingFootprintGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: visibleBuildingFootprints
        .filter((footprint) => footprint.geometry)
        .map((footprint) => ({
          type: "Feature",
          properties: { id: footprint.id },
          geometry: footprint.geometry as Geometry,
        })),
    };
  }, [visibleBuildingFootprints]);
  const propertyBoundaryGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: visiblePropertyBoundaries
        .filter((boundary) => boundary.geometry)
        .map((boundary) => ({
          type: "Feature",
          properties: { id: boundary.id },
          geometry: boundary.geometry as Geometry,
        })),
    };
  }, [visiblePropertyBoundaries]);
  const indigenousBoundaryGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: visibleIndigenousBoundaries
        .filter((boundary) => boundary.geometry)
        .map((boundary) => ({
          type: "Feature",
          properties: { id: boundary.id },
          geometry: boundary.geometry as Geometry,
        })),
    };
  }, [visibleIndigenousBoundaries]);
  const census2021GeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: visibleCensus2021
        .filter((feature) => feature.geometry)
        .map((feature) => ({
          type: "Feature",
          properties: { id: feature.id },
          geometry: feature.geometry as Geometry,
        })),
    };
  }, [visibleCensus2021]);
  const weatherAlertsGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: visibleWeatherAlerts
        .filter((alert) => alert.geometry)
        .map((alert) => {
          const style = resolveWeatherAlertStyle(alert);
          return {
            type: "Feature",
            properties: {
              id: alert.id,
              fillColor: style.fill,
              outlineColor: style.outline,
            },
            geometry: alert.geometry as Geometry,
          };
        }),
    };
  }, [visibleWeatherAlerts]);
  const chcResponseGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: visibleChcResponseZones
        .map((zone) => ({
          type: "Feature",
          properties: { id: zone.id, Id: zone.properties?.Id ?? zone.properties?.id },
          geometry: zone.geometry,
        })),
    };
  }, [visibleChcResponseZones]);
  const buildingFootprintInteractiveLayerIds = useMemo(() => {
    if (!buildingFootprintsEnabled || buildingFootprintGeoJson.features.length === 0) {
      return [];
    }
    return [BUILDING_FOOTPRINT_FILL_LAYER_ID];
  }, [buildingFootprintsEnabled, buildingFootprintGeoJson.features.length]);
  const propertyBoundaryInteractiveLayerIds = useMemo(() => {
    if (!propertyBoundariesEnabled || propertyBoundaryGeoJson.features.length === 0) {
      return [];
    }
    return [PROPERTY_BOUNDARIES_FILL_LAYER_ID];
  }, [propertyBoundariesEnabled, propertyBoundaryGeoJson.features.length]);
  const indigenousBoundaryInteractiveLayerIds = useMemo(() => {
    if (!indigenousBoundariesEnabled || indigenousBoundaryGeoJson.features.length === 0) {
      return [];
    }
    return [INDIGENOUS_BOUNDARIES_FILL_LAYER_ID];
  }, [indigenousBoundariesEnabled, indigenousBoundaryGeoJson.features.length]);
  const census2021InteractiveLayerIds = useMemo(() => {
    if (!census2021Enabled || census2021GeoJson.features.length === 0) {
      return [];
    }
    return [CENSUS_2021_FILL_LAYER_ID];
  }, [census2021Enabled, census2021GeoJson.features.length]);
  const weatherAlertsInteractiveLayerIds = useMemo(() => {
    if (!weatherAlertsEnabled || weatherAlertsGeoJson.features.length === 0) {
      return [];
    }
    return [WEATHER_ALERTS_FILL_LAYER_ID, WEATHER_ALERTS_OUTLINE_LAYER_ID];
  }, [weatherAlertsEnabled, weatherAlertsGeoJson.features.length]);
  const chcResponseInteractiveLayerIds = useMemo(() => {
    if (!chcResponseEnabled || chcResponseGeoJson.features.length === 0) {
      return [];
    }
    return [CHC_RESPONSE_LAYER_ID];
  }, [chcResponseEnabled, chcResponseGeoJson.features.length]);

  const fullscreenCamera = useMemo(() => {
    if (!fullscreenCameraId) {
      return null;
    }
    return OTTAWA_CAMERAS.find((camera) => camera.stateKey === fullscreenCameraId) ?? null;
  }, [fullscreenCameraId]);
  const fullscreenCameraPreview = fullscreenCameraId ? cameraPreviewStates[fullscreenCameraId] : undefined;
  const activeCameraPreview = activeCamera ? cameraPreviewStates[activeCamera.stateKey] : undefined;
  const activeCameraHasCooldown = activeCamera ? Boolean(cameraCooldowns[activeCamera.stateKey]) : false;
  const activeCameraRefreshDisabled = Boolean(activeCameraPreview?.isLoading) || activeCameraHasCooldown;

  const requestCameraThumbnail = useCallback(async (camera: OttawaCameraFeature) => {
    const stateKey = camera.stateKey;
    const existingState = cameraPreviewStatesRef.current[stateKey];
    if (existingState?.isLoading) {
      return;
    }
    const controller = new AbortController();
    cameraRequestControllers.current[stateKey]?.abort();
    cameraRequestControllers.current[stateKey] = controller;
    setCameraCooldowns((prev) => ({
      ...prev,
      [stateKey]: true,
    }));
    if (typeof window !== "undefined") {
      if (cameraCooldownTimeoutsRef.current[stateKey]) {
        window.clearTimeout(cameraCooldownTimeoutsRef.current[stateKey]!);
      }
      cameraCooldownTimeoutsRef.current[stateKey] = window.setTimeout(() => {
        setCameraCooldowns((prev) => {
          const next = { ...prev };
          delete next[stateKey];
          return next;
        });
        delete cameraCooldownTimeoutsRef.current[stateKey];
      }, CAMERA_REFRESH_DEBOUNCE_MS);
    }
    setCameraPreviewStates((prev) => ({
      ...prev,
      [stateKey]: {
        ...(prev[stateKey] ?? createCameraPreviewState()),
        isLoading: true,
        error: null,
      },
    }));
    try {
      const requestUrl = buildCameraRequestUrl(camera.number);
      const response = await fetch(requestUrl, {
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch camera ${camera.number} (${response.status})`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      setCameraPreviewStates((prev) => {
        const previousUrl = prev[stateKey]?.objectUrl;
        if (previousUrl && previousUrl !== objectUrl) {
          URL.revokeObjectURL(previousUrl);
        }
        cameraObjectUrlsRef.current[stateKey] = objectUrl;
        return {
          ...prev,
          [stateKey]: {
            objectUrl,
            fetchedAt: Date.now(),
            isLoading: false,
            error: null,
          },
        };
      });
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        return;
      }
      console.error(`Failed to load camera ${camera.number}`, error);
      setCameraPreviewStates((prev) => {
        const previousState = prev[stateKey] ?? createCameraPreviewState();
        return {
          ...prev,
          [stateKey]: {
            ...previousState,
            isLoading: false,
            error: "Unable to load the latest still.",
          },
        };
      });
    } finally {
      if (cameraRequestControllers.current[stateKey] === controller) {
        delete cameraRequestControllers.current[stateKey];
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      setIsDarkMode(resolveIsDark());
      return;
    }
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setIsDarkMode(resolveIsDark());
    };
    setIsDarkMode(resolveIsDark());
    if (theme === "system") {
      mediaQuery.addEventListener("change", handleChange);
      return () => {
        mediaQuery.removeEventListener("change", handleChange);
      };
    }
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [theme]);

  useEffect(() => {
    cameraPreviewStatesRef.current = cameraPreviewStates;
  }, [cameraPreviewStates]);

  useEffect(() => {
    setLayerPageIndex(0);
  }, [selectedViewType]);

  useEffect(() => {
    if (!geolocationEnabled || !geolocationAvailable || !mapReady) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[ContextTab] skip flyTo preconditions", {
          geolocationEnabled,
          geolocationAvailable,
          mapReady,
          hasCoords: Boolean(geolocationCoordinates),
        });
      }
      return;
    }
    if (!geolocationCoordinates) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[ContextTab] skip flyTo no coords");
      }
      return;
    }
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!mapInstance) {
      return;
    }
    const confidence =
      typeof geolocationConfidence === "number"
        ? geolocationConfidence
        : geolocationAnalysis?.confidenceScore;
    const zoom = computeZoomFromConfidence(confidence);
    const key = `${geolocationCoordinates.latitude.toFixed(4)},${geolocationCoordinates.longitude.toFixed(4)}|${zoom.toFixed(1)}`;
    if (lastAutoCenterKey.current === key) {
      if (process.env.NODE_ENV !== "production") {
        console.debug("[ContextTab] skip flyTo; already centered", { key });
      }
      return;
    }
    if (process.env.NODE_ENV !== "production") {
      console.debug("[ContextTab] flyTo", {
        lat: geolocationCoordinates.latitude,
        lng: geolocationCoordinates.longitude,
        confidence,
        zoom,
        mapReady,
      });
    }
    lastAutoCenterKey.current = key;
    mapInstance.flyTo({
      center: [geolocationCoordinates.longitude, geolocationCoordinates.latitude],
      zoom,
      essential: true,
      duration: 1200,
    });
  }, [
    geolocationCoordinates,
    geolocationEnabled,
    geolocationAvailable,
    geolocationConfidence,
    geolocationAnalysis?.confidenceScore,
    mapReady,
  ]);

  useEffect(() => {
    if (!locationLayerRecommendation) {
      return;
    }
    if (lastAppliedRecommendationId.current === locationLayerRecommendation.id) {
      return;
    }
    lastAppliedRecommendationId.current = locationLayerRecommendation.id;
    const ids = (locationLayerRecommendation.recommendedLayerIds ?? []).filter(
      (id) => Boolean(id && MAP_LAYER_LOOKUP[id] && !AUTO_ENABLED_LAYER_EXCLUSIONS.has(id)),
    );
    if (ids.length === 0) {
      return;
    }
    setLayerVisibility((prev) => {
      const next = { ...prev };
      ids.forEach((id) => {
        next[id] = true;
      });
      return next;
    });

    const firstLayer = MAP_LAYER_LOOKUP[ids[0]];
    const firstView = firstLayer?.viewTypes?.[0];
    if (firstView && firstLayer.viewTypes && !firstLayer.viewTypes.includes(selectedViewType)) {
      setSelectedViewType(firstView as ViewType);
    }
  }, [locationLayerRecommendation, selectedViewType]);

  useEffect(() => {
    DATA_LAYER_CONFIGS.forEach((config) => {
      const state = layerDataState[config.id];
      if (!state?.activeFeatureId) {
        return;
      }
      const isEnabled = layerVisibility[config.id] && config.viewTypes.includes(selectedViewType);
      if (!isEnabled) {
        setLayerActiveFeature(config.id, null);
      }
    });
  }, [layerDataState, layerVisibility, selectedViewType, setLayerActiveFeature]);

  useEffect(() => {
    if (!layerVisibility["dob-incidents"]) {
      setLayerActiveFeature("dob-incidents", null);
    }
    if (!layerVisibility["active-wildfires"]) {
      setLayerActiveFeature("active-wildfires", null);
    }
    if (!layerVisibility["border-entries"]) {
      setLayerActiveFeature("border-entries", null);
    }
    if (!layerVisibility["fire-danger"]) {
      setLayerActiveFeature("fire-danger", null);
    }
    if (!layerVisibility["perimeters"]) {
      setLayerActiveFeature("perimeters", null);
    }
    if (!layerVisibility["aerodromes"]) {
      setLayerActiveFeature("aerodromes", null);
    }
    if (!layerVisibility["railways"]) {
      setLayerActiveFeature("railways", null);
    }
    if (!layerVisibility["highways"]) {
      setLayerActiveFeature("highways", null);
    }
    if (!layerVisibility["active-hurricanes"]) {
      setLayerActiveFeature("active-hurricanes", null);
    }
    if (!layerVisibility["recent-hurricanes"]) {
      setLayerActiveFeature("recent-hurricanes", null);
    }
    if (!layerVisibility["hydrometric-stations"]) {
      setLayerActiveFeature("hydrometric-stations", null);
    }
    if (!layerVisibility["building-footprints"]) {
      setLayerActiveFeature("building-footprints", null);
    }
    if (!layerVisibility["property-boundaries"]) {
      setLayerActiveFeature("property-boundaries", null);
    }
    if (!layerVisibility["inuit-communities"]) {
      setLayerActiveFeature("inuit-communities", null);
    }
    if (!layerVisibility["indigenous-land-boundaries"]) {
      setLayerActiveFeature("indigenous-land-boundaries", null);
    }
    if (!layerVisibility["chc-response-zone"]) {
      setLayerActiveFeature("chc-response-zone", null);
    }
    if (!layerVisibility["environment-canada-weather-alerts"]) {
      setLayerActiveFeature("environment-canada-weather-alerts", null);
    }
    if (!layerVisibility["sources"]) {
      setLayerActiveFeature("sources", null);
    }
  }, [layerVisibility, setLayerActiveFeature]);

  useEffect(() => {
    return () => {
      Object.values(cameraRequestControllers.current).forEach((controller) => controller?.abort());
      Object.values(cameraObjectUrlsRef.current).forEach((url) => {
        if (url) {
          URL.revokeObjectURL(url);
        }
      });
      Object.values(cameraCooldownTimeoutsRef.current).forEach((timeoutId) => {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
      });
    };
  }, []);

  useEffect(() => {
    if (!showOttawaCameras) {
      setActiveCamera(null);
      setFullscreenCameraId(null);
    }
  }, [showOttawaCameras]);

  useEffect(() => {
    if (!activeCamera) {
      return;
    }
    const preview = cameraPreviewStatesRef.current[activeCamera.stateKey];
    if (preview?.isLoading || preview?.objectUrl) {
      return;
    }
    void requestCameraThumbnail(activeCamera);
  }, [activeCamera, requestCameraThumbnail]);

  const handleLocationFound = useCallback(
    (location: GeocodedLocation, options?: { zoom?: number }) => {
      const rawMap = mapRef.current;
      const mapInstance = rawMap?.getMap ? rawMap.getMap() : rawMap;
      if (!mapInstance) return;

      mapInstance.flyTo({
        center: [location.longitude, location.latitude],
        zoom: typeof options?.zoom === "number" ? options.zoom : 12,
        essential: true,
      });
    },
    [],
  );

  const handleMapClick = useCallback(
    (event: MapMouseEvent) => {
      const findFeature = (layerId: string) =>
        event.features?.find((feature) => feature.layer && feature.layer.id === layerId) as
        | ({ properties?: Record<string, unknown> } & Feature)
        | undefined;

      const fireDangerFeature = fireDangerLayerEnabled ? findFeature(FIRE_DANGER_FILL_LAYER_ID) : undefined;
      if (fireDangerFeature?.properties?.id) {
        setLayerActiveFeature("fire-danger", String(fireDangerFeature.properties.id));
        setLayerActiveFeature("perimeters", null);
        setLayerActiveFeature("railways", null);
        setLayerActiveFeature("highways", null);
        return;
      }
      const perimeterFeature = perimetersLayerEnabled ? findFeature(PERIMETERS_FILL_LAYER_ID) : undefined;
      if (perimeterFeature?.properties?.id) {
        setLayerActiveFeature("perimeters", String(perimeterFeature.properties.id));
        setLayerActiveFeature("fire-danger", null);
        setLayerActiveFeature("railways", null);
        setLayerActiveFeature("highways", null);
        return;
      }
      const railwayFeature = railwayLayerEnabled ? findFeature(RAILWAYS_LINE_LAYER_ID) : undefined;
      if (railwayFeature?.properties?.id) {
        setLayerActiveFeature("railways", String(railwayFeature.properties.id));
        setLayerActiveFeature("highways", null);
        return;
      }
      const highwayFeature = highwayLayerEnabled ? findFeature(HIGHWAYS_LINE_LAYER_ID) : undefined;
      if (highwayFeature?.properties?.id) {
        setLayerActiveFeature("highways", String(highwayFeature.properties.id));
        setLayerActiveFeature("railways", null);
        return;
      }
      const buildingFootprintFeature = buildingFootprintsEnabled ? findFeature(BUILDING_FOOTPRINT_FILL_LAYER_ID) : undefined;
      if (buildingFootprintFeature?.properties?.id) {
        setLayerActiveFeature("building-footprints", String(buildingFootprintFeature.properties.id));
        setLayerActiveFeature("property-boundaries", null);
        return;
      }
      const propertyBoundaryFeature = propertyBoundariesEnabled
        ? findFeature(PROPERTY_BOUNDARIES_FILL_LAYER_ID)
        : undefined;
      if (propertyBoundaryFeature?.properties?.id) {
        setLayerActiveFeature("property-boundaries", String(propertyBoundaryFeature.properties.id));
        setLayerActiveFeature("building-footprints", null);
        return;
      }
      const inuitFeature = inuitCommunitiesEnabled ? findFeature(INUIT_COMMUNITIES_LAYER_ID) : undefined;
      if (inuitFeature?.properties?.id) {
        setLayerActiveFeature("inuit-communities", String(inuitFeature.properties.id));
        setLayerActiveFeature("building-footprints", null);
        setLayerActiveFeature("property-boundaries", null);
        setLayerActiveFeature("census-2021-da", null);
        return;
      }
      const census2021Feature = census2021Enabled ? findFeature(CENSUS_2021_FILL_LAYER_ID) : undefined;
      if (census2021Feature?.properties?.id) {
        setLayerActiveFeature("census-2021-da", String(census2021Feature.properties.id));
        setLayerActiveFeature("building-footprints", null);
        setLayerActiveFeature("property-boundaries", null);
        setLayerActiveFeature("inuit-communities", null);
        return;
      }
      const indigenousBoundaryFeature = indigenousBoundariesEnabled
        ? findFeature(INDIGENOUS_BOUNDARIES_FILL_LAYER_ID)
        : undefined;
      if (indigenousBoundaryFeature?.properties?.id) {
        setLayerActiveFeature("indigenous-land-boundaries", String(indigenousBoundaryFeature.properties.id));
        setLayerActiveFeature("building-footprints", null);
        setLayerActiveFeature("property-boundaries", null);
        return;
      }
      let weatherAlertFeature: ({ properties?: Record<string, unknown> } & Feature) | undefined;
      if (weatherAlertsEnabled) {
        weatherAlertFeature =
          findFeature(WEATHER_ALERTS_FILL_LAYER_ID) ?? findFeature(WEATHER_ALERTS_OUTLINE_LAYER_ID);
      }
      if (weatherAlertFeature?.properties?.id) {
        setLayerActiveFeature("environment-canada-weather-alerts", String(weatherAlertFeature.properties.id));
        setLayerActiveFeature("building-footprints", null);
        setLayerActiveFeature("property-boundaries", null);
        return;
      }
      const chcFeature = chcResponseEnabled ? findFeature(CHC_RESPONSE_LAYER_ID) : undefined;
      if (chcFeature?.properties?.id) {
        setLayerActiveFeature("chc-response-zone", String(chcFeature.properties.id));
        setLayerActiveFeature("building-footprints", null);
        setLayerActiveFeature("property-boundaries", null);
        return;
      }
      if (fireDangerLayerState.activeFeatureId) {
        setLayerActiveFeature("fire-danger", null);
      }
      if (perimetersLayerState.activeFeatureId) {
        setLayerActiveFeature("perimeters", null);
      }
      if (railwayLayerState.activeFeatureId) {
        setLayerActiveFeature("railways", null);
      }
      if (highwayLayerState.activeFeatureId) {
        setLayerActiveFeature("highways", null);
      }
      if (buildingFootprintLayerState.activeFeatureId) {
        setLayerActiveFeature("building-footprints", null);
      }
      if (propertyBoundaryLayerState.activeFeatureId) {
        setLayerActiveFeature("property-boundaries", null);
      }
      if (indigenousBoundaryLayerState.activeFeatureId) {
        setLayerActiveFeature("indigenous-land-boundaries", null);
      }
      if (census2021LayerState.activeFeatureId) {
        setLayerActiveFeature("census-2021-da", null);
      }
      if (weatherAlertsLayerState.activeFeatureId) {
        setLayerActiveFeature("environment-canada-weather-alerts", null);
      }
      if (sourcesLayerState.activeFeatureId) {
        setLayerActiveFeature("sources", null);
      }
    },
    [
      fireDangerLayerEnabled,
      fireDangerLayerState.activeFeatureId,
      perimetersLayerEnabled,
      perimetersLayerState.activeFeatureId,
      railwayLayerEnabled,
      railwayLayerState.activeFeatureId,
      highwayLayerEnabled,
      highwayLayerState.activeFeatureId,
      buildingFootprintsEnabled,
      buildingFootprintLayerState.activeFeatureId,
      propertyBoundariesEnabled,
      propertyBoundaryLayerState.activeFeatureId,
      indigenousBoundariesEnabled,
      indigenousBoundaryLayerState.activeFeatureId,
      census2021Enabled,
      census2021LayerState.activeFeatureId,
      weatherAlertsEnabled,
      weatherAlertsLayerState.activeFeatureId,
      chcResponseEnabled,
      sourcesLayerState.activeFeatureId,
      setLayerActiveFeature,
    ],
  );

  const applyLightPreset = useCallback(() => {
    if (mapStyleUrl !== MAPBOX_STYLE_LIGHT_URL) {
      return;
    }
    const preset = isDarkMode ? "night" : "day";
    const rawMap = mapRef.current;
    const mapInstance = rawMap?.getMap ? rawMap.getMap() : rawMap;
    if (!mapInstance) {
      return;
    }
    try {
      mapInstance.setConfigProperty("basemap", "lightPreset", preset);
    } catch (error) {
      console.warn("Failed to set Mapbox light preset", error);
    }
  }, [isDarkMode, mapStyleUrl]);

  const setupResizeObserver = useCallback(() => {
    if (typeof window === "undefined") {
      return;
    }
    const container = mapContainerRef.current;
    if (!container) {
      return;
    }
    const rawMap = mapRef.current;
    const mapInstance = rawMap?.getMap ? rawMap.getMap() : rawMap;
    if (!mapInstance) {
      return;
    }

    resizeObserverRef.current?.disconnect();
    const observer = new ResizeObserver(() => {
      mapInstance.resize();
    });
    observer.observe(container);
    resizeObserverRef.current = observer;
  }, []);

  const handleMapLoad = useCallback(() => {
    applyLightPreset();
    setupResizeObserver();
    lastAppliedMapStyleRef.current = mapStyleUrl;
    setMapReady(true);
  }, [applyLightPreset, setupResizeObserver, mapStyleUrl]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!mapReady) {
      return;
    }
    const rawMap = mapRef.current;
    const mapInstance = rawMap?.getMap ? rawMap.getMap() : rawMap;
    if (!mapInstance) {
      return;
    }
    if (lastAppliedMapStyleRef.current === mapStyleUrl) {
      return;
    }
    try {
      mapInstance.setStyle(mapStyleUrl);
      lastAppliedMapStyleRef.current = mapStyleUrl;
    } catch (error) {
      console.warn("Failed to update map style", error);
    }
  }, [mapReady, mapStyleUrl]);

  useEffect(() => {
    if (!resizeTrigger) {
      return;
    }
    const rawMap = mapRef.current;
    const mapInstance = rawMap?.getMap ? rawMap.getMap() : rawMap;
    if (!mapInstance) {
      return;
    }
    mapInstance.resize();
  }, [resizeTrigger]);

  useEffect(() => {
    const rawMap = mapRef.current;
    const mapInstance = rawMap?.getMap ? rawMap.getMap() : rawMap;
    if (!mapInstance) {
      return;
    }

    if (mapInstance.isStyleLoaded()) {
      applyLightPreset();
      return;
    }

    const handleStyleData = () => {
      applyLightPreset();
      mapInstance.off("styledata", handleStyleData);
    };

    mapInstance.on("styledata", handleStyleData);

    return () => {
      mapInstance.off("styledata", handleStyleData);
    };
  }, [applyLightPreset]);

  const handleContextQuery = useCallback(() => {
    const latitude = Number(contextQueryLat);
    const longitude = Number(contextQueryLng);
    const radiusKm = Number(contextQueryRadiusKm);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setContextQueryError("Enter valid latitude and longitude.");
      return;
    }
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
      setContextQueryError("Enter a radius in kilometers greater than 0.");
      return;
    }

    setContextQueryLoading(true);
    setContextQueryError(null);
    const hits: SurroundingContextHit[] = [];
    DATA_LAYER_CONFIGS.forEach((layer) => {
      const state = layerDataState[layer.id];
      if (!state || state.loading || state.error) {
        return;
      }
      state.data.forEach((feature) => {
        const coordinates = getFeatureCoordinates(layer.id, feature);
        if (!coordinates) {
          return;
        }
        const distanceKm = haversineDistanceKm({ latitude, longitude }, coordinates);
        if (distanceKm <= radiusKm) {
          hits.push({
            layerId: layer.id,
            layerLabel: layer.label,
            featureId: getFeatureId(feature),
            distanceKm,
            coordinates,
            summary: buildFeatureSummary(layer.id, feature),
            feature,
          });
        }
      });
    });

    hits.sort((a, b) => a.distanceKm - b.distanceKm);
    setContextQueryResults(hits.slice(0, 100));
    if (hits.length === 0) {
      setContextQueryError("No features within that radius yet.");
    }
    setContextQueryLoading(false);
  }, [contextQueryLat, contextQueryLng, contextQueryRadiusKm, layerDataState]);

  useEffect(() => {
    if (!geolocationCoordinates) {
      return;
    }
    const mapInstance = mapRef.current?.getMap ? mapRef.current.getMap() : mapRef.current;
    if (!mapInstance) {
      return;
    }
    const key = `${geolocationCoordinates.latitude.toFixed(5)},${geolocationCoordinates.longitude.toFixed(5)}`;
    if (lastAutoCenterKey.current === key) {
      return;
    }
    lastAutoCenterKey.current = key;
    const zoom = computeZoomFromConfidence(geolocationAnalysis?.confidenceScore);
    mapInstance.flyTo({
      center: [geolocationCoordinates.longitude, geolocationCoordinates.latitude],
      zoom,
      essential: true,
    });
  }, [geolocationAnalysis?.confidenceScore, geolocationCoordinates]);

  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left -mb-4">
          <CardTitle className="text-sm">Geolocation & Context</CardTitle>
          <CardDescription className="text-xs text-tertiary">{cardDescriptionText}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 pt-4">
        <GeolocationCard
          analysis={geolocationAnalysis}
          isLoading={Boolean(geolocationLoading)}
          error={geolocationError}
          wasRequested={Boolean(geolocationRequested)}
          isEnabled={Boolean(geolocationEnabled)}
          isAvailable={Boolean(geolocationAvailable)}
          coordinates={geolocationCoordinates}
          coordinatesLoading={Boolean(geolocationCoordinatesLoading)}
          coordinatesError={geolocationCoordinatesError}
          onLocationClick={(coords) =>
            handleLocationFound(coords, {
              zoom: computeZoomFromConfidence(
                typeof geolocationConfidence === "number"
                  ? geolocationConfidence
                  : geolocationAnalysis?.confidenceScore,
              ),
            })
          }
        />

        {geolocationEnabled && geolocationAvailable ? (
          locationLayerRecommendationLoading ? (
            <div className="rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-sm text-tertiary">
              Location analysis is selecting relevant map layers…
            </div>
          ) : locationLayerRecommendationError ? (
            <div className="rounded-lg border border-utility-error-200/60 bg-utility-error-50 px-3 py-2 text-sm text-utility-error-700">
              Could not auto-enable layers: {locationLayerRecommendationError}
            </div>
          ) : locationLayerRecommendation ? (
            <div className="rounded-lg border border-secondary/30 bg-secondary/10 px-3 py-2 text-sm text-secondary">
              Location analysis suggests enabling:{" "}
              {recommendedLayerLabels.length > 0 ? recommendedLayerLabels.join(", ") : "No layers recommended."}
              {locationLayerRecommendation.reason ? (
                <span className="block text-xs text-tertiary">Why: {locationLayerRecommendation.reason}</span>
              ) : null}
            </div>
          ) : null
        ) : null}

        <section className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-secondary/30 bg-primary shadow-sm">
            <div ref={mapContainerRef} className="relative h-[28rem] w-full">
              {(dobLayerEnabled && (dobLayerState.loading || dobLayerState.error)) ||
                (wildfireLayerEnabled && (wildfireLayerState.loading || wildfireLayerState.error)) ||
                (borderEntriesEnabled && (borderEntryLayerState.loading || borderEntryLayerState.error)) ||
                (perimetersLayerEnabled && (perimetersLayerState.loading || perimetersLayerState.error)) ||
                (aerodromeLayerEnabled && (aerodromeLayerState.loading || aerodromeLayerState.error)) ||
                (railwayLayerEnabled && (railwayLayerState.loading || railwayLayerState.error)) ||
                (highwayLayerEnabled && (highwayLayerState.loading || highwayLayerState.error)) ? (
                <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-col gap-2">
                  {dobLayerEnabled && (dobLayerState.loading || dobLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {dobLayerState.loading ? "Loading DOB incidents…" : dobLayerState.error}
                    </div>
                  )}
                  {wildfireLayerEnabled && (wildfireLayerState.loading || wildfireLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {wildfireLayerState.loading ? "Loading active wildfires…" : wildfireLayerState.error}
                    </div>
                  )}
                  {borderEntriesEnabled && (borderEntryLayerState.loading || borderEntryLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {borderEntryLayerState.loading ? "Loading border entries…" : borderEntryLayerState.error}
                    </div>
                  )}
                  {perimetersLayerEnabled && (perimetersLayerState.loading || perimetersLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {perimetersLayerState.loading ? "Loading fire perimeters…" : perimetersLayerState.error}
                    </div>
                  )}
                  {aerodromeLayerEnabled && (aerodromeLayerState.loading || aerodromeLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {aerodromeLayerState.loading ? "Loading aerodromes…" : aerodromeLayerState.error}
                    </div>
                  )}
                  {railwayLayerEnabled && (railwayLayerState.loading || railwayLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {railwayLayerState.loading ? "Loading railways…" : railwayLayerState.error}
                    </div>
                  )}
                  {highwayLayerEnabled && (highwayLayerState.loading || highwayLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {highwayLayerState.loading ? "Loading highways…" : highwayLayerState.error}
                    </div>
                  )}
                </div>
              ) : null}
              <Map
                ref={mapRef}
                mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
                initialViewState={MAP_INITIAL_VIEW_STATE}
                mapStyle={mapStyleUrl}
                onLoad={(e) => {
                  // Set initial bounds
                  const bounds = e.target.getBounds();
                  if (bounds) {
                    setCurrentBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
                  }
                  handleMapLoad();
                }}
                onMoveEnd={handleMoveEnd}
                onMove={(event) => {
                  setMapZoom(event.viewState.zoom);
                }}
                onClick={handleMapClick}
                reuseMaps
                attributionControl={false}
                interactiveLayerIds={[
                  ...fireDangerInteractiveLayerIds,
                  ...perimetersInteractiveLayerIds,
                  ...railwayInteractiveLayerIds,
                  ...highwayInteractiveLayerIds,
                  ...buildingFootprintInteractiveLayerIds,
                  ...propertyBoundaryInteractiveLayerIds,
                  ...indigenousBoundaryInteractiveLayerIds,
                  ...census2021InteractiveLayerIds,
                  ...weatherAlertsInteractiveLayerIds,
                  ...chcResponseInteractiveLayerIds,
                  INUIT_COMMUNITIES_LAYER_ID,
                ]}
                style={{ width: "100%", height: "100%" }}
              >
                {fireDangerLayerEnabled && fireDangerGeoJson.features.length > 0 && (
                  <Source id={FIRE_DANGER_SOURCE_ID} type="geojson" data={fireDangerGeoJson}>
                    <Layer
                      id={FIRE_DANGER_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": ["coalesce", ["get", "fillColor"], FIRE_DANGER_LEVEL_METADATA.unknown.colorHex],
                        "fill-emissive-strength": fireDangerOpacity.emissive,
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activeFireDangerArea?.id ?? ""],
                          fireDangerOpacity.active,
                          fireDangerOpacity.default,
                        ],
                      }}
                    />
                    <Layer
                      id={FIRE_DANGER_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": ["coalesce", ["get", "outlineColor"], FIRE_DANGER_LEVEL_METADATA.unknown.hoverColorHex],
                        "line-emissive-strength": fireDangerOpacity.outlineEmissive,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeFireDangerArea?.id ?? ""],
                          2,
                          0.9,
                        ],
                      }}
                    />
                  </Source>
                )}

                {perimetersLayerEnabled && perimetersGeoJson.features.length > 0 && (
                  <Source id={PERIMETERS_SOURCE_ID} type="geojson" data={perimetersGeoJson}>
                    <Layer
                      id={PERIMETERS_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": perimeterPaint.fillColor,
                        "fill-emissive-strength": perimeterPaint.fillEmissive,
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activePerimeter?.id ?? ""],
                          perimeterPaint.activeOpacity,
                          perimeterPaint.defaultOpacity,
                        ],
                      }}
                    />
                    <Layer
                      id={PERIMETERS_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": perimeterPaint.outlineColor,
                        "line-emissive-strength": perimeterPaint.outlineEmissive,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activePerimeter?.id ?? ""],
                          perimeterPaint.activeWidth,
                          perimeterPaint.defaultWidth,
                        ],
                      }}
                    />
                  </Source>
                )}

                {hurricaneLayerEnabled && hurricaneWindGeoJson.features.length > 0 && (
                  <Source id={HURRICANE_WIND_SOURCE_ID} type="geojson" data={hurricaneWindGeoJson}>
                    <Layer
                      id={HURRICANE_WIND_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": hurricaneWindPaint.color,
                        "fill-opacity": 1,
                        "fill-emissive-strength": hurricaneWindPaint.emissive,
                      }}
                    />
                  </Source>
                )}

                {hurricaneLayerEnabled && hurricaneErrorGeoJson.features.length > 0 && (
                  <Source id={HURRICANE_ERROR_SOURCE_ID} type="geojson" data={hurricaneErrorGeoJson}>
                    <Layer
                      id={HURRICANE_ERROR_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": hurricaneErrorPaint.color,
                        "fill-opacity": 1,
                        "fill-emissive-strength": hurricaneErrorPaint.emissive,
                      }}
                    />
                  </Source>
                )}

                {hurricaneLayerEnabled && hurricaneTrackGeoJson.features.length > 0 && (
                  <Source id={HURRICANE_TRACK_SOURCE_ID} type="geojson" data={hurricaneTrackGeoJson}>
                    <Layer
                      id={HURRICANE_TRACK_LAYER_ID}
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": hurricaneTrackPaint.color,
                        "line-width": hurricaneTrackPaint.width,
                        "line-emissive-strength": hurricaneTrackPaint.emissive,
                        "line-opacity": 0.9,
                      }}
                    />
                  </Source>
                )}

                {railwayLayerEnabled && railwayGeoJson.features.length > 0 && (
                  <Source id={RAILWAYS_SOURCE_ID} type="geojson" data={railwayGeoJson}>
                    <Layer
                      id={RAILWAYS_LINE_LAYER_ID}
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": [
                          "case",
                          ["==", ["get", "id"], activeRailway?.id ?? ""],
                          railwayPaint.activeColor,
                          railwayPaint.color,
                        ],
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeRailway?.id ?? ""],
                          railwayPaint.activeWidth,
                          railwayPaint.defaultWidth,
                        ],
                        "line-emissive-strength": railwayPaint.emissive,
                        "line-opacity": 0.9,
                      }}
                    />
                  </Source>
                )}

                {highwayLayerEnabled && highwayGeoJson.features.length > 0 && (
                  <Source id={HIGHWAYS_SOURCE_ID} type="geojson" data={highwayGeoJson}>
                    <Layer
                      id={HIGHWAYS_LINE_LAYER_ID}
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": [
                          "case",
                          ["==", ["get", "id"], activeHighway?.id ?? ""],
                          highwayPaint.activeColor,
                          highwayPaint.color,
                        ],
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeHighway?.id ?? ""],
                          highwayPaint.activeWidth,
                          highwayPaint.defaultWidth,
                        ],
                        "line-emissive-strength": highwayPaint.emissive,
                        "line-opacity": 0.9,
                      }}
                    />
                  </Source>
                )}

                {buildingFootprintsEnabled && buildingFootprintGeoJson.features.length > 0 && (
                  <Source id={BUILDING_FOOTPRINT_SOURCE_ID} type="geojson" data={buildingFootprintGeoJson}>
                    <Layer
                      id={BUILDING_FOOTPRINT_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": buildingFootprintPaint.fillColor,
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activeBuildingFootprint?.id ?? ""],
                          Math.min(0.85, buildingFootprintPaint.fillOpacity + 0.15),
                          buildingFootprintPaint.fillOpacity,
                        ],
                        "fill-emissive-strength": buildingFootprintPaint.fillEmissive,
                      }}
                    />
                    <Layer
                      id={BUILDING_FOOTPRINT_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": buildingFootprintPaint.outlineColor,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeBuildingFootprint?.id ?? ""],
                          buildingFootprintPaint.outlineWidth + 0.4,
                          buildingFootprintPaint.outlineWidth,
                        ],
                        "line-opacity": 0.9,
                        "line-emissive-strength": buildingFootprintPaint.outlineEmissive,
                      }}
                    />
                  </Source>
                )}

                {propertyBoundariesEnabled && propertyBoundaryGeoJson.features.length > 0 && (
                  <Source id={PROPERTY_BOUNDARIES_SOURCE_ID} type="geojson" data={propertyBoundaryGeoJson}>
                    <Layer
                      id={PROPERTY_BOUNDARIES_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": propertyBoundaryPaint.fillColor,
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activePropertyBoundary?.id ?? ""],
                          Math.min(0.85, propertyBoundaryPaint.fillOpacity + 0.15),
                          propertyBoundaryPaint.fillOpacity,
                        ],
                        "fill-emissive-strength": propertyBoundaryPaint.fillEmissive,
                      }}
                    />
                    <Layer
                      id={PROPERTY_BOUNDARIES_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": propertyBoundaryPaint.outlineColor,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activePropertyBoundary?.id ?? ""],
                          propertyBoundaryPaint.outlineWidth + 0.4,
                          propertyBoundaryPaint.outlineWidth,
                        ],
                        "line-opacity": 0.9,
                        "line-emissive-strength": propertyBoundaryPaint.outlineEmissive,
                      }}
                    />
                  </Source>
                )}

                {census2021Enabled && census2021GeoJson.features.length > 0 && (
                  <Source id={CENSUS_2021_SOURCE_ID} type="geojson" data={census2021GeoJson}>
                    <Layer
                      id={CENSUS_2021_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": census2021Paint.fillColor,
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activeCensus2021?.id ?? ""],
                          Math.min(0.85, census2021Paint.fillOpacity + 0.15),
                          census2021Paint.fillOpacity,
                        ],
                        "fill-emissive-strength": census2021Paint.fillEmissive,
                      }}
                    />
                    <Layer
                      id={CENSUS_2021_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": census2021Paint.outlineColor,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeCensus2021?.id ?? ""],
                          census2021Paint.outlineWidth + 0.4,
                          census2021Paint.outlineWidth,
                        ],
                        "line-opacity": 0.9,
                        "line-emissive-strength": census2021Paint.outlineEmissive,
                      }}
                    />
                  </Source>
                )}


                {indigenousBoundariesEnabled && indigenousBoundaryGeoJson.features.length > 0 && (
                  <Source id={INDIGENOUS_BOUNDARIES_SOURCE_ID} type="geojson" data={indigenousBoundaryGeoJson}>
                    <Layer
                      id={INDIGENOUS_BOUNDARIES_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": indigenousBoundaryPaint.fillColor,
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activeIndigenousBoundary?.id ?? ""],
                          Math.min(0.85, indigenousBoundaryPaint.fillOpacity + 0.15),
                          indigenousBoundaryPaint.fillOpacity,
                        ],
                        "fill-emissive-strength": indigenousBoundaryPaint.fillEmissive,
                      }}
                    />
                    <Layer
                      id={INDIGENOUS_BOUNDARIES_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": indigenousBoundaryPaint.outlineColor,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeIndigenousBoundary?.id ?? ""],
                          indigenousBoundaryPaint.outlineWidth + 0.4,
                          indigenousBoundaryPaint.outlineWidth,
                        ],
                        "line-opacity": 0.95,
                        "line-emissive-strength": indigenousBoundaryPaint.outlineEmissive,
                      }}
                    />
                  </Source>
                )}

                {weatherAlertsEnabled && weatherAlertsGeoJson.features.length > 0 && (
                  <Source id={WEATHER_ALERTS_SOURCE_ID} type="geojson" data={weatherAlertsGeoJson}>
                    <Layer
                      id={WEATHER_ALERTS_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": ["coalesce", ["get", "fillColor"], WEATHER_ALERT_TYPE_STYLES.default.fill],
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activeWeatherAlert?.id ?? ""],
                          weatherAlertPaint.activeFillOpacity,
                          weatherAlertPaint.defaultFillOpacity,
                        ],
                        "fill-emissive-strength": weatherAlertPaint.fillEmissive,
                      }}
                    />
                    <Layer
                      id={WEATHER_ALERTS_OUTLINE_LAYER_ID}
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": ["coalesce", ["get", "outlineColor"], WEATHER_ALERT_TYPE_STYLES.default.outline],
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeWeatherAlert?.id ?? ""],
                          weatherAlertPaint.activeOutlineWidth,
                          weatherAlertPaint.outlineWidth,
                        ],
                        "line-opacity": 0.95,
                        "line-emissive-strength": weatherAlertPaint.outlineEmissive,
                      }}
                    />
                  </Source>
                )}

                {chcResponseEnabled && chcResponseGeoJson.features.length > 0 && (
                  <Source id={CHC_RESPONSE_SOURCE_ID} type="geojson" data={chcResponseGeoJson}>
                    <Layer
                      id={CHC_RESPONSE_LAYER_ID}
                      type="line"
                      layout={{ "line-cap": "butt", "line-join": "round" }}
                      paint={{
                        "line-color": CHC_RESPONSE_PAINT.color,
                        "line-width": CHC_RESPONSE_PAINT.width,
                        "line-opacity": 0.95,
                        "line-dasharray": CHC_RESPONSE_PAINT.dashArray,
                        "line-emissive-strength": CHC_RESPONSE_PAINT.emissive,
                      }}
                    />
                  </Source>
                )}

                {aerodromeLayerEnabled &&
                  visibleAerodromes.map((aerodrome) => (
                    <Marker
                      key={`aerodrome-${aerodrome.id}`}
                      longitude={aerodrome.longitude}
                      latitude={aerodrome.latitude}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("aerodromes", aerodrome.id);
                      }}
                    >
                      <button
                        type="button"
                        className={aerodromeMarkerButtonClass}
                        aria-label={`View aerodrome ${aerodrome.name ?? aerodrome.icao ?? aerodrome.id}`}
                      >
                        <Plane className={`${AERODROME_ICON_CLASS} drop-shadow`} />
                      </button>
                    </Marker>
                  ))}

                {hurricaneLayerEnabled &&
                  visibleHurricaneCenters.map((center) => {
                    const [longitude, latitude] = center.geometry.coordinates as [number, number];
                    return (
                      <Marker
                        key={`hurricane-center-${center.id}`}
                        longitude={longitude}
                        latitude={latitude}
                        anchor="bottom"
                        onClick={(event) => {
                          event.originalEvent.stopPropagation();
                          setActiveCamera(null);
                          setLayerActiveFeature("active-hurricanes", center.id);
                        }}
                      >
                        <button
                          type="button"
                          className={HURRICANE_CENTER_MARKER_CLASS}
                          aria-label={`View hurricane ${center.stormName ?? center.id}`}
                        >
                          <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                        </button>
                      </Marker>
                    );
                  })}

                {recentHurricanesEnabled &&
                  visibleRecentHurricanes.map((storm) => (
                    <Marker
                      key={`recent-hurricane-${storm.id}`}
                      longitude={storm.longitude}
                      latitude={storm.latitude}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("recent-hurricanes", storm.id);
                      }}
                    >
                      <button
                        type="button"
                        className={RECENT_HURRICANE_MARKER_CLASS}
                        aria-label={`View ${storm.stormName ?? "storm"} advisory`}
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

                {inuitCommunitiesEnabled && visibleInuitCommunities.length > 0 && (
                  <Source id={INUIT_COMMUNITIES_SOURCE_ID} type="geojson" data={{ type: "FeatureCollection", features: visibleInuitCommunities }}>
                    <Layer
                      id={INUIT_COMMUNITIES_LAYER_ID}
                      type="circle"
                      paint={{
                        "circle-color": inuitCommunitiesPaint.circleColor,
                        "circle-radius": [
                          "case",
                          ["==", ["get", "id"], activeInuitCommunity?.id ?? ""],
                          inuitCommunitiesPaint.circleActiveRadius,
                          inuitCommunitiesPaint.circleRadius,
                        ],
                        "circle-stroke-width": inuitCommunitiesPaint.circleStrokeWidth,
                        "circle-stroke-color": inuitCommunitiesPaint.circleStrokeColor,
                        "circle-emissive-strength": inuitCommunitiesPaint.circleEmissive,
                      }}
                    />
                  </Source>
                )}
                {activeInuitCommunity && activeInuitCommunitySummary && (
                  <Popup
                    longitude={activeInuitCommunity.longitude!}
                    latitude={activeInuitCommunity.latitude!}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("inuit-communities", null)}
                    closeButton={false}
                    maxWidth="300px"
                    className="z-20"
                  >
                    <PopupCard
                      title={activeInuitCommunity.name ?? activeInuitCommunity.id}
                      subtitle={activeInuitCommunity.region ?? "Inuit Community"}
                      onClose={() => setLayerActiveFeature("inuit-communities", null)}
                      accentColor={inuitCommunitiesPaint.circleColor}
                    >
                      {activeInuitCommunitySummary}
                    </PopupCard>
                  </Popup>
                )}


                {hydrometricLayerEnabled &&
                  visibleHydrometricStations.map((station) => (
                    <Marker
                      key={`hydrometric-${station.id}`}
                      longitude={station.longitude}
                      latitude={station.latitude}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("hydrometric-stations", station.id);
                      }}
                    >
                      <button
                        type="button"
                        className={HYDROMETRIC_MARKER_CLASS}
                        aria-label={`View hydrometric station ${station.stationName ?? station.stationNumber ?? station.id}`}
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

                {sourcesLayerEnabled &&
                  visibleSources.map((source) => (
                    <Marker
                      key={`source-${source.id}`}
                      longitude={source.longitude}
                      latitude={source.latitude}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setActiveCamera(null);
                        setLayerActiveFeature("dob-incidents", null);
                        setLayerActiveFeature("active-wildfires", null);
                        setLayerActiveFeature("sources", source.id);
                      }}
                    >
                      <button
                        type="button"
                        className={SOURCES_MARKER_CLASS}
                        aria-label={`View source ${source.sourceName ?? source.globalId ?? source.id}`}
                        title={source.sourceName ?? source.globalId ?? undefined}
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

                {visibleOttawaCameras.map((camera) => (
                  <Marker
                    key={`camera-${camera.id}`}
                    longitude={camera.longitude}
                    latitude={camera.latitude}
                    anchor="bottom"
                    onClick={(event) => {
                      event.originalEvent.stopPropagation();
                      setLayerActiveFeature("dob-incidents", null);
                      setLayerActiveFeature("active-wildfires", null);
                      setActiveCamera(camera);
                    }}
                  >
                    <button
                      type="button"
                      className={CAMERA_MARKER_BUTTON_CLASS}
                      aria-label={`View camera ${camera.number}`}
                      title={camera.description}
                    >
                      <span className={CAMERA_MARKER_DOT_CLASS} />
                    </button>
                  </Marker>
                ))}

                {showOttawaCameras && mapZoom >= CAMERA_MARKER_MIN_ZOOM && activeCamera && (
                  <Popup
                    longitude={activeCamera.longitude}
                    latitude={activeCamera.latitude}
                    anchor="bottom"
                    onClose={() => setActiveCamera(null)}
                    closeButton
                    focusAfterOpen={false}
                  >
                    <div className="max-w-[18rem] space-y-2 text-sm">
                      <div>
                        <p className="font-semibold leading-tight">{activeCamera.description}</p>
                        <p className="text-xs text-tertiary">Camera #{activeCamera.number}</p>
                      </div>
                      <div className="overflow-hidden rounded-lg border border-secondary/30 bg-primary">
                        <div className="relative h-36 w-64 max-w-full">
                          {activeCameraPreview?.objectUrl ? (
                            <img
                              src={activeCameraPreview.objectUrl}
                              alt={`Live traffic camera ${activeCamera.description}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-secondary/10 px-4 text-center text-xs text-tertiary">
                              {activeCameraPreview?.isLoading
                                ? "Loading the latest still…"
                                : "Use the refresh icon to request a live snapshot."}
                            </div>
                          )}
                          <div className="absolute left-2 top-2 flex gap-1">
                            <button
                              type="button"
                              aria-label="Refresh camera still"
                              title="Refresh still"
                              disabled={activeCameraRefreshDisabled}
                              className="rounded-full bg-black/70 p-1.5 text-white shadow-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => {
                                if (!activeCamera) {
                                  return;
                                }
                                void requestCameraThumbnail(activeCamera);
                              }}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="absolute right-2 top-2 flex gap-1">
                            <button
                              type="button"
                              aria-label="Open fullscreen still"
                              title="Open fullscreen still"
                              disabled={!activeCameraPreview?.objectUrl}
                              className="rounded-full bg-black/70 p-1.5 text-white shadow-md transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40"
                              onClick={() => {
                                if (!activeCamera) {
                                  return;
                                }
                                setFullscreenCameraId(activeCamera.stateKey);
                              }}
                            >
                              <Maximize2 className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        <div className="border-t border-secondary/20 px-3 py-1 text-[0.65rem] text-tertiary">
                          {activeCameraPreview?.fetchedAt
                            ? `Last updated ${new Date(activeCameraPreview.fetchedAt).toLocaleTimeString()}`
                            : "Loading the latest still..."}
                        </div>
                      </div>
                      {activeCameraPreview?.error && <p className="text-xs text-utility-error-500">{activeCameraPreview.error}</p>}
                    </div>
                  </Popup>
                )}

                {sourcesLayerEnabled && activeSource && (
                  <Popup
                    longitude={activeSource.longitude}
                    latitude={activeSource.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("sources", null)}
                    closeButton
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={buildSourceTitle(activeSource)}
                      subtitle={buildSourceSubtitle(activeSource)}
                      onClose={() => setLayerActiveFeature("sources", null)}
                      accentColor="#a855f7"
                    >
                      {sourcePopupDetails?.reportingPreview ? (
                        <p>
                          <span className="font-semibold text-secondary">Criteria:</span>{" "}
                          {sourcePopupDetails.reportingPreview}
                        </p>
                      ) : null}
                      {activeSource.reportingCriteriaOther ? (
                        <p>
                          <span className="font-semibold text-secondary">Other criteria:</span>{" "}
                          {activeSource.reportingCriteriaOther}
                        </p>
                      ) : null}
                      {sourcePopupDetails?.tagsPreview ? (
                        <p>
                          <span className="font-semibold text-secondary">Tags:</span>{" "}
                          {sourcePopupDetails.tagsPreview}
                        </p>
                      ) : null}
                      {activeSource.tagOther ? (
                        <p>
                          <span className="font-semibold text-secondary">Additional tags:</span>{" "}
                          {activeSource.tagOther}
                        </p>
                      ) : null}
                      {activeSource.exceptionalSource ? (
                        <p>
                          <span className="font-semibold text-secondary">Exceptional:</span>{" "}
                          {activeSource.exceptionalSource}
                        </p>
                      ) : null}
                      {activeSource.comments ? <p>{activeSource.comments}</p> : null}
                      {activeSource.linkToSource ? (
                        <a
                          className="font-semibold text-utility-blue-600 underline"
                          href={activeSource.linkToSource}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open source link
                        </a>
                      ) : null}
                      {activeSource.creator ? (
                        <p>
                          <span className="font-semibold text-secondary">Creator:</span>{" "}
                          {activeSource.creator}
                        </p>
                      ) : null}
                      {sourcePopupDetails?.createdAt ? (
                        <p>
                          <span className="font-semibold text-secondary">Created:</span>{" "}
                          {sourcePopupDetails.createdAt}
                        </p>
                      ) : null}
                      {activeSource.editor ? (
                        <p>
                          <span className="font-semibold text-secondary">Editor:</span>{" "}
                          {activeSource.editor}
                        </p>
                      ) : null}
                      {sourcePopupDetails?.editedAt ? (
                        <p>
                          <span className="font-semibold text-secondary">Updated:</span>{" "}
                          {sourcePopupDetails.editedAt}
                        </p>
                      ) : null}
                    </PopupCard>
                  </Popup>
                )}

                {buildingFootprintsEnabled && activeBuildingFootprint && activeBuildingFootprint.centroid && (
                  <Popup
                    longitude={activeBuildingFootprint.centroid.longitude}
                    latitude={activeBuildingFootprint.centroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("building-footprints", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeBuildingFootprint.nameEn ?? activeBuildingFootprint.nameFr ?? "Building footprint"}
                      subtitle={activeBuildingFootprintSummary}
                      onClose={() => setLayerActiveFeature("building-footprints", null)}
                      accentColor={buildingFootprintPaint.outlineColor}
                    >
                      {activeBuildingFootprint.addressEn || activeBuildingFootprint.addressFr ? (
                        <p className="text-secondary">
                          Address: {activeBuildingFootprint.addressEn ?? activeBuildingFootprint.addressFr}
                        </p>
                      ) : null}
                      {activeBuildingFootprint.custodianEn || activeBuildingFootprint.custodianFr ? (
                        <p className="text-secondary">
                          Custodian: {activeBuildingFootprint.custodianEn ?? activeBuildingFootprint.custodianFr}
                        </p>
                      ) : null}
                      {formatSquareMeters(activeBuildingFootprint.floorAreaSqm) && (
                        <p className="text-secondary">
                          Floor area: {formatSquareMeters(activeBuildingFootprint.floorAreaSqm)}
                        </p>
                      )}
                      {activeBuildingFootprint.constructionYear ? (
                        <p className="text-tertiary">Built: {activeBuildingFootprint.constructionYear}</p>
                      ) : null}
                      {activeBuildingFootprint.conditionEn || activeBuildingFootprint.conditionFr ? (
                        <p className="text-tertiary">
                          Condition: {activeBuildingFootprint.conditionEn ?? activeBuildingFootprint.conditionFr}
                        </p>
                      ) : null}
                      {activeBuildingFootprint.useEn || activeBuildingFootprint.useFr ? (
                        <p className="text-tertiary">
                          Use: {activeBuildingFootprint.useEn ?? activeBuildingFootprint.useFr}
                        </p>
                      ) : null}
                      {activeBuildingFootprint.structureLinkEn && (
                        <a
                          className="font-semibold text-utility-blue-600 underline"
                          href={activeBuildingFootprint.structureLinkEn}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View DFRP entry
                        </a>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {propertyBoundariesEnabled && activePropertyBoundary && activePropertyBoundary.centroid && (
                  <Popup
                    longitude={activePropertyBoundary.centroid.longitude}
                    latitude={activePropertyBoundary.centroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("property-boundaries", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activePropertyBoundary.nameEn ?? activePropertyBoundary.nameFr ?? "Property boundary"}
                      subtitle={activePropertyBoundarySummary}
                      onClose={() => setLayerActiveFeature("property-boundaries", null)}
                      accentColor={propertyBoundaryPaint.outlineColor}
                    >
                      {activePropertyBoundary.addressEn || activePropertyBoundary.addressFr ? (
                        <p className="text-secondary">
                          Address: {activePropertyBoundary.addressEn ?? activePropertyBoundary.addressFr}
                        </p>
                      ) : null}
                      {activePropertyBoundary.custodianEn || activePropertyBoundary.custodianFr ? (
                        <p className="text-secondary">
                          Custodian: {activePropertyBoundary.custodianEn ?? activePropertyBoundary.custodianFr}
                        </p>
                      ) : null}
                      {formatHectaresLabel(activePropertyBoundary.landAreaHa) && (
                        <p className="text-secondary">
                          Land area: {formatHectaresLabel(activePropertyBoundary.landAreaHa)}
                        </p>
                      )}
                      {formatSquareMeters(activePropertyBoundary.floorAreaSqm) && (
                        <p className="text-tertiary">
                          Floor area: {formatSquareMeters(activePropertyBoundary.floorAreaSqm)}
                        </p>
                      )}
                      {typeof activePropertyBoundary.buildingCount === "number" && (
                        <p className="text-tertiary">Buildings: {formatCount(activePropertyBoundary.buildingCount)}</p>
                      )}
                      {activePropertyBoundary.primaryUseEn || activePropertyBoundary.primaryUseFr ? (
                        <p className="text-tertiary">
                          Primary use: {activePropertyBoundary.primaryUseEn ?? activePropertyBoundary.primaryUseFr}
                        </p>
                      ) : null}
                      {activePropertyBoundary.propertyLinkEn && (
                        <a
                          className="font-semibold text-utility-blue-600 underline"
                          href={activePropertyBoundary.propertyLinkEn}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View DFRP property
                        </a>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {indigenousBoundariesEnabled && activeIndigenousBoundary && activeIndigenousBoundary.centroid && (
                  <Popup
                    longitude={activeIndigenousBoundary.centroid.longitude}
                    latitude={activeIndigenousBoundary.centroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("indigenous-land-boundaries", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={
                        activeIndigenousBoundary.names.find((entry) => entry.name)?.name ??
                        activeIndigenousBoundary.alCode ??
                        "Indigenous land boundary"
                      }
                      subtitle={activeIndigenousBoundarySummary}
                      onClose={() => setLayerActiveFeature("indigenous-land-boundaries", null)}
                      accentColor={indigenousBoundaryPaint.outlineColor}
                    >
                      {activeIndigenousBoundary.jurisdictions.length > 0 ? (
                        <p className="text-secondary">
                          Jurisdictions: {activeIndigenousBoundary.jurisdictions.join(", ")}
                        </p>
                      ) : null}
                      {activeIndigenousBoundary.provider ? (
                        <p className="text-secondary">Provider: {activeIndigenousBoundary.provider}</p>
                      ) : null}
                      {typeof activeIndigenousBoundary.accuracy === "number" ? (
                        <p className="text-tertiary">Reported accuracy: {activeIndigenousBoundary.accuracy}m</p>
                      ) : null}
                      {activeIndigenousBoundary.webReference ? (
                        <a
                          className="font-semibold text-utility-blue-600 underline"
                          href={activeIndigenousBoundary.webReference}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open reference
                        </a>
                      ) : null}
                    </PopupCard>
                  </Popup>
                )}

                {weatherAlertsEnabled && activeWeatherAlert && activeWeatherAlert.centroid && (
                  <Popup
                    longitude={activeWeatherAlert.centroid.longitude}
                    latitude={activeWeatherAlert.centroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("environment-canada-weather-alerts", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={buildWeatherAlertTitle(activeWeatherAlert)}
                      subtitle={weatherAlertSubtitleNode ?? activeWeatherAlertSubtitle}
                      onClose={() => setLayerActiveFeature("environment-canada-weather-alerts", null)}
                      accentColor={activeWeatherAlertStyle.outline}
                    >
                      {weatherAlertValidityWindow ? (
                        <p className="text-tertiary">{weatherAlertValidityWindow}</p>
                      ) : null}
                      {weatherAlertDescription ? <p className="text-secondary">{weatherAlertDescription}</p> : null}
                      {activeWeatherAlert.websiteUrl ? (
                        <a
                          className="font-semibold text-utility-blue-600 underline"
                          href={activeWeatherAlert.websiteUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          View Environment Canada alert
                        </a>
                      ) : null}
                    </PopupCard>
                  </Popup>
                )}

                {chcResponseEnabled && activeCHCResponseZone && activeCHCResponseZone.centroid && (
                  <Popup
                    longitude={activeCHCResponseZone.centroid.longitude}
                    latitude={activeCHCResponseZone.centroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("chc-response-zone", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={buildChcResponseZoneSummary(activeCHCResponseZone)}
                      subtitle="CHC response zone extent"
                      onClose={() => setLayerActiveFeature("chc-response-zone", null)}
                      accentColor={CHC_RESPONSE_PAINT.color}
                    >
                      {activeCHCResponseZone.properties?.Shape__Length ? (
                        <p className="text-secondary">
                          Length: {formatDangerAttributeNumber(activeCHCResponseZone.properties.Shape__Length as number)}
                        </p>
                      ) : null}
                      <p className="text-tertiary">Extent published by the Canadian Hurricane Centre.</p>
                    </PopupCard>
                  </Popup>
                )}

                {visibleDobIncidents.map((incident) => (
                  <Marker
                    key={incident.id}
                    longitude={incident.longitude}
                    latitude={incident.latitude}
                    anchor="bottom"
                    onClick={(event) => {
                      event.originalEvent.stopPropagation();
                      setActiveCamera(null);
                      setLayerActiveFeature("active-wildfires", null);
                      setLayerActiveFeature("dob-incidents", incident.id);
                    }}
                  >
                    <button
                      type="button"
                      className="group -translate-y-1 rounded-full border border-white/70 bg-rose-600/90 p-1 shadow-lg shadow-rose-600/30 transition hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                      aria-label={`View incident ${incident.title}`}
                    >
                      <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                    </button>
                  </Marker>
                ))}

                {dobLayerEnabled && activeDobIncident && (
                  <Popup
                    longitude={activeDobIncident.longitude}
                    latitude={activeDobIncident.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("dob-incidents", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeDobIncident.title}
                      subtitle={`${activeDobIncident.location} • Status: ${activeDobIncident.status}`}
                      onClose={() => setLayerActiveFeature("dob-incidents", null)}
                      trailing={<DobIncidentIconImage incident={activeDobIncident} isDarkMode={isDarkMode} />}
                    >
                      {activeDobIncident.description ? (
                        <p className="text-secondary">{activeDobIncident.description}</p>
                      ) : (
                        <p className="text-tertiary">No additional incident details available.</p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {visibleWildfires.map((wildfire) => (
                  <Marker
                    key={`wildfire-${wildfire.id}`}
                    longitude={wildfire.longitude}
                    latitude={wildfire.latitude}
                    anchor="bottom"
                    onClick={(event) => {
                      event.originalEvent.stopPropagation();
                      setLayerActiveFeature("dob-incidents", null);
                      setActiveCamera(null);
                      setLayerActiveFeature("active-wildfires", wildfire.id);
                    }}
                  >
                    <button
                      type="button"
                      className="group -translate-y-1 rounded-full border border-white/70 bg-amber-600/90 p-1 shadow-lg shadow-amber-600/30 transition hover:bg-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                      aria-label={`View wildfire ${wildfire.name}`}
                    >
                      <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                    </button>
                  </Marker>
                ))}

                {wildfireLayerEnabled && activeWildfire && (
                  <Popup
                    longitude={activeWildfire.longitude}
                    latitude={activeWildfire.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("active-wildfires", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeWildfire.name}
                      subtitle={activeWildfireSummary ?? null}
                      onClose={() => setLayerActiveFeature("active-wildfires", null)}
                      accentColor="#f97316"
                    >
                      <p className="text-tertiary">
                        Status: {activeWildfire.stageOfControl} • Response: {formatTitleCase(activeWildfire.responseType)}
                      </p>
                      {activeWildfireSizeLabel && <p className="text-secondary">Size: {activeWildfireSizeLabel} ha</p>}
                      {activeWildfire.startDate && (
                        <p className="text-secondary">
                          Start: {activeWildfire.startDate}
                          {activeWildfire.timezone ? ` (${activeWildfire.timezone})` : ""}
                        </p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {hurricaneLayerEnabled && activeHurricaneCenter && (
                  <Popup
                    longitude={(activeHurricaneCenter.geometry.coordinates as [number, number])[0]}
                    latitude={(activeHurricaneCenter.geometry.coordinates as [number, number])[1]}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("active-hurricanes", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeHurricaneCenter.stormName ?? "Hurricane center"}
                      subtitle={`${activeHurricaneCenter.stormType ?? "Storm"}${activeHurricaneCenter.basin ? ` • ${activeHurricaneCenter.basin}` : ""}`}
                      onClose={() => setLayerActiveFeature("active-hurricanes", null)}
                      accentColor="#0ea5e9"
                    >
                      {activeHurricaneCenter.stormForce && (
                        <p className="text-secondary">Stage: {activeHurricaneCenter.stormForce}</p>
                      )}
                      {formatStormWind(activeHurricaneCenter.maxWind) && (
                        <p className="text-secondary">Max wind: {formatStormWind(activeHurricaneCenter.maxWind)}</p>
                      )}
                      {formatStormPressure(activeHurricaneCenter.meanSeaLevelPressure) && (
                        <p className="text-secondary">
                          Pressure: {formatStormPressure(activeHurricaneCenter.meanSeaLevelPressure)}
                        </p>
                      )}
                      {activeHurricaneCenter.validTime && (
                        <p className="text-tertiary">Valid {formatTimestamp(activeHurricaneCenter.validTime)}</p>
                      )}
                      {activeHurricaneCenter.timestamp && (
                        <p className="text-tertiary">Updated {formatTimestamp(activeHurricaneCenter.timestamp)}</p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {recentHurricanesEnabled && activeRecentHurricane && (
                  <Popup
                    longitude={activeRecentHurricane.longitude}
                    latitude={activeRecentHurricane.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("recent-hurricanes", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeRecentHurricane.stormName ?? "Storm advisory"}
                      subtitle={`${activeRecentHurricane.stormType ?? "System"}${activeRecentHurricane.basin ? ` • ${activeRecentHurricane.basin}` : ""}`}
                      onClose={() => setLayerActiveFeature("recent-hurricanes", null)}
                      accentColor="#f472b6"
                    >
                      {formatStormWind(activeRecentHurricane.intensity) && (
                        <p className="text-secondary">Intensity: {formatStormWind(activeRecentHurricane.intensity)}</p>
                      )}
                      {formatStormPressure(activeRecentHurricane.pressure) && (
                        <p className="text-secondary">MSLP: {formatStormPressure(activeRecentHurricane.pressure)}</p>
                      )}
                      {activeRecentHurricane.category !== null && (
                        <p className="text-tertiary">Rating: {formatStormCategory(activeRecentHurricane.category)}</p>
                      )}
                      {activeRecentHurricane.advisoryTimestamp && (
                        <p className="text-tertiary">
                          Advisory: {formatTimestamp(activeRecentHurricane.advisoryTimestamp)}
                        </p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {hydrometricLayerEnabled && activeHydrometricStation && (
                  <Popup
                    longitude={activeHydrometricStation.longitude}
                    latitude={activeHydrometricStation.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("hydrometric-stations", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeHydrometricStation.stationName ?? activeHydrometricStation.stationNumber ?? "Hydrometric station"}
                      subtitle={activeHydrometricStation.region ? `Region: ${activeHydrometricStation.region}` : null}
                      onClose={() => setLayerActiveFeature("hydrometric-stations", null)}
                      accentColor="#10b981"
                    >
                      {formatHydrometricLevel(activeHydrometricStation.currentLevel) && (
                        <p className="text-secondary">
                          Level: {formatHydrometricLevel(activeHydrometricStation.currentLevel)}
                          {formatSignedDelta(activeHydrometricStation.levelChange, "m")
                            ? ` (${formatSignedDelta(activeHydrometricStation.levelChange, "m")} vs prev)`
                            : ""}
                        </p>
                      )}
                      {formatHydrometricFlow(activeHydrometricStation.currentFlow) && (
                        <p className="text-secondary">
                          Flow: {formatHydrometricFlow(activeHydrometricStation.currentFlow)}
                          {formatSignedDelta(activeHydrometricStation.flowChange, "m³/s")
                            ? ` (${formatSignedDelta(activeHydrometricStation.flowChange, "m³/s")} vs prev)`
                            : ""}
                        </p>
                      )}
                      {activeHydrometricStation.levelPercentile && (
                        <p className="text-tertiary">Level percentile: {activeHydrometricStation.levelPercentile}</p>
                      )}
                      {activeHydrometricStation.flowPercentile && (
                        <p className="text-tertiary">Flow percentile: {activeHydrometricStation.flowPercentile}</p>
                      )}
                      {activeHydrometricStation.lastUpdate && (
                        <p className="text-tertiary">
                          Last update: {formatTimestamp(activeHydrometricStation.lastUpdate)}
                        </p>
                      )}
                      {activeHydrometricStation.url && (
                        <a
                          className="font-semibold text-utility-blue-600 underline"
                          href={activeHydrometricStation.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open station details
                        </a>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {fireDangerLayerEnabled && activeFireDangerArea && activeFireDangerArea.centroid && (
                  <Popup
                    longitude={activeFireDangerArea.centroid.longitude}
                    latitude={activeFireDangerArea.centroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("fire-danger", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={
                        activeFireDangerArea.dangerLabel ??
                        FIRE_DANGER_LEVEL_METADATA[activeFireDangerArea.dangerLevel ?? "unknown"].label
                      }
                      subtitle={buildFireDangerSummary(activeFireDangerArea)}
                      onClose={() => setLayerActiveFeature("fire-danger", null)}
                      accentColor={FIRE_DANGER_LEVEL_METADATA[activeFireDangerArea.dangerLevel ?? "unknown"].colorHex}
                    >
                      <p className="text-tertiary">
                        {FIRE_DANGER_LEVEL_METADATA[activeFireDangerArea.dangerLevel ?? "unknown"].description}
                      </p>
                      {formatDangerAttributeNumber(activeFireDangerArea.area) && (
                        <p className="text-secondary">Area attribute: {formatDangerAttributeNumber(activeFireDangerArea.area)}</p>
                      )}
                      {formatDangerAttributeNumber(activeFireDangerArea.hcount) && (
                        <p className="text-secondary">HCOUNT: {formatDangerAttributeNumber(activeFireDangerArea.hcount)}</p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {perimetersLayerEnabled && activePerimeter && activePerimeter.centroid && (
                  <Popup
                    longitude={activePerimeter.centroid.longitude}
                    latitude={activePerimeter.centroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("perimeters", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title="Fire Perimeter"
                      subtitle={activePerimeter.consisId ? `Consistency ID ${activePerimeter.consisId}` : null}
                      onClose={() => setLayerActiveFeature("perimeters", null)}
                      accentColor={perimeterPaint.outlineColor}
                    >
                      {activePerimeter.hcount || activePerimeter.area ? (
                        <p className="text-secondary">
                          This wildfire perimeter
                          {activePerimeter.hcount ? ` has ${formatCount(activePerimeter.hcount)} hotspots` : ""}
                          {activePerimeter.hcount && activePerimeter.area ? " and" : ""}
                          {activePerimeter.area ? ` covers ${formatPerimeterAreaLabel(activePerimeter.area)} hectares.` : "."}
                        </p>
                      ) : (
                        <p className="text-tertiary">No hotspot or area metadata is available for this perimeter.</p>
                      )}
                      {perimeterLatestLabel && <p className="text-secondary">Latest hotspot: {perimeterLatestLabel} (UTC)</p>}
                      {perimeterEarliestLabel && <p className="text-secondary">Earliest hotspot: {perimeterEarliestLabel}</p>}
                      {formatDangerAttributeNumber(activePerimeter.shapeArea) && (
                        <p className="text-tertiary">Shape area: {formatDangerAttributeNumber(activePerimeter.shapeArea)}</p>
                      )}
                      {formatDangerAttributeNumber(activePerimeter.shapeLength) && (
                        <p className="text-tertiary">Shape length: {formatDangerAttributeNumber(activePerimeter.shapeLength)}</p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {visibleBorderEntries.map((entry) => {
                  const IconComponent = BORDER_ENTRY_ICON_COMPONENTS[entry.entryType];
                  return (
                    <Marker
                      key={`border-entry-${entry.id}`}
                      longitude={entry.longitude}
                      latitude={entry.latitude}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("border-entries", entry.id);
                        setActiveCamera(null);
                      }}
                    >
                      <button type="button" className={borderMarkerButtonClass} aria-label={`View port ${entry.name}`}>
                        <IconComponent className={`h-3 w-3 ${BORDER_ENTRY_ICON_CLASSES[entry.entryType]}`} />
                      </button>
                    </Marker>
                  );
                })}

                {borderEntriesEnabled && activeBorderEntry && (
                  <Popup
                    longitude={activeBorderEntry.longitude}
                    latitude={activeBorderEntry.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("border-entries", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeBorderEntry.name}
                      subtitle={activeBorderEntrySummary}
                      onClose={() => setLayerActiveFeature("border-entries", null)}
                      accentColor="#0ea5e9"
                    >
                      {activeBorderEntry.address && (
                        <p className="text-secondary">
                          Address: {activeBorderEntry.address}
                          {activeBorderEntry.place ? `, ${activeBorderEntry.place}` : ""}
                          {activeBorderEntry.province ? `, ${activeBorderEntry.province}` : ""}
                        </p>
                      )}
                      {activeBorderEntry.url && (
                        <a
                          className="font-semibold text-utility-blue-600 underline"
                          href={activeBorderEntry.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open site
                        </a>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {aerodromeLayerEnabled && activeAerodrome && (
                  <Popup
                    longitude={activeAerodrome.longitude}
                    latitude={activeAerodrome.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("aerodromes", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeAerodrome.name ?? activeAerodrome.icao ?? "Aerodrome"}
                      subtitle={activeAerodrome.icao ? `ICAO: ${activeAerodrome.icao}` : null}
                      onClose={() => setLayerActiveFeature("aerodromes", null)}
                      accentColor="#7c3aed"
                    >
                      {activeAerodrome.organisation && <p className="text-secondary">Org: {activeAerodrome.organisation}</p>}
                      {activeAerodrome.province && <p className="text-secondary">Province: {activeAerodrome.province}</p>}
                      {activeAerodrome.elevation !== null && (
                        <p className="text-secondary">
                          Elevation: {formatDangerAttributeNumber(activeAerodrome.elevation)}
                          {activeAerodrome.elevationUnit ? ` ${activeAerodrome.elevationUnit}` : ""}
                        </p>
                      )}
                      {activeAerodrome.runwayNumbers && <p className="text-secondary">Runways: {activeAerodrome.runwayNumbers}</p>}
                      {activeAerodrome.facilityType && <p className="text-tertiary">Type: {activeAerodrome.facilityType}</p>}
                      {activeAerodrome.surfaceType && <p className="text-tertiary">Surface: {activeAerodrome.surfaceType}</p>}
                      {activeAerodrome.lightingType && <p className="text-tertiary">Lighting: {activeAerodrome.lightingType}</p>}
                      {activeAerodrome.lightingIntensity && (
                        <p className="text-tertiary">Lighting intensity: {activeAerodrome.lightingIntensity}</p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {railwayLayerEnabled && activeRailway?.center && (
                  <Popup
                    longitude={activeRailway.center.longitude}
                    latitude={activeRailway.center.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("railways", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeRailway.name ?? "Railway segment"}
                      subtitle={activeRailway.classLabel ? `Class: ${activeRailway.classLabel}` : null}
                      onClose={() => setLayerActiveFeature("railways", null)}
                      accentColor={railwayPaint.activeColor}
                    >
                      {activeRailway.status && <p className="text-secondary">Status: {activeRailway.status}</p>}
                      {activeRailway.regulator && <p className="text-secondary">Regulator: {activeRailway.regulator}</p>}
                      {activeRailway.useType && <p className="text-tertiary">Use: {activeRailway.useType}</p>}
                      {activeRailway.gauge && <p className="text-tertiary">Gauge: {activeRailway.gauge}</p>}
                      {activeRailway.numTracks !== null && (
                        <p className="text-tertiary">Tracks: {formatCount(activeRailway.numTracks) ?? activeRailway.numTracks}</p>
                      )}
                      {(activeRailway.speedFreight || activeRailway.speedPassenger) && (
                        <p className="text-tertiary">
                          Speeds: {activeRailway.speedFreight ? `${activeRailway.speedFreight} (freight)` : ""}
                          {activeRailway.speedFreight && activeRailway.speedPassenger ? " • " : ""}
                          {activeRailway.speedPassenger ? `${activeRailway.speedPassenger} (passenger)` : ""}
                        </p>
                      )}
                      {formatDangerAttributeNumber(activeRailway.length) && (
                        <p className="text-tertiary">Shape length: {formatDangerAttributeNumber(activeRailway.length)}</p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {highwayLayerEnabled && activeHighway?.center && (
                  <Popup
                    longitude={activeHighway.center.longitude}
                    latitude={activeHighway.center.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("highways", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeHighway.name ?? "Highway corridor"}
                      subtitle={activeHighway.province ? `Province: ${activeHighway.province}` : null}
                      onClose={() => setLayerActiveFeature("highways", null)}
                      accentColor={highwayPaint.activeColor}
                    >
                      {formatDangerAttributeNumber(activeHighway.length) && (
                        <p className="text-secondary">Length attribute: {formatDangerAttributeNumber(activeHighway.length)}</p>
                      )}
                      {!activeHighway.length && <p className="text-tertiary">No additional attributes provided.</p>}
                    </PopupCard>
                  </Popup>
                )}
              </Map>
              <MapSearchControl onLocationFound={handleLocationFound} />
            </div>
          </div>

          <div className="rounded-xl border border-secondary/30 bg-primary p-4 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Developer</p>
                <p className="text-sm font-semibold text-secondary">Surrounding context query</p>
                <p className="text-xs text-tertiary">Inspect loaded features near coordinates.</p>
              </div>
              <Button size="sm" color="secondary" onClick={handleContextQuery} disabled={contextQueryLoading}>
                {contextQueryLoading ? "Searching..." : "Query radius"}
              </Button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-xs text-tertiary">
                Latitude
                <input
                  type="text"
                  inputMode="decimal"
                  value={contextQueryLat}
                  onChange={(event) => setContextQueryLat(event.target.value)}
                  placeholder="e.g. 45.4215"
                  className="rounded-md border border-secondary/40 bg-primary px-3 py-2 text-sm text-secondary shadow-inner shadow-black/5 focus:border-secondary/60 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-tertiary">
                Longitude
                <input
                  type="text"
                  inputMode="decimal"
                  value={contextQueryLng}
                  onChange={(event) => setContextQueryLng(event.target.value)}
                  placeholder="-75.6972"
                  className="rounded-md border border-secondary/40 bg-primary px-3 py-2 text-sm text-secondary shadow-inner shadow-black/5 focus:border-secondary/60 focus:outline-none"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs text-tertiary">
                Radius (km)
                <input
                  type="text"
                  inputMode="decimal"
                  value={contextQueryRadiusKm}
                  onChange={(event) => setContextQueryRadiusKm(event.target.value)}
                  placeholder="25"
                  className="rounded-md border border-secondary/40 bg-primary px-3 py-2 text-sm text-secondary shadow-inner shadow-black/5 focus:border-secondary/60 focus:outline-none"
                />
              </label>
            </div>

            {contextQueryError ? <p className="mt-2 text-xs text-utility-error-500">{contextQueryError}</p> : null}

            <div className="mt-3 max-h-72 space-y-2 overflow-y-auto rounded-lg border border-secondary/20 bg-secondary/5 p-2">
              {contextQueryResults.length === 0 ? (
                <p className="text-xs text-tertiary">
                  No results yet. Enter coordinates and radius, then run a query.
                </p>
              ) : (
                contextQueryResults.map((hit) => (
                  <div key={`${hit.layerId}-${hit.featureId}`} className="rounded-md bg-primary px-3 py-2 shadow-sm shadow-black/5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-secondary">{hit.summary}</p>
                        <p className="truncate text-xs text-tertiary">
                          {hit.layerLabel} • {hit.coordinates.latitude.toFixed(4)}, {hit.coordinates.longitude.toFixed(4)}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs font-semibold text-secondary">{hit.distanceKm.toFixed(1)} km</span>
                    </div>
                    <pre className="mt-1 max-h-32 overflow-auto rounded bg-secondary/10 p-2 text-[11px] text-tertiary">
                      {JSON.stringify(hit.feature, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>

          <Accordion type="single" collapsible defaultValue="layers" className="rounded-xl border border-secondary/30 bg-primary shadow-sm">
            <AccordionItem value="layers">
              <AccordionTrigger className="px-4 text-sm font-semibold uppercase tracking-wide text-secondary">Data</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">View type</p>
                      <p className="text-sm text-secondary">Preset filters for situational focus.</p>
                    </div>
                    <div className="min-w-[14rem] flex-1">
                      <Select
                        aria-label="Select view type"
                        selectedKey={selectedViewType}
                        onSelectionChange={(key) => setSelectedViewType(String(key) as ViewType)}
                        items={VIEW_TYPE_OPTIONS}
                        size="sm"
                        className="w-full"
                      >
                        {(item) => <Select.Item key={item.id} {...item} />}
                      </Select>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Layers</p>
                    <div className="mt-2 flex flex-col gap-3">
                      {paginatedLayers.length > 0 ? (
                        paginatedLayers.map((layer) => (
                          <div key={layer.id} className="min-w-0">
                            <Toggle
                              size="sm"
                              className="w-full"
                              isSelected={Boolean(layerVisibility[layer.id])}
                              onChange={(isSelected) =>
                                setLayerVisibility((prev) => ({
                                  ...prev,
                                  [layer.id]: isSelected,
                                }))
                              }
                              label={layer.label}
                              hint={layer.description}
                              activeColor={layer.colorHex ?? "#090909"}
                              activeHoverColor={layer.hoverColorHex ?? "#1c1c1c"}
                            />
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-tertiary">No layers available for this view.</p>
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-tertiary">
                      <span>
                        Page {totalLayerPages === 0 ? 0 : currentLayerPage + 1} of {totalLayerPages}
                      </span>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="rounded-md border border-secondary/40 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide transition hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => setLayerPageIndex(Math.max(0, currentLayerPage - 1))}
                          disabled={currentLayerPage === 0}
                        >
                          Previous
                        </button>
                        <button
                          type="button"
                          className="rounded-md border border-secondary/40 px-2 py-1 text-[0.7rem] font-semibold uppercase tracking-wide transition hover:bg-secondary/10 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => setLayerPageIndex(Math.min(totalLayerPages - 1, currentLayerPage + 1))}
                          disabled={currentLayerPage >= totalLayerPages - 1}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <p className="text-xs text-tertiary">
            {activeLayerLabels.length > 0 ? `Active layers: ${activeLayerLabels.join(", ")}` : "No layers enabled yet."}
          </p>
        </section>

        {fullscreenCamera && fullscreenCameraPreview?.objectUrl && (
          <ModalOverlay
            isOpen
            isDismissable
            onOpenChange={(isOpen) => {
              if (!isOpen) {
                setFullscreenCameraId(null);
              }
            }}
          >
            <Modal>
              <Dialog
                aria-label={fullscreenCamera ? `Traffic camera ${fullscreenCamera.number} fullscreen preview` : "Traffic camera fullscreen preview"}
                className="mx-auto w-full max-w-4xl rounded-2xl bg-primary p-4 shadow-xl"
              >
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-base font-semibold leading-tight">{fullscreenCamera.description}</p>
                      <p className="text-sm text-tertiary">Camera #{fullscreenCamera.number}</p>
                    </div>
                  </div>
                  <div className="max-h-[80vh] w-full overflow-hidden rounded-xl border border-secondary/30 bg-black">
                    <img
                      src={fullscreenCameraPreview.objectUrl}
                      alt={`Fullscreen live traffic camera ${fullscreenCamera.description}`}
                      className="h-full w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-tertiary">
                    <span>
                      {fullscreenCameraPreview.fetchedAt
                        ? `Last updated ${new Date(fullscreenCameraPreview.fetchedAt).toLocaleString()}`
                        : "Loading the latest still..."}
                    </span>
                    <Button size="sm" color="secondary" onClick={() => setFullscreenCameraId(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              </Dialog>
            </Modal>
          </ModalOverlay>
        )}

        {census2021Enabled && activeCensus2021 && (
          <Popup
            longitude={activeCensus2021.centroid?.longitude ?? 0} // Fallback if centroid missing, though unlikely
            latitude={activeCensus2021.centroid?.latitude ?? 0}
            anchor="bottom"
            onClose={() => setLayerActiveFeature("census-2021-da", null)}
            closeButton={false}
            focusAfterOpen={false}
          >
            <PopupCard
              title={activeCensus2021.geoName ?? "Dissemination Area"}
              subtitle={`ID: ${activeCensus2021.dauid}`}
              onClose={() => setLayerActiveFeature("census-2021-da", null)}
              accentColor={census2021Paint.outlineColor}
            >
              <p className="text-secondary font-medium">
                Population: {activeCensus2021.popCount}
              </p>
              <p className="text-secondary">
                Dwellings: {activeCensus2021.privateDwellings} (Total: {activeCensus2021.totalPrivateDwellings})
              </p>
              {activeCensus2021.popDensity && <p className="text-tertiary">Density: {activeCensus2021.popDensity.toFixed(1)} /km²</p>}
              {activeCensus2021.landArea && <p className="text-tertiary">Land Area: {activeCensus2021.landArea.toFixed(2)} km²</p>}
            </PopupCard>
          </Popup>
        )}
      </CardContent>
    </AnalysisCardFrame >
  );
}
