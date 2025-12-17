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
  type DobIncidentFeature,
  type WildfireFeature,
  type BorderEntryFeature,
  type BorderEntryType,
  type FireDangerFeature,
  type PerimeterFeature,
  type AerodromeFeature,
  type RailwayFeature,
  type HighwayFeature,
  type FerryRouteFeature,
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
  type RemoteCommunityFeature,
  type NationalParkFeature,
  type EarthquakeFeature,
  type HistoricalEarthquakeFeature,
  type SeismographStationFeature,
  type GlobalFaultFeature,
  type DamReservoirFeature,
  type HistoricalPerimeterFeature,
  type FirstAlertFeature,
  type HealthcareFacilityFeature,
  type EnergyInfrastructureFeature,
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
    case "first-alerts": {
      const cast = feature as FirstAlertFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      if (cast.centroid) {
        return cast.centroid;
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
    case "healthcare-facilities": {
      const cast = feature as HealthcareFacilityFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "energy-infrastructure": {
      const cast = feature as EnergyInfrastructureFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      if (cast.geometry) {
        return computeGeoCentroid(cast.geometry);
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
    case "ferry-routes": {
      const cast = feature as FerryRouteFeature;
      if (cast.centroid && isFiniteNumber(cast.centroid.longitude) && isFiniteNumber(cast.centroid.latitude)) {
        return cast.centroid;
      }
      if (cast.geometry) {
        return computeGeoCentroid(cast.geometry);
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
    case "dams-reservoirs": {
      const cast = feature as DamReservoirFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      if (cast.geometry) {
        return computeGeoCentroid(cast.geometry);
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
    case "remote-communities": {
      const cast = feature as RemoteCommunityFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      if (cast.centroid) {
        return cast.centroid;
      }
      return null;
    }
    case "recent-earthquakes": {
      const cast = feature as EarthquakeFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "historical-earthquakes": {
      const cast = feature as HistoricalEarthquakeFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "seismograph-stations": {
      const cast = feature as SeismographStationFeature;
      if (isFiniteNumber(cast.longitude) && isFiniteNumber(cast.latitude)) {
        return { longitude: cast.longitude, latitude: cast.latitude };
      }
      return null;
    }
    case "global-active-faults": {
      const cast = feature as GlobalFaultFeature;
      if (cast.geometry) {
        return computeGeoCentroid(cast.geometry);
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
    case "national-parks": {
      const cast = feature as NationalParkFeature;
      if (cast.centroid) {
        return cast.centroid;
      }
      return computeGeoCentroid(cast.geometry);
    }
    case "historical-perimeters": {
      const cast = feature as HistoricalPerimeterFeature;
      // Use pre-calculated centroid if I added it to interface (I didn't explicitly implement calculation in fetcher earlier, 
      // I just passed feature.geometry to computeGeoCentroid in local scope? No wait, I didn't add centroid to the object return in fetcher.)
      // Wait, in Step 94, I REMOVED `centroid` property from `HistoricalPerimeterFeature` interface?
      // Check Step 94 diff: `geometry: Geometry;` is there. `centroid` is NOT in the interface.
      // So I must rely on `computeGeoCentroid(cast.geometry)`.
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
    case "first-alerts": {
      return buildFirstAlertSummary(feature as FirstAlertFeature);
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
    case "historical-perimeters": {
      const cast = feature as HistoricalPerimeterFeature;
      const year = cast.year ? ` (${cast.year})` : "";
      return `Historical Perimeter${year}`;
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
    case "healthcare-facilities": {
      return buildHealthcareSummary(feature as HealthcareFacilityFeature);
    }
    case "energy-infrastructure": {
      return buildEnergyInfrastructureSummary(feature as EnergyInfrastructureFeature);
    }
    case "railways": {
      const cast = feature as RailwayFeature;
      const label = cast.name || "Railway segment";
      const classLabel = cast.classLabel ? ` • ${cast.classLabel}` : "";
      return `${label}${classLabel}`;
    }
    case "ferry-routes": {
      return buildFerryRouteSummary(feature as FerryRouteFeature);
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
    case "surface-water-levels": {
      return buildSurfaceWaterSummary(feature as HydrometricStationFeature);
    }
    case "dams-reservoirs": {
      return buildDamReservoirSummary(feature as DamReservoirFeature);
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
    case "remote-communities": {
      const cast = feature as RemoteCommunityFeature;
      return buildRemoteCommunitySummary(cast);
    }
    case "recent-earthquakes": {
      return buildEarthquakeSummary(feature as EarthquakeFeature);
    }
    case "historical-earthquakes": {
      return buildHistoricalEarthquakeSummary(feature as HistoricalEarthquakeFeature);
    }
    case "seismograph-stations": {
      return buildSeismographSummary(feature as SeismographStationFeature);
    }
    case "global-active-faults": {
      return buildFaultSummary(feature as GlobalFaultFeature);
    }
    case "indigenous-land-boundaries": {
      return buildIndigenousBoundarySummary(feature as IndigenousLandBoundaryFeature);
    }
    case "national-parks": {
      const cast = feature as NationalParkFeature;
      return cast.nameEn ?? cast.nameFr ?? cast.id ?? "National Park";
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
const HEALTHCARE_MARKER_MIN_ZOOM = 5;
const CONTEXT_POLYGON_MIN_ZOOM = 4;
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
  "group -translate-y-1 rounded-full border border-white/70 bg-[#a0a5bd]/90 p-1 shadow-md shadow-[#a0a5bd]/40 transition hover:bg-[#7a7f99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const HYDROMETRIC_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-emerald-500/90 p-1 shadow-md shadow-emerald-500/30 transition hover:bg-emerald-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const SOURCES_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-[#9b59d9]/90 p-1 shadow-md shadow-[#9b59d9]/30 transition hover:bg-[#8e44ad] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const FIRST_ALERT_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-[#e3528e]/90 p-1 shadow-md shadow-[#e3528e]/40 transition hover:bg-[#c43772] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const HEALTHCARE_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-emerald-600/90 p-1 shadow-md shadow-emerald-500/40 transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const ENERGY_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-sky-600/90 p-1 shadow-md shadow-sky-500/40 transition hover:bg-sky-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const REMOTE_COMMUNITY_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-[#e8bb84] p-1 shadow-lg shadow-[#e8bb84]/40 transition hover:bg-[#d49b5c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const EARTHQUAKE_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-[#a16207] p-1 shadow-lg shadow-[#a16207]/40 transition hover:bg-[#854d0e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const HISTORICAL_EARTHQUAKE_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-[#78350f] p-1 shadow-lg shadow-[#78350f]/40 transition hover:bg-[#5c2d0b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const SEISMOGRAPH_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-orange-500 p-1 shadow-lg shadow-orange-500/40 transition hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
const SURFACE_WATER_MARKER_CLASS =
  "group -translate-y-1 rounded-full border border-white/70 bg-sky-500 p-1 shadow-lg shadow-sky-500/40 transition hover:bg-sky-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80";
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
const FERRY_ROUTES_SOURCE_ID = "ferry-routes-source";
const FERRY_ROUTES_LINE_LAYER_ID = "ferry-routes-line";
const BUILDING_FOOTPRINT_SOURCE_ID = "building-footprints-source";
const BUILDING_FOOTPRINT_FILL_LAYER_ID = "building-footprints-fill";
const BUILDING_FOOTPRINT_OUTLINE_LAYER_ID = "building-footprints-outline";
const PROPERTY_BOUNDARIES_SOURCE_ID = "property-boundaries-source";
const PROPERTY_BOUNDARIES_FILL_LAYER_ID = "property-boundaries-fill";
const PROPERTY_BOUNDARIES_OUTLINE_LAYER_ID = "property-boundaries-outline";
const DAMS_RESERVOIRS_SOURCE_ID = "dams-reservoirs-source";
const DAMS_RESERVOIRS_FILL_LAYER_ID = "dams-reservoirs-fill";
const DAMS_RESERVOIRS_OUTLINE_LAYER_ID = "dams-reservoirs-outline";
const INDIGENOUS_BOUNDARIES_SOURCE_ID = "indigenous-land-boundaries-source";
const INDIGENOUS_BOUNDARIES_FILL_LAYER_ID = "indigenous-land-boundaries-fill";
const INDIGENOUS_BOUNDARIES_OUTLINE_LAYER_ID = "indigenous-land-boundaries-outline";
const WEATHER_ALERTS_SOURCE_ID = "weather-alerts-source";
const WEATHER_ALERTS_FILL_LAYER_ID = "weather-alerts-fill";
const WEATHER_ALERTS_OUTLINE_LAYER_ID = "weather-alerts-outline";
const GLOBAL_FAULTS_SOURCE_ID = "global-faults-source";
const GLOBAL_FAULTS_LAYER_ID = "global-faults-line";
const GLOBAL_FAULT_SLIP_COLORS: Record<string, string> = {
  anticline: "#f97316",
  syncline: "#ea580c",
  "blind-thrust": "#fbbf24",
  reverse: "#fcd34d",
  "reverse-dextral": "#facc15",
  "reverse-sinistral": "#fde047",
  "reverse-strike-slip": "#fbbf24",
  sinistral: "#a855f7",
  "sinistral-normal": "#d946ef",
  "sinistral-reverse": "#c026d3",
  "sinistral-transform": "#9333ea",
  dextral: "#0ea5e9",
  "dextral-normal": "#38bdf8",
  "dextral-oblique": "#06b6d4",
  "dextral-reverse": "#0d9488",
  "dextral-transform": "#14b8a6",
  "normal-dextral": "#34d399",
  "normal-sinistral": "#22c55e",
  normal: "#84cc16",
  "normal-strike-slip": "#65a30d",
  "strike-slip": "#fb7185",
  "subduction-thrust": "#ef4444",
  "spreading-ridge": "#22d3ee",
};
const normalizeFaultSlipKey = (value?: string | null) => {
  if (!value) {
    return null;
  }
  return value
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/_/g, "-")
    .replace(/-fault$/, "");
};
const getGlobalFaultColor = (fault: Pick<GlobalFaultFeature, "slipType" | "slipTypeSimple">) => {
  const key = normalizeFaultSlipKey(fault.slipTypeSimple ?? fault.slipType);
  return (key ? GLOBAL_FAULT_SLIP_COLORS[key] : null) ?? "#ef4444";
};
const GLOBAL_FAULT_PAINT = {
  color: ["coalesce", ["get", "color"], "#ef4444"] as const,
  width: 1.2,
  activeWidth: 2.2,
  opacity: 0.95,
  emissive: 0.7,
};
const buildingFootprintPaint = {
  fillColor: "#e34f4f",
  fillOpacity: 0.25,
  outlineColor: "#b62525",
  outlineWidth: 1.3,
  fillEmissive: 0.6,
  outlineEmissive: 0.9,
};
const propertyBoundaryPaint = {
  fillColor: "#f06c67",
  fillOpacity: 0.25,
  outlineColor: "#c94a45",
  outlineWidth: 1.5,
  fillEmissive: 0.5,
  outlineEmissive: 0.85,
};
const damsReservoirPaint = {
  fillColor: "#749fe8",
  fillOpacity: 0.35,
  outlineColor: "#4f78c7",
  outlineWidth: 1.3,
  fillEmissive: 0.55,
  outlineEmissive: 0.8,
};
const indigenousBoundaryPaint = {
  fillColor: "#d6d167",
  fillOpacity: 0.25,
  outlineColor: "#b5aa3c",
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
const INUIT_COMMUNITIES_LAYER_ID = "inuit-communities-layer";
const inuitCommunitiesPaint = {
  circleColor: "#0d9488",
  circleRadius: 5,
  circleActiveRadius: 8,
  circleStrokeColor: "#ffffff",
  circleStrokeWidth: 1.5,
  circleEmissive: 0.8,
};
const remoteCommunitiesPaint = {
  circleColor: "#e8bb84",
  circleRadius: 5,
  circleActiveRadius: 8,
  circleStrokeColor: "#ffffff",
  circleStrokeWidth: 1.5,
  circleEmissive: 0.8,
};
const NATIONAL_PARKS_SOURCE_ID = "national-parks-source";
const NATIONAL_PARKS_FILL_LAYER_ID = "national-parks-fill";
const NATIONAL_PARKS_OUTLINE_LAYER_ID = "national-parks-outline";
const nationalParksPaint = {
  fillColor: "#22c55e",
  fillOpacity: 0.25,
  outlineColor: "#16a34a",
  outlineWidth: 1.5,
  fillEmissive: 0.5,
  outlineEmissive: 0.85,
};

const HISTORICAL_PERIMETERS_SOURCE_ID = "historical-perimeters-source";
const HISTORICAL_PERIMETERS_FILL_LAYER_ID = "historical-perimeters-fill";
const HISTORICAL_PERIMETERS_OUTLINE_LAYER_ID = "historical-perimeters-outline";
const historicalPerimetersPaint = {
  fillEmissive: 0.5,
  outlineEmissive: 0.9,
  defaultFillOpacity: 0.35,
  activeFillOpacity: 0.55,
  defaultOutlineWidth: 1,
  activeOutlineWidth: 1.5,
};

const FIRST_ALERT_LAYER_COLOR = "#e3528e";

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
  lastFetchKey: string | null;
};

type MapBounds = { sw: { lng: number; lat: number }; ne: { lng: number; lat: number } };

const LAYER_MIN_FETCH_ZOOM: Record<string, number> = {
  "indigenous-land-boundaries": 5,
  "hydrometric-stations": 5,
  "surface-water-levels": 5,
  "dams-reservoirs": 5,
  "global-active-faults": 2,
};

const BOUNDS_AWARE_LAYER_IDS = new Set<string>([
  "indigenous-land-boundaries",
  "hydrometric-stations",
  "surface-water-levels",
  "dams-reservoirs",
  "global-active-faults",
]);

const formatBoundsKey = (bounds?: MapBounds | null, zoom?: number) => {
  if (!bounds) {
    return `none|${zoom ?? "n/a"}`;
  }
  const round = (value: number) => value.toFixed(3);
  return `${round(bounds.sw.lng)},${round(bounds.sw.lat)},${round(bounds.ne.lng)},${round(bounds.ne.lat)}|${Math.floor(
    zoom ?? 0,
  )}`;
};

const useDataLayerManager = (layerVisibility: Record<string, boolean>, mapZoom: number, mapBounds: MapBounds | null) => {
  const [layerDataState, setLayerDataState] = useState<Record<string, DataLayerRuntimeState>>(() => {
    return DATA_LAYER_CONFIGS.reduce<Record<string, DataLayerRuntimeState>>((acc, config) => {
      acc[config.id] = {
        data: [],
        loading: false,
        error: null,
        activeFeatureId: null,
        hasFetched: false,
        lastFetchKey: null,
      };
      return acc;
    }, {});
  });
  const layerDataStateRef = useRef(layerDataState);

  const abortControllersRef = useRef<Record<string, AbortController | null>>({});

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
      const minZoom = LAYER_MIN_FETCH_ZOOM[config.id];
      if (typeof minZoom === "number" && mapZoom < minZoom) {
        return;
      }
      const shouldUseBounds = BOUNDS_AWARE_LAYER_IDS.has(config.id);
      const fetchKey = shouldUseBounds ? formatBoundsKey(mapBounds, mapZoom) : "static";
      const state = layerDataStateRef.current[config.id];
      if (!state || state.loading || (state.hasFetched && state.lastFetchKey === fetchKey)) {
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
        .fetcher({
          signal: controller.signal,
          bounds: shouldUseBounds ? mapBounds ?? undefined : undefined,
          zoom: shouldUseBounds ? mapZoom : undefined,
        })
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
              lastFetchKey: fetchKey,
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
              lastFetchKey: fetchKey,
            },
          }));
        })
        .finally(() => {
          if (abortControllersRef.current[config.id] === controller) {
            abortControllersRef.current[config.id] = null;
          }
        });
    });
  }, [layerVisibility, mapBounds, mapZoom]);

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

const buildFerryRouteSummary = (route: FerryRouteFeature) => {
  const name = route.objName ?? route.nativeName ?? route.encName ?? route.id;
  const status = route.status ? ` • ${route.status}` : "";
  const scale = route.scaleMin && route.scaleMax ? ` (scales ${route.scaleMin}-${route.scaleMax})` : "";
  return `${name}${status}${scale}`.trim();
};

const buildFirstAlertSummary = (alert: FirstAlertFeature) => {
  const headline = alert.headline ?? alert.subHeadlineTitle ?? alert.alertType ?? "First Alerts report";
  const location = alert.estimatedEventLocationName ?? "an unspecified location";
  const timeComponent = alert.eventTime ? ` at ${alert.eventTime}` : "";
  const typeComponent = alert.alertType ? ` (${alert.alertType})` : "";
  const topicsLabel = alert.alertTopics.length > 0 ? `Topics: ${alert.alertTopics.join(", ")}` : null;
  const listsLabel = alert.alertLists.length > 0 ? `Lists: ${alert.alertLists.join(", ")}` : null;
  const parts = [`${headline}${typeComponent}${timeComponent} near ${location}.`];
  if (topicsLabel) {
    parts.push(topicsLabel);
  }
  if (listsLabel) {
    parts.push(listsLabel);
  }
  return parts.join(" ");
};

const buildBorderEntrySummary = (entry: BorderEntryFeature) => {
  const typeLabel =
    entry.entryType === "air" ? "air" : entry.entryType === "land" ? "land border" : "international crossing";
  const regionLabel = entry.region ? `${entry.region} region` : "an unspecified region";
  const provinceLabel = entry.province ? `, ${entry.province}` : "";
  return `The ${typeLabel} port ${entry.name} serves the ${regionLabel}${provinceLabel}. ${entry.address ? `It is located at ${entry.address}.` : ""
    }`;
};

const buildHealthcareSummary = (facility: HealthcareFacilityFeature) => {
  const name = facility.facilityName ?? facility.provider ?? facility.id ?? "Healthcare facility";
  const type = facility.odhfFacilityType ?? facility.sourceFacilityType;
  const city = facility.city ? ` • ${facility.city}` : "";
  const province = facility.province ? `, ${facility.province}` : "";
  const typeText = type ? ` • ${type}` : "";
  return `${name}${typeText}${city}${province}`;
};

const buildEnergyInfrastructureSummary = (site: EnergyInfrastructureFeature) => {
  const name = site.facility ?? site.layerName ?? site.id;
  const source = site.primarySource ? ` • ${site.primarySource}` : "";
  const city = site.city ? ` • ${site.city}` : "";
  return `${name}${source}${city}`;
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

const buildRemoteCommunitySummary = (community: RemoteCommunityFeature) => {
  const title = community.name ?? community.id ?? "Remote community";
  const parts: string[] = [];
  if (community.province) {
    parts.push(`Province: ${community.province}`);
  }
  if (community.population) {
    parts.push(`Population: ${community.population}`);
  }
  const accessModes = [
    community.flyInAccess ? `Fly-in: ${community.flyInAccess}` : null,
    community.railAccess ? `Rail: ${community.railAccess}` : null,
    community.boatAccess ? `Boat: ${community.boatAccess}` : null,
    community.roadAccess ? `Road: ${community.roadAccess}` : null,
  ].filter(Boolean);
  if (accessModes.length > 0) {
    parts.push(`Access: ${accessModes.join(", ")}`);
  }
  if (community.communityType) {
    parts.push(`Community type: ${community.communityType}`);
  }
  if (community.communityClassification) {
    parts.push(`Classification: ${community.communityClassification}`);
  }
  if (community.powerGrid) {
    parts.push(`Power grid: ${community.powerGrid}`);
  }
  if (community.accessInformation) {
    parts.push(`Access info: ${community.accessInformation}`);
  }
  if (community.alternateName) {
    parts.push(`Alternate name: ${community.alternateName}`);
  }
  if (community.notes) {
    parts.push(`Notes: ${community.notes}`);
  }
  const decimalLat = isFiniteNumber(community.latitude ?? community.latitudeDd ?? null)
    ? (community.latitude ?? community.latitudeDd)!
    : null;
  const decimalLng = isFiniteNumber(community.longitude ?? community.longitudeDd ?? null)
    ? (community.longitude ?? community.longitudeDd)!
    : null;
  if (decimalLat !== null && decimalLng !== null) {
    parts.push(`Lat/Long: ${decimalLat.toFixed(4)}, ${decimalLng.toFixed(4)}`);
  }
  if (community.latitudeDms && community.longitudeDms) {
    parts.push(`DMS: ${community.latitudeDms} / ${community.longitudeDms}`);
  }
  if (community.mgrsCoordinates) {
    parts.push(`MGRS: ${community.mgrsCoordinates}`);
  }
  return `${title}${parts.length > 0 ? ` • ${parts.join(" • ")}` : ""}`;
};

const renderRemoteCommunityTooltip = (community: RemoteCommunityFeature): ReactNode => {
  const infoEntries: Array<[string, string]> = [
    ["Province", community.province],
    ["Population", community.population],
    ["Community type", community.communityType],
    ["Classification", community.communityClassification],
    ["Power grid", community.powerGrid],
    ["Access info", community.accessInformation],
    ["Alternate name", community.alternateName],
  ].filter(([, value]): value is string => Boolean(value));

  const accessModes = [
    { label: "Fly-in", value: community.flyInAccess },
    { label: "Rail", value: community.railAccess },
    { label: "Boat", value: community.boatAccess },
    { label: "Road", value: community.roadAccess },
  ].filter((entry): entry is { label: string; value: string } => Boolean(entry.value));

  const decimalLat = isFiniteNumber(community.latitude ?? community.latitudeDd ?? null)
    ? (community.latitude ?? community.latitudeDd)!
    : null;
  const decimalLng = isFiniteNumber(community.longitude ?? community.longitudeDd ?? null)
    ? (community.longitude ?? community.longitudeDd)!
    : null;

  const coordinateEntries: Array<[string, string]> = [];
  if (decimalLat !== null && decimalLng !== null) {
    coordinateEntries.push(["Coordinates", `${decimalLat.toFixed(4)}, ${decimalLng.toFixed(4)}`]);
  }
  if (community.latitudeDms && community.longitudeDms) {
    coordinateEntries.push(["DMS", `${community.latitudeDms} / ${community.longitudeDms}`]);
  }
  if (community.mgrsCoordinates) {
    coordinateEntries.push(["MGRS", community.mgrsCoordinates]);
  }

  return (
    <div className="space-y-2 text-sm text-secondary">
      <p className="text-xs uppercase tracking-wide text-tertiary">Remote community details</p>
      <p className="text-sm font-semibold text-primary">{community.name ?? community.id}</p>
      <div className="space-y-1 text-[0.82rem]">
        {infoEntries.map(([label, value]) => (
          <p key={`info-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
        {coordinateEntries.map(([label, value]) => (
          <p key={`coord-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
      </div>
      {accessModes.length > 0 && (
        <div className="space-y-0.5">
          <p className="text-[0.65rem] font-semibold uppercase tracking-wider text-tertiary">Access modes</p>
          <div className="space-y-0.5 text-[0.82rem]">
            {accessModes.map((mode) => (
              <p key={`access-${mode.label}`}>
                <span className="font-semibold text-primary">{mode.label}</span>: {mode.value}
              </p>
            ))}
          </div>
        </div>
      )}
      {community.notes && (
        <p className="text-[0.82rem] text-secondary">
          <span className="font-semibold text-primary">Notes</span>: {community.notes}
        </p>
      )}
    </div>
  );
};

const buildEarthquakeSummary = (quake: EarthquakeFeature) => {
  const magnitudeLabel =
    typeof quake.magnitude === "number" ? `M${quake.magnitude.toFixed(1)}${quake.magnitudeType ? ` ${quake.magnitudeType}` : ""}` : "Unknown magnitude";
  const depthLabel = typeof quake.depthKm === "number" ? `${quake.depthKm.toFixed(1)} km depth` : "depth unknown";
  const timeLabel = quake.eventTime ?? "time unknown";
  return `${magnitudeLabel} (${depthLabel}) at ${timeLabel}.`;
};

const renderEarthquakePopup = (quake: EarthquakeFeature): ReactNode => {
  const rows: Array<[string, string]> = [
    ["Magnitude", typeof quake.magnitude === "number" ? `${quake.magnitude.toFixed(1)} ${quake.magnitudeType ?? ""}`.trim() : null],
    ["Depth", typeof quake.depthKm === "number" ? `${quake.depthKm.toFixed(1)} km` : null],
    ["Event time", quake.eventTime ?? null],
  ].filter(([, value]): value is string => Boolean(value));

  const coords: Array<[string, string]> = [];
  if (isFiniteNumber(quake.latitude) && isFiniteNumber(quake.longitude)) {
    coords.push(["Coordinates", `${quake.latitude!.toFixed(3)}, ${quake.longitude!.toFixed(3)}`]);
  }

  return (
    <div className="space-y-2 text-sm text-secondary">
      <div>
        <p className="text-sm font-semibold text-primary">{quake.eventLocationName ?? quake.eventLocationNameFr ?? "Recent earthquake"}</p>
      </div>
      <div className="space-y-1 text-[0.82rem]">
        {rows.map(([label, value]) => (
          <p key={`eq-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
        {coords.map(([label, value]) => (
          <p key={`eq-coord-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
      </div>
      {quake.eventLocationNameFr && (
        <p className="text-[0.75rem] text-tertiary">
          <span className="font-semibold text-primary">FR</span>: {quake.eventLocationNameFr}
        </p>
      )}
    </div>
  );
};

const buildHistoricalEarthquakeSummary = (quake: HistoricalEarthquakeFeature) => {
  const magnitudeLabel =
    typeof quake.magnitude === "number" ? `M${quake.magnitude.toFixed(1)}${quake.magnitudeType ? ` ${quake.magnitudeType}` : ""}` : "Unknown magnitude";
  const depthLabel = typeof quake.depth === "number" ? `${quake.depth.toFixed(1)} km depth` : "depth unknown";
  const dateLabel = quake.date ?? "unknown date";
  return `${magnitudeLabel} (${depthLabel}) on ${dateLabel}.`;
};

const renderHistoricalEarthquakePopup = (quake: HistoricalEarthquakeFeature): ReactNode => {
  const rows: Array<[string, string]> = [
    ["Magnitude", typeof quake.magnitude === "number" ? `${quake.magnitude.toFixed(1)} ${quake.magnitudeType ?? ""}`.trim() : null],
    ["Depth", typeof quake.depth === "number" ? `${quake.depth.toFixed(1)} km` : null],
    ["Date", quake.date ?? null],
  ].filter(([, value]): value is string => Boolean(value));

  const coords: Array<[string, string]> = [];
  if (isFiniteNumber(quake.latitude) && isFiniteNumber(quake.longitude)) {
    coords.push(["Coordinates", `${quake.latitude!.toFixed(3)}, ${quake.longitude!.toFixed(3)}`]);
  }

  return (
    <div className="space-y-2 text-sm text-secondary">
      <div>
        <p className="text-sm font-semibold text-primary">{quake.place ?? quake.id}</p>
        {quake.magnitudeCode ? (
          <p className="text-xs uppercase tracking-wide text-tertiary">{quake.magnitudeCode}</p>
        ) : null}
      </div>
      <div className="space-y-1 text-[0.82rem]">
        {rows.map(([label, value]) => (
          <p key={`heq-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
        {coords.map(([label, value]) => (
          <p key={`heq-coord-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
      </div>
    </div>
  );
};

const buildSeismographSummary = (station: SeismographStationFeature) => {
  const stationName = station.station ?? station.siteName ?? station.id;
  const network = station.network ? ` • ${station.network}` : "";
  const elevation =
    typeof station.elevation === "number" ? ` • ${station.elevation.toFixed(0)} m elevation` : "";
  return `${stationName}${network}${elevation}`;
};

const renderSeismographPopup = (station: SeismographStationFeature): ReactNode => {
  const rows: Array<[string, string]> = [
    ["Network", station.network ?? ""],
    ["Station", station.station ?? ""],
    ["Elevation", typeof station.elevation === "number" ? `${station.elevation.toFixed(0)} m` : ""],
    ["Seismograph", station.seismograph ?? ""],
    ["Start", station.startTime ?? ""],
    ["End", station.endTime ?? ""],
  ].filter(([, value]) => Boolean(value));
  return (
    <div className="space-y-2 text-sm text-secondary">
      <p className="text-sm font-semibold text-primary">{station.siteName ?? station.station ?? station.id}</p>
      <div className="space-y-1 text-[0.82rem]">
        {rows.map(([label, value]) => (
          <p key={`station-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
      </div>
    </div>
  );
};

const buildFaultSummary = (fault: GlobalFaultFeature) => {
  const name = fault.name ?? fault.catalogName ?? fault.id;
  const slip = fault.slipTypeSimple ?? fault.slipType ?? "Unknown slip";
  const lengthKm =
    typeof fault.length === "number" ? `${(fault.length / 1000).toFixed(1)} km` : "length unknown";
  return `${name} (${slip}) • ${lengthKm}`;
};

const renderFaultPopup = (fault: GlobalFaultFeature): ReactNode => {
  const rows: Array<[string, string]> = [
    ["Catalog", fault.catalogName ?? fault.catalogId ?? ""],
    ["Slip Type", fault.slipTypeSimple ?? fault.slipType ?? ""],
    ["Length", typeof fault.length === "number" ? `${(fault.length / 1000).toFixed(1)} km` : ""],
  ].filter(([, value]) => Boolean(value));
  return (
    <div className="space-y-2 text-sm text-secondary">
      <p className="text-sm font-semibold text-primary">{fault.name ?? fault.catalogName ?? fault.id}</p>
      <div className="space-y-1 text-[0.82rem]">
        {rows.map(([label, value]) => (
          <p key={`fault-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
      </div>
    </div>
  );
};

const formatDifferenceLabel = (value?: number | null, unit = "m") => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const formatted = value.toFixed(2);
  return `${formatted} ${unit}`;
};

const buildSurfaceWaterSummary = (station: HydrometricStationFeature) => {
  const name = station.stationName ?? station.stationNumber ?? station.id;
  const region = station.region ? ` • ${station.region}` : "";
  const level = typeof station.currentLevel === "number" ? `${station.currentLevel.toFixed(2)} m` : "unknown level";
  const flow =
    typeof station.currentFlow === "number" ? `${station.currentFlow.toFixed(2)} m³/s` : "unknown flow";
  const percentile = station.levelPercentile ? ` • Level percentile: ${station.levelPercentile}` : "";
  return `${name}${region} • ${level} • ${flow}${percentile}`;
};

const renderSurfaceWaterPopup = (station: HydrometricStationFeature): ReactNode => {
  const basicRows: Array<[string, string]> = [
    ["Station", station.stationName ?? station.stationNumber ?? station.id],
    ["Jurisdiction", station.region ?? ""],
    [
      "Current Level",
      typeof station.currentLevel === "number" ? `${station.currentLevel.toFixed(2)} m` : "",
    ],
    [
      "Current Flow",
      typeof station.currentFlow === "number" ? `${station.currentFlow.toFixed(2)} m³/s` : "",
    ],
    [
      "Change (Level)",
      station.levelChange !== null ? `${station.levelChange.toFixed(2)} m vs prev day` : "",
    ],
    [
      "Change (Flow)",
      station.flowChange !== null ? `${station.flowChange.toFixed(2)} m³/s vs prev day` : "",
    ],
    ["Level Percentile", station.levelPercentile ?? ""],
    ["Flow Percentile", station.flowPercentile ?? ""],
    ["Last Update", station.lastUpdate ?? ""],
  ].filter(([, value]) => Boolean(value));

  const comparisonRows: Array<[string, string]> = [
    ["Normal Level Today", station.normalLevelToday ? `${station.normalLevelToday.toFixed(2)} m` : ""],
    [
      "Difference vs Daily Avg Level",
      formatDifferenceLabel(station.diffFromMeanLevel),
    ],
    ["Mean Annual Level", station.meanAnnualLevel ? `${station.meanAnnualLevel.toFixed(2)} m` : ""],
    [
      "Difference vs Mean Annual Level",
      formatDifferenceLabel(station.diffFromAnnualLevel),
    ],
    [
      "Historical Max Level",
      station.historicalMaxLevel ? `${station.historicalMaxLevel.toFixed(2)} m` : "",
    ],
    [
      "Difference vs Historical Max",
      formatDifferenceLabel(station.diffFromHistoricalMaxLevel),
    ],
    [
      "Historical Min Level",
      station.historicalMinLevel ? `${station.historicalMinLevel.toFixed(2)} m` : "",
    ],
    [
      "Difference vs Historical Min",
      formatDifferenceLabel(station.diffFromHistoricalMinLevel),
    ],
    ["Normal Flow Today", station.normalFlowToday ? `${station.normalFlowToday.toFixed(2)} m³/s` : ""],
    [
      "Difference vs Daily Avg Flow",
      formatDifferenceLabel(station.diffFromMeanFlow, "m³/s"),
    ],
    ["Mean Annual Flow", station.meanAnnualFlow ? `${station.meanAnnualFlow.toFixed(2)} m³/s` : ""],
    [
      "Difference vs Mean Annual Flow",
      formatDifferenceLabel(station.diffFromAnnualFlow, "m³/s"),
    ],
    [
      "Historical Max Flow",
      station.historicalMaxFlow ? `${station.historicalMaxFlow.toFixed(2)} m³/s` : "",
    ],
    [
      "Difference vs Historical Max Flow",
      formatDifferenceLabel(station.diffFromHistoricalMaxFlow, "m³/s"),
    ],
    [
      "Historical Min Flow",
      station.historicalMinFlow ? `${station.historicalMinFlow.toFixed(2)} m³/s` : "",
    ],
    [
      "Difference vs Historical Min Flow",
      formatDifferenceLabel(station.diffFromHistoricalMinFlow, "m³/s"),
    ],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="space-y-3 text-sm text-secondary">
      <div>
        <p className="text-sm font-semibold text-primary">{station.stationName ?? station.stationNumber ?? station.id}</p>
        {station.url ? (
          <a
            href={station.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-sky-500 underline hover:text-sky-400"
          >
            View station details
          </a>
        ) : null}
      </div>
      <div className="space-y-1 text-[0.82rem]">
        {basicRows.map(([label, value]) => (
          <p key={`surface-basic-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
      </div>
      {comparisonRows.length > 0 && (
        <div className="space-y-1 text-[0.8rem]">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Comparisons</p>
          {comparisonRows.map(([label, value]) => (
            <p key={`surface-comparison-${label}`}>
              <span className="font-semibold text-primary">{label}</span>: {value}
            </p>
          ))}
        </div>
      )}
    </div>
  );
};

const formatDamMetric = (value?: number | null, unit?: string, fractionDigits = 0) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  return unit ? `${formatted} ${unit}` : formatted;
};

const formatDamPercent = (value?: number | null, fractionDigits = 1) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return `${value.toFixed(fractionDigits)}%`;
};

const buildDamReservoirSummary = (dam: DamReservoirFeature) => {
  const name = dam.damName ?? dam.reservoirName ?? dam.id;
  const useLabel = dam.mainUse ? ` • ${dam.mainUse}` : "";
  const locationParts = [dam.nearCity, dam.adminUnit, dam.country].filter(Boolean).join(", ");
  const locationLabel = locationParts ? ` • ${locationParts}` : "";
  const capacity = formatDamMetric(dam.capacityMcm, "MCM");
  const area = formatDamMetric(dam.areaSqKm, "km²", 1);
  const stats = [capacity, area].filter(Boolean).join(" • ");
  const statsLabel = stats ? ` • ${stats}` : "";
  return `${name}${useLabel}${locationLabel}${statsLabel}`;
};

const renderDamReservoirPopup = (dam: DamReservoirFeature): ReactNode => {
  const uses: string[] = [];
  const addUse = (value: string | null | undefined, label: string) => {
    if (!value) {
      return;
    }
    const normalized = value.trim().toLowerCase();
    if (!normalized || normalized === "0" || normalized === "no" || normalized === "n") {
      return;
    }
    uses.push(label);
  };
  addUse(dam.useElectric, "Hydropower");
  addUse(dam.useIrrigation, "Irrigation");
  addUse(dam.useSupply, "Water Supply");
  addUse(dam.useFloodControl, "Flood Control");
  addUse(dam.useRecreation, "Recreation");
  addUse(dam.useNavigation, "Navigation");
  addUse(dam.useFisheries, "Fisheries");
  addUse(dam.usePowerControl, "Power Control");
  addUse(dam.useLivestock, "Livestock");
  addUse(dam.useOther, "Other");

  const locationRows: Array<[string, string]> = [
    ["Reservoir", dam.reservoirName ?? ""],
    ["Dam", dam.damName ?? ""],
    ["River", dam.river ?? ""],
    ["Basin", [dam.subBasin, dam.mainBasin].filter(Boolean).join(" • ")],
    ["Nearby", dam.nearCity ?? dam.altCity ?? ""],
    ["Jurisdiction", [dam.adminUnit, dam.country].filter(Boolean).join(", ")],
    ["Year Built", dam.year ? String(dam.year) : ""],
    ["Timeline", dam.timeline ?? ""],
  ].filter(([, value]) => Boolean(value));

  const engineeringRows: Array<[string, string]> = [
    ["Dam Height", formatDamMetric(dam.damHeightMeters, "m") ?? formatDamMetric(dam.altHeightMeters, "m") ?? ""],
    ["Dam Length", formatDamMetric(dam.damLengthMeters, "m") ?? formatDamMetric(dam.altLengthMeters, "m") ?? ""],
    ["Elevation", formatDamMetric(dam.elevationMasl, "m ASL") ?? ""],
    ["Depth", formatDamMetric(dam.depthMeters, "m") ?? ""],
  ].filter(([, value]) => Boolean(value));

  const hydrologyRows: Array<[string, string]> = [
    ["Capacity", formatDamMetric(dam.capacityMcm, "MCM") ?? ""],
    ["Surface Area", formatDamMetric(dam.areaSqKm, "km²", 1) ?? ""],
    ["Catchment", formatDamMetric(dam.catchmentSqKm, "km²") ?? ""],
    ["Avg Discharge", formatDamMetric(dam.dischargeAvgLs, "L/s") ?? ""],
    ["Degree of Regulation", formatDamPercent(dam.dorPercent) ?? ""],
    ["Representative Area", formatDamMetric(dam.areaRepresentative, "km²", 1) ?? ""],
  ].filter(([, value]) => Boolean(value));

  const metadataRows: Array<[string, string]> = [
    ["Main Use", dam.mainUse ?? ""],
    ["Additional Uses", uses.join(", ")],
    ["Data Source", dam.dataInfo ?? dam.polygonSource ?? ""],
    ["Quality", dam.quality ?? ""],
    ["Editor", dam.editor ?? ""],
  ].filter(([, value]) => Boolean(value));

  return (
    <div className="space-y-3 text-sm text-secondary">
      <div>
        <p className="text-sm font-semibold text-primary">{dam.damName ?? dam.reservoirName ?? dam.id}</p>
        {dam.url ? (
          <a
            href={dam.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-emerald-500 underline hover:text-emerald-400"
          >
            View dataset record
          </a>
        ) : null}
      </div>
      {locationRows.length > 0 && (
        <div className="space-y-1 text-[0.82rem]">
          {locationRows.map(([label, value]) => (
            <p key={`dam-location-${label}`}>
              <span className="font-semibold text-primary">{label}</span>: {value}
            </p>
          ))}
        </div>
      )}
      {engineeringRows.length > 0 && (
        <div className="space-y-1 text-[0.8rem]">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Structure</p>
          {engineeringRows.map(([label, value]) => (
            <p key={`dam-structure-${label}`}>
              <span className="font-semibold text-primary">{label}</span>: {value}
            </p>
          ))}
        </div>
      )}
      {hydrologyRows.length > 0 && (
        <div className="space-y-1 text-[0.8rem]">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Water & Capacity</p>
          {hydrologyRows.map(([label, value]) => (
            <p key={`dam-hydro-${label}`}>
              <span className="font-semibold text-primary">{label}</span>: {value}
            </p>
          ))}
        </div>
      )}
      {metadataRows.length > 0 && (
        <div className="space-y-1 text-[0.8rem]">
          <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">Operations & Metadata</p>
          {metadataRows.map(([label, value]) => (
            <p key={`dam-metadata-${label}`}>
              <span className="font-semibold text-primary">{label}</span>: {value}
            </p>
          ))}
        </div>
      )}
      {dam.comments ? <p className="text-xs italic text-tertiary">{dam.comments}</p> : null}
    </div>
  );
};

const renderHistoricalPerimeterPopup = (perimeter: HistoricalPerimeterFeature): ReactNode => {
  const rows: Array<[string, string | null]> = [
    ["Year", perimeter.year],
    ["Hotspot Count", perimeter.hcount ? formatCount(perimeter.hcount) : null],
    ["Area", perimeter.area ? `${formatPerimeterAreaLabel(perimeter.area)} hectares` : null],
    ["First Observed", perimeter.firstDate ?? perimeter.properties?.FIRSTDATE ?? null],
    ["Last Update", perimeter.lastDate ?? perimeter.properties?.LASTDATE ?? null],
    ["Consistency ID", perimeter.consisId ? String(perimeter.consisId) : null],
    ["UID", perimeter.uid ? String(perimeter.uid) : null],
  ].filter(([, value]) => Boolean(value));
  return (
    <div className="space-y-2 text-sm text-secondary">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-primary">{perimeter.year ?? "Historical Perimeter"}</p>
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: perimeter.color || "#facc15" }}
          aria-hidden="true"
        />
      </div>
      <div className="space-y-1 text-[0.82rem]">
        {rows.map(([label, value]) => (
          <p key={`historical-perimeter-${label}`}>
            <span className="font-semibold text-primary">{label}</span>: {value}
          </p>
        ))}
      </div>
    </div>
  );
};

const WEATHER_ALERT_TYPE_STYLES = {
  warning: { fill: "#dc2626", outline: "#dc2626" },
  watch: { fill: "#f97316", outline: "#f97316" },
  advisory: { fill: "#facc15", outline: "#facc15" },
  statement: { fill: "#38bdf8", outline: "#38bdf8" },
  summary: { fill: "#a855f7", outline: "#a855f7" },
  default: { fill: "#A1D9E0", outline: "#78c3cb" },
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
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(() =>
    MAP_LAYER_CONFIGS.reduce<Record<string, boolean>>((acc, layer) => {
      acc[layer.id] = false;
      return acc;
    }, {}),
  );
  const [layerPageIndex, setLayerPageIndex] = useState(0);
  const [mapZoom, setMapZoom] = useState<number>(MAP_INITIAL_VIEW_STATE.zoom);
  const [currentBounds, setCurrentBounds] = useState<
    | {
        sw: { lng: number; lat: number };
        ne: { lng: number; lat: number };
      }
    | null
  >(null);
  const { layerDataState, setActiveFeature: setLayerActiveFeature } = useDataLayerManager(
    layerVisibility,
    mapZoom,
    currentBounds,
  );
  const [activeCamera, setActiveCamera] = useState<OttawaCameraFeature | null>(null);
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
  const firstAlertsLayerState = layerDataState["first-alerts"] as DataLayerRuntimeState<FirstAlertFeature>;
  const wildfireLayerState = layerDataState["active-wildfires"] as DataLayerRuntimeState<WildfireFeature>;
  const borderEntryLayerState = layerDataState["border-entries"] as DataLayerRuntimeState<BorderEntryFeature>;
  const fireDangerLayerState = layerDataState["fire-danger"] as DataLayerRuntimeState<FireDangerFeature>;
  const perimetersLayerState = layerDataState["perimeters"] as DataLayerRuntimeState<PerimeterFeature>;
  const historicalPerimeterLayerState =
    layerDataState["historical-perimeters"] as DataLayerRuntimeState<HistoricalPerimeterFeature>;
  const aerodromeLayerState = layerDataState["aerodromes"] as DataLayerRuntimeState<AerodromeFeature>;
  const railwayLayerState = layerDataState["railways"] as DataLayerRuntimeState<RailwayFeature>;
  const ferryRoutesLayerState = layerDataState["ferry-routes"] as DataLayerRuntimeState<FerryRouteFeature>;
  const highwayLayerState = layerDataState["highways"] as DataLayerRuntimeState<HighwayFeature>;
  const healthcareLayerState =
    layerDataState["healthcare-facilities"] as DataLayerRuntimeState<HealthcareFacilityFeature>;
  const energyInfrastructureLayerState =
    layerDataState["energy-infrastructure"] as DataLayerRuntimeState<EnergyInfrastructureFeature>;
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
  const remoteCommunitiesLayerState = layerDataState["remote-communities"] as DataLayerRuntimeState<RemoteCommunityFeature>;
  const nationalParksLayerState = layerDataState["national-parks"] as DataLayerRuntimeState<NationalParkFeature>;
  const earthquakesLayerState = layerDataState["recent-earthquakes"] as DataLayerRuntimeState<EarthquakeFeature>;
  const historicalEarthquakesLayerState =
    layerDataState["historical-earthquakes"] as DataLayerRuntimeState<HistoricalEarthquakeFeature>;
  const seismographLayerState =
    layerDataState["seismograph-stations"] as DataLayerRuntimeState<SeismographStationFeature>;
  const globalFaultLayerState =
    layerDataState["global-active-faults"] as DataLayerRuntimeState<GlobalFaultFeature>;
  const surfaceWaterLayerState =
    layerDataState["surface-water-levels"] as DataLayerRuntimeState<HydrometricStationFeature>;
  const damsReservoirLayerState =
    layerDataState["dams-reservoirs"] as DataLayerRuntimeState<DamReservoirFeature>;
  const dobLayerEnabled = Boolean(layerVisibility["dob-incidents"]);
  const firstAlertsLayerEnabled = Boolean(layerVisibility["first-alerts"]);
  const wildfireLayerEnabled = Boolean(layerVisibility["active-wildfires"]);
  const borderEntriesEnabled = Boolean(layerVisibility["border-entries"]);
  const fireDangerLayerEnabled = Boolean(layerVisibility["fire-danger"]);
  const perimetersLayerEnabled = Boolean(layerVisibility["perimeters"]);
  const historicalPerimetersEnabled = Boolean(layerVisibility["historical-perimeters"]);
  const aerodromeLayerEnabled = Boolean(layerVisibility["aerodromes"]);
  const railwayLayerEnabled = Boolean(layerVisibility["railways"]);
  const ferryRoutesLayerEnabled = Boolean(layerVisibility["ferry-routes"]);
  const highwayLayerEnabled = Boolean(layerVisibility["highways"]);
  const healthcareLayerEnabled = Boolean(layerVisibility["healthcare-facilities"]);
  const energyInfrastructureLayerEnabled = Boolean(layerVisibility["energy-infrastructure"]);
  const hurricaneLayerEnabled = Boolean(layerVisibility["active-hurricanes"]);
  const recentHurricanesEnabled = Boolean(layerVisibility["recent-hurricanes"]);
  const hydrometricLayerEnabled = Boolean(layerVisibility["hydrometric-stations"]);
  const buildingFootprintsEnabled = Boolean(layerVisibility["building-footprints"]);
  const propertyBoundariesEnabled = Boolean(layerVisibility["property-boundaries"]);
  const indigenousBoundariesEnabled = Boolean(layerVisibility["indigenous-land-boundaries"]);
  const nationalParksEnabled = Boolean(layerVisibility["national-parks"]);
  const chcResponseEnabled = Boolean(layerVisibility["chc-response-zone"]);
  const weatherAlertsEnabled = Boolean(layerVisibility["environment-canada-weather-alerts"]);
  const sourcesLayerEnabled = Boolean(layerVisibility["sources"]);
  const inuitCommunitiesEnabled = Boolean(layerVisibility["inuit-communities"]);
  const remoteCommunitiesEnabled = Boolean(layerVisibility["remote-communities"]);
  const earthquakesLayerEnabled = Boolean(layerVisibility["recent-earthquakes"]);
  const historicalEarthquakesEnabled = Boolean(layerVisibility["historical-earthquakes"]);
  const seismographLayerEnabled = Boolean(layerVisibility["seismograph-stations"]);
  const globalFaultsEnabled = Boolean(layerVisibility["global-active-faults"]);
  const surfaceWaterLayerEnabled = Boolean(layerVisibility["surface-water-levels"]);
  const damsReservoirLayerEnabled = Boolean(layerVisibility["dams-reservoirs"]);
  const showOttawaCameras = Boolean(layerVisibility[CAMERA_LAYER_ID]);
  const visibleDobIncidents = useMemo(() => (dobLayerEnabled ? dobLayerState.data : []), [dobLayerEnabled, dobLayerState.data]);
  const visibleFirstAlerts = useMemo(
    () =>
      firstAlertsLayerEnabled
        ? firstAlertsLayerState.data.filter(
            (alert) => isFiniteNumber(alert.longitude) && isFiniteNumber(alert.latitude),
          )
        : [],
    [firstAlertsLayerEnabled, firstAlertsLayerState.data],
  );
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
  const visibleHistoricalPerimeters = useMemo(
    () => (historicalPerimetersEnabled ? historicalPerimeterLayerState.data : []),
    [historicalPerimetersEnabled, historicalPerimeterLayerState.data],
  );
  const visibleAerodromes = useMemo(
    () => (aerodromeLayerEnabled ? aerodromeLayerState.data : []),
    [aerodromeLayerEnabled, aerodromeLayerState.data],
  );
  const visibleRailways = useMemo(
    () => (railwayLayerEnabled ? railwayLayerState.data : []),
    [railwayLayerEnabled, railwayLayerState.data],
  );
  const visibleFerryRoutes = useMemo(
    () => (ferryRoutesLayerEnabled ? ferryRoutesLayerState.data : []),
    [ferryRoutesLayerEnabled, ferryRoutesLayerState.data],
  );
  const visibleHighways = useMemo(
    () => (highwayLayerEnabled ? highwayLayerState.data : []),
    [highwayLayerEnabled, highwayLayerState.data],
  );
  const visibleHealthcareFacilities = useMemo(() => {
    if (!healthcareLayerEnabled || mapZoom < HEALTHCARE_MARKER_MIN_ZOOM) {
      return [];
    }
    const base = healthcareLayerState.data.filter(
      (facility) => isFiniteNumber(facility.longitude) && isFiniteNumber(facility.latitude),
    );
    if (!currentBounds) {
      return base;
    }
    return base.filter((facility) => {
      const lng = facility.longitude as number;
      const lat = facility.latitude as number;
      return (
        lng >= currentBounds.sw.lng &&
        lng <= currentBounds.ne.lng &&
        lat >= currentBounds.sw.lat &&
        lat <= currentBounds.ne.lat
      );
    });
  }, [currentBounds, healthcareLayerEnabled, healthcareLayerState.data]);
  const visibleEnergyInfrastructure = useMemo(
    () =>
      energyInfrastructureLayerEnabled
        ? energyInfrastructureLayerState.data.filter(
            (site) => isFiniteNumber(site.longitude) && isFiniteNumber(site.latitude),
          )
        : [],
    [energyInfrastructureLayerEnabled, energyInfrastructureLayerState.data],
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
    () => {
      if (!hydrometricLayerEnabled || mapZoom < HEALTHCARE_MARKER_MIN_ZOOM) {
        return [];
      }
      if (!currentBounds) {
        return hydrometricLayerState.data;
      }
      return hydrometricLayerState.data.filter((station) => {
        if (!isFiniteNumber(station.longitude) || !isFiniteNumber(station.latitude)) {
          return false;
        }
        return (
          station.longitude >= currentBounds.sw.lng &&
          station.longitude <= currentBounds.ne.lng &&
          station.latitude >= currentBounds.sw.lat &&
          station.latitude <= currentBounds.ne.lat
        );
      });
    },
    [currentBounds, hydrometricLayerEnabled, hydrometricLayerState.data, mapZoom],
  );
  const visibleSurfaceWaterStations = useMemo(() => {
    if (!surfaceWaterLayerEnabled || mapZoom < HEALTHCARE_MARKER_MIN_ZOOM) {
      return [];
    }
    return surfaceWaterLayerState.data.filter(
      (station) => isFiniteNumber(station.longitude) && isFiniteNumber(station.latitude),
    );
  }, [surfaceWaterLayerEnabled, surfaceWaterLayerState.data, mapZoom]);
  const visibleDamsReservoirs = useMemo(() => {
    if (!damsReservoirLayerEnabled || mapZoom < CONTEXT_POLYGON_MIN_ZOOM) {
      return [];
    }
    if (!currentBounds) {
      return damsReservoirLayerState.data;
    }
    return damsReservoirLayerState.data.filter((dam) => {
      const coords = getFeatureCoordinates("dams-reservoirs", dam);
      if (!coords) {
        return false;
      }
      return (
        coords.longitude >= currentBounds.sw.lng &&
        coords.longitude <= currentBounds.ne.lng &&
        coords.latitude >= currentBounds.sw.lat &&
        coords.latitude <= currentBounds.ne.lat
      );
    });
  }, [currentBounds, damsReservoirLayerEnabled, damsReservoirLayerState.data, mapZoom]);
  const visibleBuildingFootprints = useMemo(
    () => (buildingFootprintsEnabled ? buildingFootprintLayerState.data : []),
    [buildingFootprintsEnabled, buildingFootprintLayerState.data],
  );
  const visiblePropertyBoundaries = useMemo(
    () => (propertyBoundariesEnabled ? propertyBoundaryLayerState.data : []),
    [propertyBoundariesEnabled, propertyBoundaryLayerState.data],
  );
  const visibleIndigenousBoundaries = useMemo(
    () => {
      if (!indigenousBoundariesEnabled || mapZoom < CONTEXT_POLYGON_MIN_ZOOM) {
        return [];
      }
      if (!currentBounds) {
        return indigenousBoundaryLayerState.data;
      }
      return indigenousBoundaryLayerState.data.filter((boundary) => {
        const coords = getFeatureCoordinates("indigenous-land-boundaries", boundary);
        if (!coords) {
          return false;
        }
        return (
          coords.longitude >= currentBounds.sw.lng &&
          coords.longitude <= currentBounds.ne.lng &&
          coords.latitude >= currentBounds.sw.lat &&
          coords.latitude <= currentBounds.ne.lat
        );
      });
    },
    [currentBounds, indigenousBoundariesEnabled, indigenousBoundaryLayerState.data, mapZoom],
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
  const visibleRemoteCommunities = useMemo(
    () => (remoteCommunitiesEnabled ? remoteCommunitiesLayerState.data : []),
    [remoteCommunitiesEnabled, remoteCommunitiesLayerState.data],
  );
  const visibleEarthquakes = useMemo(
    () =>
      earthquakesLayerEnabled
        ? earthquakesLayerState.data.filter(
            (quake) => isFiniteNumber(quake.longitude) && isFiniteNumber(quake.latitude),
          )
        : [],
    [earthquakesLayerEnabled, earthquakesLayerState.data],
  );
  const visibleHistoricalEarthquakes = useMemo(
    () =>
      historicalEarthquakesEnabled
        ? historicalEarthquakesLayerState.data.filter(
            (quake) => isFiniteNumber(quake.longitude) && isFiniteNumber(quake.latitude),
          )
        : [],
    [historicalEarthquakesEnabled, historicalEarthquakesLayerState.data],
  );
  const visibleSeismographStations = useMemo(
    () =>
      seismographLayerEnabled
        ? seismographLayerState.data.filter(
            (station) => isFiniteNumber(station.longitude) && isFiniteNumber(station.latitude),
          )
        : [],
    [seismographLayerEnabled, seismographLayerState.data],
  );
  const globalFaultsGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: globalFaultLayerState.data
        .map((fault) => {
          if (!fault.geometry) {
            return null;
          }
          const color = getGlobalFaultColor(fault);
          return {
            type: "Feature",
            geometry: fault.geometry,
            properties: {
              id: fault.id,
              name: fault.name,
              slipType: fault.slipType,
              slipTypeSimple: fault.slipTypeSimple,
              length: fault.length,
              color,
            },
          } satisfies Feature;
        })
        .filter((feature): feature is Feature => Boolean(feature)),
    };
  }, [globalFaultLayerState.data]);
  const visibleNationalParks = useMemo(
    () => (nationalParksEnabled ? nationalParksLayerState.data : []),
    [nationalParksEnabled, nationalParksLayerState.data],
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
  const activeFirstAlert = useMemo(() => {
    if (!firstAlertsLayerState.activeFeatureId || !firstAlertsLayerEnabled) {
      return null;
    }
    return (
      firstAlertsLayerState.data.find((alert) => alert.id === firstAlertsLayerState.activeFeatureId) ?? null
    );
  }, [firstAlertsLayerEnabled, firstAlertsLayerState.activeFeatureId, firstAlertsLayerState.data]);
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
  const activeFirstAlertSummary = useMemo(
    () => (activeFirstAlert ? buildFirstAlertSummary(activeFirstAlert) : null),
    [activeFirstAlert],
  );
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
  const activeHistoricalPerimeter = useMemo(() => {
    if (!historicalPerimeterLayerState.activeFeatureId || !historicalPerimetersEnabled) {
      return null;
    }
    return (
      historicalPerimeterLayerState.data.find(
        (perimeter) => perimeter.id === historicalPerimeterLayerState.activeFeatureId,
      ) ?? null
    );
  }, [
    historicalPerimeterLayerState.activeFeatureId,
    historicalPerimeterLayerState.data,
    historicalPerimetersEnabled,
  ]);
  const activeInuitCommunity = useMemo(() => {
    if (!inuitCommunitiesLayerState.activeFeatureId || !inuitCommunitiesEnabled) {
      return null;
    }
    return inuitCommunitiesLayerState.data.find((c) => c.id === inuitCommunitiesLayerState.activeFeatureId) ?? null;
  }, [inuitCommunitiesLayerState.activeFeatureId, inuitCommunitiesLayerState.data, inuitCommunitiesEnabled]);
  const activeRemoteCommunity = useMemo(() => {
    if (!remoteCommunitiesLayerState.activeFeatureId || !remoteCommunitiesEnabled) {
      return null;
    }
    return (
      remoteCommunitiesLayerState.data.find((c) => c.id === remoteCommunitiesLayerState.activeFeatureId) ?? null
    );
  }, [remoteCommunitiesLayerState.activeFeatureId, remoteCommunitiesLayerState.data, remoteCommunitiesEnabled]);
  const activeEarthquake = useMemo(() => {
    if (!earthquakesLayerState.activeFeatureId || !earthquakesLayerEnabled) {
      return null;
    }
    return (
      earthquakesLayerState.data.find((quake) => quake.id === earthquakesLayerState.activeFeatureId) ?? null
    );
  }, [earthquakesLayerEnabled, earthquakesLayerState.activeFeatureId, earthquakesLayerState.data]);
  const activeHistoricalEarthquake = useMemo(() => {
    if (!historicalEarthquakesLayerState.activeFeatureId || !historicalEarthquakesEnabled) {
      return null;
    }
    return (
      historicalEarthquakesLayerState.data.find(
        (quake) => quake.id === historicalEarthquakesLayerState.activeFeatureId,
      ) ?? null
    );
  }, [
    historicalEarthquakesEnabled,
    historicalEarthquakesLayerState.activeFeatureId,
    historicalEarthquakesLayerState.data,
  ]);
  const activeSeismographStation = useMemo(() => {
    if (!seismographLayerState.activeFeatureId || !seismographLayerEnabled) {
      return null;
    }
    return (
      seismographLayerState.data.find((station) => station.id === seismographLayerState.activeFeatureId) ?? null
    );
  }, [seismographLayerState.activeFeatureId, seismographLayerState.data, seismographLayerEnabled]);
  const activeSurfaceWaterStation = useMemo(() => {
    if (!surfaceWaterLayerState.activeFeatureId || !surfaceWaterLayerEnabled) {
      return null;
    }
    return (
      surfaceWaterLayerState.data.find(
        (station) => station.id === surfaceWaterLayerState.activeFeatureId,
      ) ?? null
    );
  }, [surfaceWaterLayerState.activeFeatureId, surfaceWaterLayerState.data, surfaceWaterLayerEnabled]);
  const activeDamReservoir = useMemo(() => {
    if (!damsReservoirLayerState.activeFeatureId || !damsReservoirLayerEnabled) {
      return null;
    }
    return (
      damsReservoirLayerState.data.find(
        (feature) => feature.id === damsReservoirLayerState.activeFeatureId,
      ) ?? null
    );
  }, [damsReservoirLayerEnabled, damsReservoirLayerState.activeFeatureId, damsReservoirLayerState.data]);
  const activeDamReservoirSummary = activeDamReservoir ? buildDamReservoirSummary(activeDamReservoir) : null;
  const activeDamReservoirCentroid = useMemo(() => {
    if (!activeDamReservoir) {
      return null;
    }
    if (isFiniteNumber(activeDamReservoir.longitude) && isFiniteNumber(activeDamReservoir.latitude)) {
      return { longitude: activeDamReservoir.longitude, latitude: activeDamReservoir.latitude };
    }
    if (activeDamReservoir.geometry) {
      return computeGeoCentroid(activeDamReservoir.geometry);
    }
    return null;
  }, [activeDamReservoir]);
  const activeGlobalFault = useMemo(() => {
    if (!globalFaultLayerState.activeFeatureId || !globalFaultsEnabled) {
      return null;
    }
    return (
      globalFaultLayerState.data.find((fault) => fault.id === globalFaultLayerState.activeFeatureId) ?? null
    );
  }, [globalFaultLayerState.activeFeatureId, globalFaultLayerState.data, globalFaultsEnabled]);
  const activeGlobalFaultSummary = activeGlobalFault ? buildFaultSummary(activeGlobalFault) : null;
  const activeGlobalFaultCentroid = useMemo(() => {
    if (!activeGlobalFault?.geometry) {
      return null;
    }
    return computeGeoCentroid(activeGlobalFault.geometry);
  }, [activeGlobalFault]);
  const activeGlobalFaultColor = useMemo(
    () => (activeGlobalFault ? getGlobalFaultColor(activeGlobalFault) : "#ef4444"),
    [activeGlobalFault],
  );
  const activeNationalPark = useMemo(() => {
    if (!nationalParksLayerState.activeFeatureId || !nationalParksEnabled) {
      return null;
    }
    return nationalParksLayerState.data.find((f) => f.id === nationalParksLayerState.activeFeatureId) ?? null;
  }, [nationalParksLayerState.activeFeatureId, nationalParksLayerState.data, nationalParksEnabled]);
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
  const activeHealthcareFacility = useMemo(() => {
    if (!healthcareLayerState.activeFeatureId || !healthcareLayerEnabled) {
      return null;
    }
    return (
      healthcareLayerState.data.find((facility) => facility.id === healthcareLayerState.activeFeatureId) ?? null
    );
  }, [healthcareLayerEnabled, healthcareLayerState.activeFeatureId, healthcareLayerState.data]);
  const activeEnergyInfrastructure = useMemo(() => {
    if (!energyInfrastructureLayerState.activeFeatureId || !energyInfrastructureLayerEnabled) {
      return null;
    }
    return (
      energyInfrastructureLayerState.data.find(
        (site) => site.id === energyInfrastructureLayerState.activeFeatureId,
      ) ?? null
    );
  }, [
    energyInfrastructureLayerEnabled,
    energyInfrastructureLayerState.activeFeatureId,
    energyInfrastructureLayerState.data,
  ]);
  const activeHealthcareSummary = useMemo(
    () => (activeHealthcareFacility ? buildHealthcareSummary(activeHealthcareFacility) : null),
    [activeHealthcareFacility],
  );
  const activeEnergyInfrastructureSummary = useMemo(
    () => (activeEnergyInfrastructure ? buildEnergyInfrastructureSummary(activeEnergyInfrastructure) : null),
    [activeEnergyInfrastructure],
  );
  const activeFerryRoute = useMemo(() => {
    if (!ferryRoutesLayerState.activeFeatureId || !ferryRoutesLayerEnabled) {
      return null;
    }
    return (
      ferryRoutesLayerState.data.find((route) => route.id === ferryRoutesLayerState.activeFeatureId) ?? null
    );
  }, [ferryRoutesLayerEnabled, ferryRoutesLayerState.activeFeatureId, ferryRoutesLayerState.data]);
  const activeFerryRouteSummary = useMemo(
    () => (activeFerryRoute ? buildFerryRouteSummary(activeFerryRoute) : null),
    [activeFerryRoute],
  );
  const activeFerryRouteCoordinates = useMemo(() => {
    if (!activeFerryRoute) {
      return null;
    }
    if (activeFerryRoute.centroid) {
      return activeFerryRoute.centroid;
    }
    if (activeFerryRoute.geometry) {
      return computeGeoCentroid(activeFerryRoute.geometry);
    }
    return null;
  }, [activeFerryRoute]);
  const activeFerryRouteLengthLabel = useMemo(() => {
    if (!activeFerryRoute?.lengthMeters || !Number.isFinite(activeFerryRoute.lengthMeters)) {
      return null;
    }
    const km = activeFerryRoute.lengthMeters / 1_000;
    const formatted = km.toLocaleString(undefined, {
      minimumFractionDigits: km < 10 ? 2 : 1,
      maximumFractionDigits: km < 10 ? 2 : 1,
    });
    return `${formatted} km`;
  }, [activeFerryRoute]);
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
  const activeHistoricalPerimeterSummary = useMemo(
    () => (activeHistoricalPerimeter ? buildFeatureSummary("historical-perimeters", activeHistoricalPerimeter) : null),
    [activeHistoricalPerimeter],
  );
  const activeHistoricalPerimeterCentroid = useMemo(() => {
    if (!activeHistoricalPerimeter?.geometry) {
      return null;
    }
    return computeGeoCentroid(activeHistoricalPerimeter.geometry);
  }, [activeHistoricalPerimeter]);
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
  const ferryRoutePaint = useMemo(
    () => ({
      color: isDarkMode ? "#bae6fd" : "#0ea5e9",
      activeColor: isDarkMode ? "#7dd3fc" : "#0369a1",
      activeWidth: isDarkMode ? 2.6 : 2,
      defaultWidth: isDarkMode ? 1.9 : 1.5,
      emissive: isDarkMode ? 0.9 : 0.3,
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
  const historicalPerimetersGeoJson = useMemo<FeatureCollection>(() => {
    if (!historicalPerimetersEnabled || visibleHistoricalPerimeters.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleHistoricalPerimeters.map((perimeter) => ({
        type: "Feature",
        geometry: perimeter.geometry,
        properties: {
          id: perimeter.id,
          color: perimeter.color,
        },
      })),
    };
  }, [historicalPerimetersEnabled, visibleHistoricalPerimeters]);
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
  const historicalPerimeterInteractiveLayerIds = useMemo(() => {
    if (!historicalPerimetersEnabled || historicalPerimetersGeoJson.features.length === 0) {
      return [];
    }
    return [HISTORICAL_PERIMETERS_FILL_LAYER_ID];
  }, [historicalPerimetersEnabled, historicalPerimetersGeoJson.features.length]);
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
  const ferryRoutesGeoJson = useMemo<FeatureCollection>(() => {
    if (!ferryRoutesLayerEnabled || visibleFerryRoutes.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleFerryRoutes
        .filter((route) => route.geometry)
        .map((route) => ({
          type: "Feature",
          geometry: route.geometry as Geometry,
          properties: {
            id: route.id,
            name: route.objName ?? route.nativeName ?? route.encName,
          },
        })),
    };
  }, [ferryRoutesLayerEnabled, visibleFerryRoutes]);
  const railwayInteractiveLayerIds = useMemo(() => {
    if (!railwayLayerEnabled || railwayGeoJson.features.length === 0) {
      return [];
    }
    return [RAILWAYS_LINE_LAYER_ID];
  }, [railwayGeoJson.features.length, railwayLayerEnabled]);
  const ferryRoutesInteractiveLayerIds = useMemo(() => {
    if (!ferryRoutesLayerEnabled || ferryRoutesGeoJson.features.length === 0) {
      return [];
    }
    return [FERRY_ROUTES_LINE_LAYER_ID];
  }, [ferryRoutesGeoJson.features.length, ferryRoutesLayerEnabled]);
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
  const energyInfrastructureGeoJson = useMemo<FeatureCollection>(() => {
    if (!energyInfrastructureLayerEnabled || visibleEnergyInfrastructure.length === 0) {
      return { type: "FeatureCollection", features: [] };
    }
    return {
      type: "FeatureCollection",
      features: visibleEnergyInfrastructure
        .filter((site) => site.geometry)
        .map((site) => ({
          type: "Feature",
          geometry: site.geometry as Geometry,
          properties: { id: site.id, layerName: site.layerName },
        })),
    };
  }, [energyInfrastructureLayerEnabled, visibleEnergyInfrastructure]);
  const highwayInteractiveLayerIds = useMemo(() => {
    if (!highwayLayerEnabled || highwayGeoJson.features.length === 0) {
      return [];
    }
    return [HIGHWAYS_LINE_LAYER_ID];
  }, [highwayGeoJson.features.length, highwayLayerEnabled]);
  const energyInfrastructureInteractiveLayerIds = useMemo(() => {
    if (!energyInfrastructureLayerEnabled || energyInfrastructureGeoJson.features.length === 0) {
      return [];
    }
    return [];
  }, [energyInfrastructureGeoJson.features.length, energyInfrastructureLayerEnabled]);
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
  const damsReservoirGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: visibleDamsReservoirs
        .filter((feature) => feature.geometry)
        .map((feature) => ({
          type: "Feature",
          properties: { id: feature.id },
          geometry: feature.geometry as Geometry,
        })),
    };
  }, [visibleDamsReservoirs]);
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
  const nationalParksGeoJson = useMemo<FeatureCollection>(() => {
    return {
      type: "FeatureCollection",
      features: visibleNationalParks
        .filter((feature) => feature.geometry)
        .map((feature) => ({
          type: "Feature",
          properties: { id: feature.id },
          geometry: feature.geometry as Geometry,
        })),
    };
  }, [visibleNationalParks]);
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
  const damsReservoirInteractiveLayerIds = useMemo(() => {
    if (!damsReservoirLayerEnabled || damsReservoirGeoJson.features.length === 0) {
      return [];
    }
    return [DAMS_RESERVOIRS_FILL_LAYER_ID];
  }, [damsReservoirGeoJson.features.length, damsReservoirLayerEnabled]);
  const indigenousBoundaryInteractiveLayerIds = useMemo(() => {
    if (!indigenousBoundariesEnabled || indigenousBoundaryGeoJson.features.length === 0) {
      return [];
    }
    return [INDIGENOUS_BOUNDARIES_FILL_LAYER_ID];
  }, [indigenousBoundariesEnabled, indigenousBoundaryGeoJson.features.length]);
  const nationalParksInteractiveLayerIds = useMemo(() => {
    if (!nationalParksEnabled || nationalParksGeoJson.features.length === 0) {
      return [];
    }
    return [NATIONAL_PARKS_FILL_LAYER_ID];
  }, [nationalParksEnabled, nationalParksGeoJson.features.length]);
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
const globalFaultInteractiveLayerIds = useMemo(() => {
  if (!globalFaultsEnabled || globalFaultsGeoJson.features.length === 0) {
    return [];
  }
  return [GLOBAL_FAULTS_LAYER_ID];
}, [globalFaultsEnabled, globalFaultsGeoJson.features.length]);

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
    if (!layerVisibility["first-alerts"]) {
      setLayerActiveFeature("first-alerts", null);
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
    if (!layerVisibility["historical-perimeters"]) {
      setLayerActiveFeature("historical-perimeters", null);
    }
    if (!layerVisibility["aerodromes"]) {
      setLayerActiveFeature("aerodromes", null);
    }
    if (!layerVisibility["railways"]) {
      setLayerActiveFeature("railways", null);
    }
    if (!layerVisibility["healthcare-facilities"]) {
      setLayerActiveFeature("healthcare-facilities", null);
    }
    if (!layerVisibility["energy-infrastructure"]) {
      setLayerActiveFeature("energy-infrastructure", null);
    }
    if (!layerVisibility["ferry-routes"]) {
      setLayerActiveFeature("ferry-routes", null);
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
    if (!layerVisibility["surface-water-levels"]) {
      setLayerActiveFeature("surface-water-levels", null);
    }
    if (!layerVisibility["dams-reservoirs"]) {
      setLayerActiveFeature("dams-reservoirs", null);
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
    if (!layerVisibility["seismograph-stations"]) {
      setLayerActiveFeature("seismograph-stations", null);
    }
    if (!layerVisibility["global-active-faults"]) {
      setLayerActiveFeature("global-active-faults", null);
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
      const historicalPerimeterFeature = historicalPerimetersEnabled
        ? findFeature(HISTORICAL_PERIMETERS_FILL_LAYER_ID)
        : undefined;
      if (historicalPerimeterFeature?.properties?.id) {
        setLayerActiveFeature("historical-perimeters", String(historicalPerimeterFeature.properties.id));
        setLayerActiveFeature("perimeters", null);
        setLayerActiveFeature("fire-danger", null);
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
      const ferryRouteFeature = ferryRoutesLayerEnabled ? findFeature(FERRY_ROUTES_LINE_LAYER_ID) : undefined;
      if (ferryRouteFeature?.properties?.id) {
        setLayerActiveFeature("ferry-routes", String(ferryRouteFeature.properties.id));
        setLayerActiveFeature("railways", null);
        setLayerActiveFeature("highways", null);
        return;
      }
      const energyInfraFeature = energyInfrastructureLayerEnabled ? findFeature("energy-infrastructure-points") : undefined;
      if (energyInfraFeature?.properties?.id) {
        setLayerActiveFeature("energy-infrastructure", String(energyInfraFeature.properties.id));
        return;
      }
      const healthcareFeature = healthcareLayerEnabled ? findFeature("healthcare-facilities-marker") : undefined;
      if (healthcareFeature?.properties?.id) {
        setLayerActiveFeature("healthcare-facilities", String(healthcareFeature.properties.id));
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
      const damsReservoirFeature = damsReservoirLayerEnabled
        ? findFeature(DAMS_RESERVOIRS_FILL_LAYER_ID)
        : undefined;
      if (damsReservoirFeature?.properties?.id) {
        setLayerActiveFeature("dams-reservoirs", String(damsReservoirFeature.properties.id));
        setLayerActiveFeature("building-footprints", null);
        setLayerActiveFeature("property-boundaries", null);
        return;
      }
      const inuitFeature = inuitCommunitiesEnabled ? findFeature(INUIT_COMMUNITIES_LAYER_ID) : undefined;
      if (inuitFeature?.properties?.id) {
        setLayerActiveFeature("inuit-communities", String(inuitFeature.properties.id));
        setLayerActiveFeature("building-footprints", null);
        setLayerActiveFeature("property-boundaries", null);
        return;
      }
      const nationalParksFeature = nationalParksEnabled ? findFeature(NATIONAL_PARKS_FILL_LAYER_ID) : undefined;
      if (nationalParksFeature?.properties?.id) {
        setLayerActiveFeature("national-parks", String(nationalParksFeature.properties.id));
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
      const globalFaultFeature = globalFaultsEnabled ? findFeature(GLOBAL_FAULTS_LAYER_ID) : undefined;
      if (globalFaultFeature?.properties?.id) {
        setLayerActiveFeature("global-active-faults", String(globalFaultFeature.properties.id));
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
      if (ferryRoutesLayerState.activeFeatureId) {
        setLayerActiveFeature("ferry-routes", null);
      }
      if (healthcareLayerState.activeFeatureId) {
        setLayerActiveFeature("healthcare-facilities", null);
      }
      if (energyInfrastructureLayerState.activeFeatureId) {
        setLayerActiveFeature("energy-infrastructure", null);
      }
      if (highwayLayerState.activeFeatureId) {
        setLayerActiveFeature("highways", null);
      }
      if (nationalParksLayerState.activeFeatureId) {
        setLayerActiveFeature("national-parks", null);
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
      if (weatherAlertsLayerState.activeFeatureId) {
        setLayerActiveFeature("environment-canada-weather-alerts", null);
      }
      if (globalFaultLayerState.activeFeatureId) {
        setLayerActiveFeature("global-active-faults", null);
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
      ferryRoutesLayerEnabled,
      ferryRoutesLayerState.activeFeatureId,
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
    const bounds = mapRef.current?.getMap?.().getBounds?.();
    if (bounds) {
      setCurrentBounds({
        sw: { lng: bounds.getWest(), lat: bounds.getSouth() },
        ne: { lng: bounds.getEast(), lat: bounds.getNorth() },
      });
    }
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
                (firstAlertsLayerEnabled && (firstAlertsLayerState.loading || firstAlertsLayerState.error)) ||
                (wildfireLayerEnabled && (wildfireLayerState.loading || wildfireLayerState.error)) ||
                (borderEntriesEnabled && (borderEntryLayerState.loading || borderEntryLayerState.error)) ||
                (ferryRoutesLayerEnabled && (ferryRoutesLayerState.loading || ferryRoutesLayerState.error)) ||
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
                  {firstAlertsLayerEnabled && (firstAlertsLayerState.loading || firstAlertsLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {firstAlertsLayerState.loading ? "Loading First Alerts…" : firstAlertsLayerState.error}
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
                  {healthcareLayerEnabled && (healthcareLayerState.loading || healthcareLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {healthcareLayerState.loading ? "Loading healthcare facilities…" : healthcareLayerState.error}
                    </div>
                  )}
                  {energyInfrastructureLayerEnabled &&
                    (energyInfrastructureLayerState.loading || energyInfrastructureLayerState.error) && (
                      <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                        {energyInfrastructureLayerState.loading
                          ? "Loading energy infrastructure…"
                          : energyInfrastructureLayerState.error}
                      </div>
                    )}
                  {ferryRoutesLayerEnabled && (ferryRoutesLayerState.loading || ferryRoutesLayerState.error) && (
                    <div className="rounded-full bg-primary/95 px-3 py-1 text-xs font-semibold text-secondary shadow-md shadow-black/20">
                      {ferryRoutesLayerState.loading ? "Loading ferry routes…" : ferryRoutesLayerState.error}
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
                ref={(instance) => {
                  mapRef.current = instance;
                }}
                id="context-map"
                mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
                initialViewState={MAP_INITIAL_VIEW_STATE}
                mapStyle={mapStyleUrl}
                onLoad={handleMapLoad}
                onMove={(event) => {
                  setMapZoom(event.viewState.zoom);
                  const bounds = event.target.getBounds?.();
                  if (bounds) {
                    setCurrentBounds({
                      sw: { lng: bounds.getWest(), lat: bounds.getSouth() },
                      ne: { lng: bounds.getEast(), lat: bounds.getNorth() },
                    });
                  }
                }}
                onClick={handleMapClick}
                reuseMaps
                attributionControl={false}
                interactiveLayerIds={[
                  ...fireDangerInteractiveLayerIds,
                  ...perimetersInteractiveLayerIds,
                  ...historicalPerimeterInteractiveLayerIds,
                  ...railwayInteractiveLayerIds,
                  ...energyInfrastructureInteractiveLayerIds,
                  ...ferryRoutesInteractiveLayerIds,
                  ...highwayInteractiveLayerIds,
                  ...buildingFootprintInteractiveLayerIds,
                  ...propertyBoundaryInteractiveLayerIds,
                  ...damsReservoirInteractiveLayerIds,
                  ...indigenousBoundaryInteractiveLayerIds,
                  ...nationalParksInteractiveLayerIds,
                  ...nationalParksInteractiveLayerIds,
                  ...weatherAlertsInteractiveLayerIds,
                  ...chcResponseInteractiveLayerIds,
                  ...globalFaultInteractiveLayerIds,
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

                {historicalPerimetersEnabled && historicalPerimetersGeoJson.features.length > 0 && (
                  <Source id={HISTORICAL_PERIMETERS_SOURCE_ID} type="geojson" data={historicalPerimetersGeoJson}>
                    <Layer
                      id={HISTORICAL_PERIMETERS_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": ["coalesce", ["get", "color"], "#fde047"],
                        "fill-emissive-strength": historicalPerimetersPaint.fillEmissive,
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activeHistoricalPerimeter?.id ?? ""],
                          historicalPerimetersPaint.activeFillOpacity,
                          historicalPerimetersPaint.defaultFillOpacity,
                        ],
                      }}
                    />
                    <Layer
                      id={HISTORICAL_PERIMETERS_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": ["coalesce", ["get", "color"], "#ca8a04"],
                        "line-emissive-strength": historicalPerimetersPaint.outlineEmissive,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeHistoricalPerimeter?.id ?? ""],
                          historicalPerimetersPaint.activeOutlineWidth,
                          historicalPerimetersPaint.defaultOutlineWidth,
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

                {ferryRoutesLayerEnabled && ferryRoutesGeoJson.features.length > 0 && (
                  <Source id={FERRY_ROUTES_SOURCE_ID} type="geojson" data={ferryRoutesGeoJson}>
                    <Layer
                      id={FERRY_ROUTES_LINE_LAYER_ID}
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": [
                          "case",
                          ["==", ["get", "id"], activeFerryRoute?.id ?? ""],
                          ferryRoutePaint.activeColor,
                          ferryRoutePaint.color,
                        ],
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeFerryRoute?.id ?? ""],
                          ferryRoutePaint.activeWidth,
                          ferryRoutePaint.defaultWidth,
                        ],
                        "line-emissive-strength": ferryRoutePaint.emissive,
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
                {energyInfrastructureLayerEnabled && energyInfrastructureGeoJson.features.length > 0 && (
                  <Source id="energy-infrastructure-source" type="geojson" data={energyInfrastructureGeoJson}>
                    <Layer
                      id="energy-infrastructure-points"
                      type="circle"
                      paint={{
                        "circle-radius": 5,
                        "circle-color": "#7dd3fc",
                        "circle-stroke-color": "#0ea5e9",
                        "circle-stroke-width": 1.2,
                        "circle-emissive-strength": isDarkMode ? 0.8 : 0.2,
                        "circle-opacity": 0.9,
                      }}
                    />
                  </Source>
                )}

                {globalFaultsEnabled && globalFaultsGeoJson.features.length > 0 && (
                  <Source id={GLOBAL_FAULTS_SOURCE_ID} type="geojson" data={globalFaultsGeoJson}>
                    <Layer
                      id={GLOBAL_FAULTS_LAYER_ID}
                      type="line"
                      layout={{ "line-cap": "round", "line-join": "round" }}
                      paint={{
                        "line-color": GLOBAL_FAULT_PAINT.color,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeGlobalFault?.id ?? ""],
                          GLOBAL_FAULT_PAINT.activeWidth,
                          GLOBAL_FAULT_PAINT.width,
                        ],
                        "line-opacity": GLOBAL_FAULT_PAINT.opacity,
                        "line-emissive-strength": GLOBAL_FAULT_PAINT.emissive,
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
                {damsReservoirLayerEnabled && damsReservoirGeoJson.features.length > 0 && (
                  <Source id={DAMS_RESERVOIRS_SOURCE_ID} type="geojson" data={damsReservoirGeoJson}>
                    <Layer
                      id={DAMS_RESERVOIRS_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": damsReservoirPaint.fillColor,
                        "fill-opacity": [
                          "case",
                          ["==", ["get", "id"], activeDamReservoir?.id ?? ""],
                          Math.min(0.9, damsReservoirPaint.fillOpacity + 0.2),
                          damsReservoirPaint.fillOpacity,
                        ],
                        "fill-emissive-strength": damsReservoirPaint.fillEmissive,
                      }}
                    />
                    <Layer
                      id={DAMS_RESERVOIRS_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": damsReservoirPaint.outlineColor,
                        "line-width": [
                          "case",
                          ["==", ["get", "id"], activeDamReservoir?.id ?? ""],
                          damsReservoirPaint.outlineWidth + 0.4,
                          damsReservoirPaint.outlineWidth,
                        ],
                        "line-emissive-strength": damsReservoirPaint.outlineEmissive,
                        "line-opacity": 0.95,
                      }}
                    />
                  </Source>
                )}

                {nationalParksEnabled && nationalParksGeoJson.features.length > 0 && (
                  <Source id={NATIONAL_PARKS_SOURCE_ID} type="geojson" data={nationalParksGeoJson}>
                    <Layer
                      id={NATIONAL_PARKS_FILL_LAYER_ID}
                      type="fill"
                      paint={{
                        "fill-color": nationalParksPaint.fillColor,
                        "fill-opacity": nationalParksPaint.fillOpacity,
                        "fill-emissive-strength": nationalParksPaint.fillEmissive,
                      }}
                    />
                    <Layer
                      id={NATIONAL_PARKS_OUTLINE_LAYER_ID}
                      type="line"
                      paint={{
                        "line-color": nationalParksPaint.outlineColor,
                        "line-width": nationalParksPaint.outlineWidth,
                        "line-emissive-strength": nationalParksPaint.outlineEmissive,
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

                {earthquakesLayerEnabled &&
                  visibleEarthquakes.map((quake) => (
                    <Marker
                      key={`earthquake-${quake.id}`}
                      longitude={quake.longitude!}
                      latitude={quake.latitude!}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("recent-earthquakes", quake.id);
                        setActiveCamera(null);
                      }}
                    >
                      <button
                        type="button"
                        className={EARTHQUAKE_MARKER_CLASS}
                        aria-label={`View earthquake ${quake.eventLocationName ?? quake.id}`}
                        title={quake.eventLocationName ?? quake.id}
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

                {historicalEarthquakesEnabled &&
                  visibleHistoricalEarthquakes.map((quake) => (
                    <Marker
                      key={`historical-earthquake-${quake.id}`}
                      longitude={quake.longitude!}
                      latitude={quake.latitude!}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("historical-earthquakes", quake.id);
                        setActiveCamera(null);
                      }}
                    >
                      <button
                        type="button"
                        className={HISTORICAL_EARTHQUAKE_MARKER_CLASS}
                        aria-label={`View historical earthquake ${quake.place ?? quake.id}`}
                        title={quake.place ?? quake.id}
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

                {seismographLayerEnabled &&
                  visibleSeismographStations.map((station) => (
                    <Marker
                      key={`seismograph-${station.id}`}
                      longitude={station.longitude!}
                      latitude={station.latitude!}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("seismograph-stations", station.id);
                        setActiveCamera(null);
                      }}
                    >
                      <button
                        type="button"
                        className={SEISMOGRAPH_MARKER_CLASS}
                        aria-label={`View station ${station.station ?? station.siteName ?? station.id}`}
                        title={station.station ?? station.siteName ?? undefined}
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

                {inuitCommunitiesEnabled &&
                  visibleInuitCommunities.map((community) => {
                    if (!isFiniteNumber(community.longitude) || !isFiniteNumber(community.latitude)) {
                      return null;
                    }
                    return (
                      <Marker
                        key={community.id}
                        longitude={community.longitude!}
                        latitude={community.latitude!}
                        anchor="bottom"
                        onClick={(event) => {
                          event.originalEvent.stopPropagation();
                          setLayerActiveFeature("inuit-communities", community.id);
                          setActiveCamera(null);
                        }}
                      >
                        <button
                          type="button"
                          className="group -translate-y-1 rounded-full border border-white/70 bg-teal-600/90 p-1 shadow-lg shadow-teal-600/30 transition hover:bg-teal-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                          aria-label={`View ${community.name}`}
                        >
                          <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                        </button>
                      </Marker>
                    );
                  })}

                {remoteCommunitiesEnabled &&
                  visibleRemoteCommunities.map((community) => {
                    if (!isFiniteNumber(community.longitude) || !isFiniteNumber(community.latitude)) {
                      return null;
                    }
                    return (
                      <Marker
                        key={`remote-community-${community.id}`}
                        longitude={community.longitude!}
                        latitude={community.latitude!}
                        anchor="bottom"
                        onClick={(event) => {
                          event.originalEvent.stopPropagation();
                          setLayerActiveFeature("remote-communities", community.id);
                          setActiveCamera(null);
                        }}
                      >
                        <button
                          type="button"
                          className={REMOTE_COMMUNITY_MARKER_CLASS}
                          aria-label={`View ${community.name ?? "Remote community"}`}
                          title={community.name ?? "Remote community"}
                        >
                          <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                        </button>
                      </Marker>
                    );
                  })}

                {activeInuitCommunity && activeInuitCommunitySummary && isFiniteNumber(activeInuitCommunity.longitude) && isFiniteNumber(activeInuitCommunity.latitude) && (
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

                {activeRemoteCommunity &&
                  isFiniteNumber(activeRemoteCommunity.longitude) &&
                  isFiniteNumber(activeRemoteCommunity.latitude) && (
                    <Popup
                      longitude={activeRemoteCommunity.longitude!}
                      latitude={activeRemoteCommunity.latitude!}
                      anchor="bottom"
                      onClose={() => setLayerActiveFeature("remote-communities", null)}
                      closeButton={false}
                      maxWidth="320px"
                      className="z-20"
                    >
                      <PopupCard
                        title={activeRemoteCommunity.name ?? activeRemoteCommunity.id}
                        subtitle={activeRemoteCommunity.province ?? "Remote community"}
                        onClose={() => setLayerActiveFeature("remote-communities", null)}
                        accentColor={remoteCommunitiesPaint.circleColor}
                      >
                        {renderRemoteCommunityTooltip(activeRemoteCommunity)}
                      </PopupCard>
                    </Popup>
                  )}

                {activeEarthquake &&
                  isFiniteNumber(activeEarthquake.longitude) &&
                  isFiniteNumber(activeEarthquake.latitude) && (
                    <Popup
                      longitude={activeEarthquake.longitude!}
                      latitude={activeEarthquake.latitude!}
                      anchor="bottom"
                      onClose={() => setLayerActiveFeature("recent-earthquakes", null)}
                      closeButton={false}
                      maxWidth="320px"
                      className="z-20"
                    >
                      <PopupCard
                        title={activeEarthquake.eventLocationName ?? activeEarthquake.id}
                        subtitle={buildEarthquakeSummary(activeEarthquake)}
                        onClose={() => setLayerActiveFeature("recent-earthquakes", null)}
                      accentColor="#a16207"
                      >
                        {renderEarthquakePopup(activeEarthquake)}
                      </PopupCard>
                    </Popup>
                  )}

                {activeHistoricalEarthquake &&
                  isFiniteNumber(activeHistoricalEarthquake.longitude) &&
                  isFiniteNumber(activeHistoricalEarthquake.latitude) && (
                    <Popup
                      longitude={activeHistoricalEarthquake.longitude!}
                      latitude={activeHistoricalEarthquake.latitude!}
                      anchor="bottom"
                      onClose={() => setLayerActiveFeature("historical-earthquakes", null)}
                      closeButton={false}
                      maxWidth="320px"
                      className="z-20"
                    >
                      <PopupCard
                        title={activeHistoricalEarthquake.place ?? activeHistoricalEarthquake.id}
                        subtitle={buildHistoricalEarthquakeSummary(activeHistoricalEarthquake)}
                        onClose={() => setLayerActiveFeature("historical-earthquakes", null)}
                        accentColor="#78350f"
                      >
                        {renderHistoricalEarthquakePopup(activeHistoricalEarthquake)}
                      </PopupCard>
                    </Popup>
                  )}

                {activeSeismographStation &&
                  isFiniteNumber(activeSeismographStation.longitude) &&
                  isFiniteNumber(activeSeismographStation.latitude) && (
                    <Popup
                      longitude={activeSeismographStation.longitude!}
                      latitude={activeSeismographStation.latitude!}
                      anchor="bottom"
                      onClose={() => setLayerActiveFeature("seismograph-stations", null)}
                      closeButton={false}
                      maxWidth="320px"
                      className="z-20"
                    >
                      <PopupCard
                        title={activeSeismographStation.station ?? activeSeismographStation.siteName ?? activeSeismographStation.id}
                        subtitle={buildSeismographSummary(activeSeismographStation)}
                        onClose={() => setLayerActiveFeature("seismograph-stations", null)}
                        accentColor="#f97316"
                      >
                        {renderSeismographPopup(activeSeismographStation)}
                      </PopupCard>
                    </Popup>
                  )}

                {surfaceWaterLayerEnabled &&
                  activeSurfaceWaterStation &&
                  isFiniteNumber(activeSurfaceWaterStation.longitude) &&
                  isFiniteNumber(activeSurfaceWaterStation.latitude) && (
                    <Popup
                      longitude={activeSurfaceWaterStation.longitude!}
                      latitude={activeSurfaceWaterStation.latitude!}
                      anchor="bottom"
                      onClose={() => setLayerActiveFeature("surface-water-levels", null)}
                      closeButton={false}
                      maxWidth="330px"
                      className="z-20"
                    >
                      <PopupCard
                        title={activeSurfaceWaterStation.stationName ?? activeSurfaceWaterStation.stationNumber ?? activeSurfaceWaterStation.id}
                        subtitle={buildSurfaceWaterSummary(activeSurfaceWaterStation)}
                        onClose={() => setLayerActiveFeature("surface-water-levels", null)}
                        accentColor="#0ea5e9"
                      >
                        {renderSurfaceWaterPopup(activeSurfaceWaterStation)}
                      </PopupCard>
                    </Popup>
                  )}
                {damsReservoirLayerEnabled && activeDamReservoir && activeDamReservoirCentroid && (
                  <Popup
                    longitude={activeDamReservoirCentroid.longitude}
                    latitude={activeDamReservoirCentroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("dams-reservoirs", null)}
                    closeButton={false}
                    maxWidth="340px"
                    className="z-20"
                  >
                    <PopupCard
                      title={activeDamReservoir.damName ?? activeDamReservoir.reservoirName ?? activeDamReservoir.id}
                      subtitle={activeDamReservoirSummary ?? undefined}
                      onClose={() => setLayerActiveFeature("dams-reservoirs", null)}
                      accentColor={damsReservoirPaint.outlineColor}
                    >
                      {renderDamReservoirPopup(activeDamReservoir)}
                    </PopupCard>
                  </Popup>
                )}

                {activeGlobalFault && activeGlobalFaultSummary && activeGlobalFaultCentroid && (
                  <Popup
                    longitude={activeGlobalFaultCentroid.longitude}
                    latitude={activeGlobalFaultCentroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("global-active-faults", null)}
                    closeButton={false}
                    maxWidth="320px"
                    className="z-20"
                  >
                    <PopupCard
                      title={activeGlobalFault.name ?? activeGlobalFault.catalogName ?? activeGlobalFault.id}
                      subtitle={activeGlobalFaultSummary}
                      onClose={() => setLayerActiveFeature("global-active-faults", null)}
                      accentColor={activeGlobalFaultColor}
                    >
                      {renderFaultPopup(activeGlobalFault)}
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
                        title={buildFeatureSummary("hydrometric-stations", station)}
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

                {surfaceWaterLayerEnabled &&
                  visibleSurfaceWaterStations.map((station) => (
                    <Marker
                      key={`surface-water-${station.id}`}
                      longitude={station.longitude!}
                      latitude={station.latitude!}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("surface-water-levels", station.id);
                        setActiveCamera(null);
                      }}
                    >
                      <button
                        type="button"
                        className={SURFACE_WATER_MARKER_CLASS}
                        aria-label={`View water levels for ${station.stationName ?? station.stationNumber ?? station.id}`}
                        title={buildSurfaceWaterSummary(station)}
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

                {visibleFirstAlerts.map((alert) => (
                  <Marker
                    key={alert.id}
                    longitude={alert.longitude as number}
                    latitude={alert.latitude as number}
                    anchor="bottom"
                    onClick={(event) => {
                      event.originalEvent.stopPropagation();
                      setActiveCamera(null);
                      setLayerActiveFeature("dob-incidents", null);
                      setLayerActiveFeature("active-wildfires", null);
                      setLayerActiveFeature("first-alerts", alert.id);
                    }}
                  >
                    <button
                      type="button"
                      className={FIRST_ALERT_MARKER_CLASS}
                      aria-label={`View First Alert ${alert.headline ?? alert.id}`}
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

                {firstAlertsLayerEnabled &&
                  activeFirstAlert &&
                  isFiniteNumber(activeFirstAlert.longitude) &&
                  isFiniteNumber(activeFirstAlert.latitude) && (
                    <Popup
                      longitude={activeFirstAlert.longitude}
                      latitude={activeFirstAlert.latitude}
                      anchor="bottom"
                      onClose={() => setLayerActiveFeature("first-alerts", null)}
                      closeButton={false}
                      focusAfterOpen={false}
                    >
                      <PopupCard
                        title={
                          activeFirstAlert.headline ??
                          activeFirstAlert.subHeadlineTitle ??
                          activeFirstAlert.alertType ??
                          "First Alert"
                        }
                        subtitle={activeFirstAlertSummary}
                        onClose={() => setLayerActiveFeature("first-alerts", null)}
                        accentColor={FIRST_ALERT_LAYER_COLOR}
                      >
                        {activeFirstAlert.alertType && (
                          <p className="text-secondary">Type: {activeFirstAlert.alertType}</p>
                        )}
                        {activeFirstAlert.eventTime && (
                          <p className="text-secondary">Reported: {activeFirstAlert.eventTime}</p>
                        )}
                        {activeFirstAlert.estimatedEventLocationName && (
                          <p className="text-secondary">
                            Estimated location: {activeFirstAlert.estimatedEventLocationName}
                          </p>
                        )}
                        {typeof activeFirstAlert.estimatedEventLocationRadius === "number" && (
                          <p className="text-tertiary">
                            Radius: {activeFirstAlert.estimatedEventLocationRadius} (approx.)
                          </p>
                        )}
                        {activeFirstAlert.alertTopics.length > 0 && (
                          <p className="text-tertiary">
                            Topics: {activeFirstAlert.alertTopics.join(", ")}
                          </p>
                        )}
                        {activeFirstAlert.alertLists.length > 0 && (
                          <p className="text-tertiary">
                            Lists: {activeFirstAlert.alertLists.join(", ")}
                          </p>
                        )}
                        {activeFirstAlert.publicPostText ? (
                          <p className="text-secondary">{activeFirstAlert.publicPostText}</p>
                        ) : null}
                        {!activeFirstAlert.publicPostText && activeFirstAlert.publicPostTranslatedText ? (
                          <p className="text-secondary">{activeFirstAlert.publicPostTranslatedText}</p>
                        ) : null}
                        <div className="mt-2 flex flex-col gap-1 text-sm">
                          {activeFirstAlert.firstAlertUrl ? (
                            <a
                              className="font-semibold text-utility-blue-600 underline"
                              href={activeFirstAlert.firstAlertUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open First Alerts record
                            </a>
                          ) : null}
                          {activeFirstAlert.publicPostLink ? (
                            <a
                              className="font-semibold text-utility-blue-600 underline"
                              href={activeFirstAlert.publicPostLink}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View linked post
                            </a>
                          ) : null}
                          {activeFirstAlert.publicPostMedia ? (
                            <a
                              className="font-semibold text-utility-blue-600 underline"
                              href={activeFirstAlert.publicPostMedia}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open media attachment
                            </a>
                          ) : null}
                        </div>
                        {activeFirstAlert.termsOfUse ? (
                          <p className="mt-2 text-[0.7rem] text-tertiary">
                            Terms: {activeFirstAlert.termsOfUse}
                          </p>
                        ) : null}
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

                {healthcareLayerEnabled &&
                  visibleHealthcareFacilities.map((facility) => (
                    <Marker
                      key={facility.id}
                      longitude={facility.longitude as number}
                      latitude={facility.latitude as number}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("healthcare-facilities", facility.id);
                      }}
                    >
                      <button
                        type="button"
                        className={HEALTHCARE_MARKER_CLASS}
                        aria-label={`View healthcare facility ${facility.facilityName ?? facility.id}`}
                        title={buildHealthcareSummary(facility)}
                        data-layer-id="healthcare-facilities-marker"
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

                {energyInfrastructureLayerEnabled &&
                  visibleEnergyInfrastructure.map((site) => (
                    <Marker
                      key={site.id}
                      longitude={site.longitude as number}
                      latitude={site.latitude as number}
                      anchor="bottom"
                      onClick={(event) => {
                        event.originalEvent.stopPropagation();
                        setLayerActiveFeature("energy-infrastructure", site.id);
                      }}
                    >
                      <button
                        type="button"
                        className={ENERGY_MARKER_CLASS}
                        aria-label={`View energy infrastructure ${site.facility ?? site.layerName}`}
                      >
                        <span className="block h-2 w-2 rounded-full bg-white transition group-hover:scale-110" />
                      </button>
                    </Marker>
                  ))}

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

                {healthcareLayerEnabled && activeHealthcareFacility && (
                  <Popup
                    longitude={activeHealthcareFacility.longitude as number}
                    latitude={activeHealthcareFacility.latitude as number}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("healthcare-facilities", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeHealthcareFacility.facilityName ?? "Healthcare facility"}
                      subtitle={activeHealthcareSummary}
                      onClose={() => setLayerActiveFeature("healthcare-facilities", null)}
                      accentColor="#10b981"
                    >
                      {activeHealthcareFacility.index_ && (
                        <p className="text-tertiary">Index: {activeHealthcareFacility.index_}</p>
                      )}
                      {activeHealthcareFacility.odhfFacilityType && (
                        <p className="text-secondary">Type: {activeHealthcareFacility.odhfFacilityType}</p>
                      )}
                      {activeHealthcareFacility.sourceFacilityType && (
                        <p className="text-tertiary">Source type: {activeHealthcareFacility.sourceFacilityType}</p>
                      )}
                      {activeHealthcareFacility.provider && (
                        <p className="text-secondary">Provider: {activeHealthcareFacility.provider}</p>
                      )}
                      {activeHealthcareFacility.unit && <p className="text-secondary">Unit: {activeHealthcareFacility.unit}</p>}
                      {activeHealthcareFacility.fullAddress && (
                        <p className="text-secondary">Address: {activeHealthcareFacility.fullAddress}</p>
                      )}
                      {!activeHealthcareFacility.fullAddress &&
                        (activeHealthcareFacility.streetName || activeHealthcareFacility.streetNumber) && (
                          <p className="text-secondary">
                            Address: {[activeHealthcareFacility.streetNumber, activeHealthcareFacility.streetName].filter(Boolean).join(" ")}
                          </p>
                        )}
                      {(activeHealthcareFacility.city || activeHealthcareFacility.province || activeHealthcareFacility.postalCode) && (
                        <p className="text-tertiary">
                          {activeHealthcareFacility.city ?? ""} {activeHealthcareFacility.province ?? ""}{" "}
                          {activeHealthcareFacility.postalCode ?? ""}
                        </p>
                      )}
                      {activeHealthcareFacility.csdName && (
                        <p className="text-tertiary">CSD: {activeHealthcareFacility.csdName}</p>
                      )}
                      {activeHealthcareFacility.csdUid !== null && (
                        <p className="text-tertiary">CSD UID: {activeHealthcareFacility.csdUid}</p>
                      )}
                      {activeHealthcareFacility.prUid !== null && (
                        <p className="text-tertiary">PR UID: {activeHealthcareFacility.prUid}</p>
                      )}
                      {isFiniteNumber(activeHealthcareFacility.latitude) && isFiniteNumber(activeHealthcareFacility.longitude) && (
                        <p className="text-tertiary">
                          Coordinates: {activeHealthcareFacility.latitude}, {activeHealthcareFacility.longitude}
                        </p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {energyInfrastructureLayerEnabled &&
                  activeEnergyInfrastructure &&
                  isFiniteNumber(activeEnergyInfrastructure.longitude) &&
                  isFiniteNumber(activeEnergyInfrastructure.latitude) && (
                  <Popup
                    longitude={activeEnergyInfrastructure.longitude as number}
                    latitude={activeEnergyInfrastructure.latitude as number}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("energy-infrastructure", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeEnergyInfrastructure.facility ?? activeEnergyInfrastructure.layerName}
                      subtitle={activeEnergyInfrastructureSummary}
                      onClose={() => setLayerActiveFeature("energy-infrastructure", null)}
                      accentColor="#0ea5e9"
                    >
                      {activeEnergyInfrastructure.layerName && (
                        <p className="text-secondary">Layer: {activeEnergyInfrastructure.layerName}</p>
                      )}
                      {activeEnergyInfrastructure.owner && (
                        <p className="text-secondary">Owner: {activeEnergyInfrastructure.owner}</p>
                      )}
                      {activeEnergyInfrastructure.operator && (
                        <p className="text-tertiary">Operator: {activeEnergyInfrastructure.operator}</p>
                      )}
                      {(activeEnergyInfrastructure.city || activeEnergyInfrastructure.stateProvince) && (
                        <p className="text-tertiary">
                          {activeEnergyInfrastructure.city ?? ""} {activeEnergyInfrastructure.stateProvince ?? ""}
                        </p>
                      )}
                      {activeEnergyInfrastructure.address && (
                        <p className="text-tertiary">Address: {activeEnergyInfrastructure.address}</p>
                      )}
                      {activeEnergyInfrastructure.zipCode && (
                        <p className="text-tertiary">Postal: {activeEnergyInfrastructure.zipCode}</p>
                      )}
                      {activeEnergyInfrastructure.totalMw !== null && (
                        <p className="text-secondary">
                          Total capacity: {formatDangerAttributeNumber(activeEnergyInfrastructure.totalMw)} MW
                        </p>
                      )}
                      {activeEnergyInfrastructure.renewableMw !== null && (
                        <p className="text-tertiary">
                          Renewable capacity: {formatDangerAttributeNumber(activeEnergyInfrastructure.renewableMw)} MW
                        </p>
                      )}
                      {Object.entries(activeEnergyInfrastructure.energyBreakdown)
                        .filter(([, value]) => typeof value === "number" && !Number.isNaN(value as number))
                        .map(([key, value]) => (
                          <p key={key} className="text-tertiary">
                            {key.replace(/Mw$/i, "").replace(/([A-Z])/g, " $1")}:{" "}
                            {formatDangerAttributeNumber(value as number)} MW
                          </p>
                        ))}
                      {activeEnergyInfrastructure.primarySource && (
                        <p className="text-secondary">Primary source: {activeEnergyInfrastructure.primarySource}</p>
                      )}
                      {activeEnergyInfrastructure.primaryRenewable && (
                        <p className="text-tertiary">
                          Primary renewable: {activeEnergyInfrastructure.primaryRenewable}
                        </p>
                      )}
                      {activeEnergyInfrastructure.referencePeriod && (
                        <p className="text-tertiary">Period: {activeEnergyInfrastructure.referencePeriod}</p>
                      )}
                      {activeEnergyInfrastructure.sourceAgency && (
                        <p className="text-tertiary">Source: {activeEnergyInfrastructure.sourceAgency}</p>
                      )}
                    </PopupCard>
                  </Popup>
                )}

                {ferryRoutesLayerEnabled && activeFerryRoute && activeFerryRouteCoordinates && (
                  <Popup
                    longitude={activeFerryRouteCoordinates.longitude}
                    latitude={activeFerryRouteCoordinates.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("ferry-routes", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={
                        activeFerryRoute.objName ??
                        activeFerryRoute.nativeName ??
                        activeFerryRoute.encName ??
                        "Ferry route"
                      }
                      subtitle={activeFerryRouteSummary}
                      onClose={() => setLayerActiveFeature("ferry-routes", null)}
                      accentColor="#0ea5e9"
                    >
                      {activeFerryRoute.status && (
                        <p className="text-secondary">Status: {activeFerryRoute.status}</p>
                      )}
                      {activeFerryRouteLengthLabel && (
                        <p className="text-secondary">Length: {activeFerryRouteLengthLabel}</p>
                      )}
                      {activeFerryRoute.periodStart || activeFerryRoute.periodEnd ? (
                        <p className="text-tertiary">
                          Period: {activeFerryRoute.periodStart ?? "unknown"} – {activeFerryRoute.periodEnd ?? "ongoing"}
                        </p>
                      ) : null}
                      {activeFerryRoute.info && <p className="text-secondary">{activeFerryRoute.info}</p>}
                      {!activeFerryRoute.info && activeFerryRoute.textDescription ? (
                        <p className="text-secondary">{activeFerryRoute.textDescription}</p>
                      ) : null}
                      {activeFerryRoute.inform && (
                        <p className="text-tertiary">Notes: {activeFerryRoute.inform}</p>
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

                {historicalPerimetersEnabled && activeHistoricalPerimeter && activeHistoricalPerimeterCentroid && (
                  <Popup
                    longitude={activeHistoricalPerimeterCentroid.longitude}
                    latitude={activeHistoricalPerimeterCentroid.latitude}
                    anchor="bottom"
                    onClose={() => setLayerActiveFeature("historical-perimeters", null)}
                    closeButton={false}
                    focusAfterOpen={false}
                  >
                    <PopupCard
                      title={activeHistoricalPerimeterSummary ?? "Historical Fire Perimeter"}
                      subtitle={
                        activeHistoricalPerimeter.firstDate
                          ? `First observed ${activeHistoricalPerimeter.firstDate}`
                          : undefined
                      }
                      onClose={() => setLayerActiveFeature("historical-perimeters", null)}
                      accentColor={activeHistoricalPerimeter.color ?? "#facc15"}
                    >
                      {renderHistoricalPerimeterPopup(activeHistoricalPerimeter)}
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

        {nationalParksEnabled && activeNationalPark && activeNationalPark.centroid && (
          <Popup
            longitude={activeNationalPark.centroid.longitude}
            latitude={activeNationalPark.centroid.latitude}
            anchor="bottom"
            onClose={() => setLayerActiveFeature("national-parks", null)}
            closeButton={false}
            focusAfterOpen={false}
          >
            <PopupCard
              title={activeNationalPark.nameEn ?? activeNationalPark.nameFr ?? "National Park"}
              subtitle={buildFeatureSummary("national-parks", activeNationalPark)}
              onClose={() => setLayerActiveFeature("national-parks", null)}
              accentColor={nationalParksPaint.outlineColor}
            >
              <p className="text-secondary">{activeNationalPark.nameFr}</p>
              {activeNationalPark.area && <p className="text-tertiary">Area: {activeNationalPark.area} km²</p>}
            </PopupCard>
          </Popup>
        )}

      </CardContent>
    </AnalysisCardFrame >
  );
}
