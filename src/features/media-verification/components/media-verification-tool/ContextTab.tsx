import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, Popup, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import type { MapMouseEvent } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { Feature, FeatureCollection } from "geojson";

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
import type { GeolocationAnalysis } from "@/features/media-verification/api/geolocation";
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
const MAPBOX_STYLE_LIGHT_URL = "mapbox://styles/standalonequinn/cmio1g22h004301s44x2c5ud5";
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
const FIRE_DANGER_SOURCE_ID = "fire-danger-source";
const FIRE_DANGER_FILL_LAYER_ID = "fire-danger-fill";
const FIRE_DANGER_OUTLINE_LAYER_ID = "fire-danger-outline";
const PERIMETERS_SOURCE_ID = "perimeters-source";
const PERIMETERS_FILL_LAYER_ID = "perimeters-fill";
const PERIMETERS_OUTLINE_LAYER_ID = "perimeters-outline";
const RAILWAYS_SOURCE_ID = "railways-source";
const RAILWAYS_LINE_LAYER_ID = "railways-line";
const HIGHWAYS_SOURCE_ID = "highways-source";
const HIGHWAYS_LINE_LAYER_ID = "highways-line";

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
};

const useDataLayerManager = () => {
  const [layerDataState, setLayerDataState] = useState<Record<string, DataLayerRuntimeState>>(() => {
    return DATA_LAYER_CONFIGS.reduce<Record<string, DataLayerRuntimeState>>((acc, config) => {
      acc[config.id] = {
        data: [],
        loading: true,
        error: null,
        activeFeatureId: null,
      };
      return acc;
    }, {});
  });

  useEffect(() => {
    const abortControllers = DATA_LAYER_CONFIGS.map((config) => {
      const controller = new AbortController();
      config
        .fetcher({ signal: controller.signal })
        .then((data) => {
          setLayerDataState((prev) => ({
            ...prev,
            [config.id]: {
              ...prev[config.id],
              data,
              loading: false,
              error: null,
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
            },
          }));
        });
      return controller;
    });

    return () => {
      abortControllers.forEach((controller) => controller.abort());
    };
  }, []);

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
  return `The ${typeLabel} port ${entry.name} serves the ${regionLabel}${provinceLabel}. ${
    entry.address ? `It is located at ${entry.address}.` : ""
  }`;
};

const formatDangerAttributeNumber = (value?: number | null) => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return null;
  }
  return new Intl.NumberFormat().format(value);
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

const formatPerimeterAreaLabel = (value?: number | null) => {
  return formatWildfireAreaValue(value, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  subtitle?: string | null;
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
          {subtitle ? <p className="text-xs text-tertiary">{subtitle}</p> : null}
        </div>
        <div className="flex items-center gap-2">
          {trailing}
        {onClose ? (
          <button
            type="button"
            aria-label="Close popup"
            className="rounded-full p-1 text-tertiary transition hover:bg-secondary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/40"
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
  resizeTrigger,
}: ContextTabProps) {
  const highlightTerms = getHighlightTerms(visionResult);
  const mapRef = useRef<MapRef | null>(null);
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const { theme } = useTheme();
  const getSystemDarkPreference = () => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };
  const resolveIsDark = () => {
    if (theme === "dark") {
      return true;
    }
    if (theme === "light") {
      return false;
    }
    return getSystemDarkPreference();
  };
  const [isDarkMode, setIsDarkMode] = useState<boolean>(resolveIsDark);
  const [selectedViewType, setSelectedViewType] = useState<ViewType>((VIEW_TYPE_OPTIONS[0]?.id as ViewType) ?? "general");
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
  const { layerDataState, setActiveFeature: setLayerActiveFeature } = useDataLayerManager();
  const [activeCamera, setActiveCamera] = useState<OttawaCameraFeature | null>(null);
  const [mapZoom, setMapZoom] = useState<number>(MAP_INITIAL_VIEW_STATE.zoom);
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
  const dobLayerState = layerDataState["dob-incidents"] as DataLayerRuntimeState<DobIncidentFeature>;
  const wildfireLayerState = layerDataState["active-wildfires"] as DataLayerRuntimeState<WildfireFeature>;
  const borderEntryLayerState = layerDataState["border-entries"] as DataLayerRuntimeState<BorderEntryFeature>;
  const fireDangerLayerState = layerDataState["fire-danger"] as DataLayerRuntimeState<FireDangerFeature>;
  const perimetersLayerState = layerDataState["perimeters"] as DataLayerRuntimeState<PerimeterFeature>;
  const aerodromeLayerState = layerDataState["aerodromes"] as DataLayerRuntimeState<AerodromeFeature>;
  const railwayLayerState = layerDataState["railways"] as DataLayerRuntimeState<RailwayFeature>;
  const highwayLayerState = layerDataState["highways"] as DataLayerRuntimeState<HighwayFeature>;
  const dobLayerEnabled = Boolean(layerVisibility["dob-incidents"]);
  const wildfireLayerEnabled = Boolean(layerVisibility["active-wildfires"]);
  const borderEntriesEnabled = Boolean(layerVisibility["border-entries"]);
  const fireDangerLayerEnabled = Boolean(layerVisibility["fire-danger"]);
  const perimetersLayerEnabled = Boolean(layerVisibility["perimeters"]);
  const aerodromeLayerEnabled = Boolean(layerVisibility["aerodromes"]);
  const railwayLayerEnabled = Boolean(layerVisibility["railways"]);
  const highwayLayerEnabled = Boolean(layerVisibility["highways"]);
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
          const { [stateKey]: _cooldown, ...rest } = prev;
          return rest;
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

  const handleLocationFound = useCallback((location: GeocodedLocation) => {
    const rawMap = mapRef.current;
    const mapInstance = rawMap?.getMap ? rawMap.getMap() : rawMap;
    if (!mapInstance) return;

    mapInstance.flyTo({
      center: [location.longitude, location.latitude],
      zoom: 12,
      essential: true,
    });
  }, []);

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
      setLayerActiveFeature,
    ],
  );

  const applyLightPreset = useCallback(() => {
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
  }, [isDarkMode]);

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
  }, [applyLightPreset, setupResizeObserver]);

  useEffect(() => {
    return () => {
      resizeObserverRef.current?.disconnect();
    };
  }, []);

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
          onLocationClick={handleLocationFound}
        />

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
                ref={(instance) => {
                  mapRef.current = instance;
                }}
                id="context-map"
                mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
                initialViewState={MAP_INITIAL_VIEW_STATE}
                mapStyle={MAPBOX_STYLE_LIGHT_URL}
                onLoad={handleMapLoad}
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
              <MapSearchControl onLocationFound={handleLocationFound}/>
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
      </CardContent>
    </AnalysisCardFrame>
  );
}