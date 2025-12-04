import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Popup } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "@/app/providers/theme-context";
import { AnalysisCardFrame } from "@/components/analysis";
import { Button } from "@/components/ui/buttons/button";
import { Dialog, Modal, ModalOverlay } from "@/components/ui/modals/modal";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion/accordion";
import { Select } from "@/components/ui/select/select";
import { Toggle } from "@/components/ui/toggle/toggle";
import { Car, Maximize2, Plane, RefreshCw, TowerControl } from "lucide-react";
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
  const dobLayerEnabled = Boolean(layerVisibility["dob-incidents"]);
  const wildfireLayerEnabled = Boolean(layerVisibility["active-wildfires"]);
  const borderEntriesEnabled = Boolean(layerVisibility["border-entries"]);
  const showOttawaCameras = Boolean(layerVisibility[CAMERA_LAYER_ID]);
  const visibleDobIncidents = useMemo(() => (dobLayerEnabled ? dobLayerState.data : []), [dobLayerEnabled, dobLayerState.data]);
  const visibleWildfires = useMemo(() => (wildfireLayerEnabled ? wildfireLayerState.data : []), [wildfireLayerEnabled, wildfireLayerState.data]);
  const visibleBorderEntries = useMemo(
    () => (borderEntriesEnabled ? borderEntryLayerState.data : []),
    [borderEntriesEnabled, borderEntryLayerState.data],
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
  const borderMarkerButtonClass = useMemo(
    () =>
      isDarkMode
        ? `${BORDER_ENTRY_MARKER_BASE_CLASS} border-white/30 bg-black/80 hover:bg-black/60 focus-visible:ring-white/60`
        : `${BORDER_ENTRY_MARKER_BASE_CLASS} border-black/10 bg-white hover:bg-white/80 focus-visible:ring-black/30`,
    [isDarkMode],
  );

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
              (borderEntriesEnabled && (borderEntryLayerState.loading || borderEntryLayerState.error)) ? (
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
                reuseMaps
                attributionControl={false}
                style={{ width: "100%", height: "100%" }}
              >
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
                    closeButton
                    focusAfterOpen={false}
                  >
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold leading-tight">{activeDobIncident.title}</p>
                      <p className="text-xs text-tertiary">
                        {activeDobIncident.location} &middot; Status: {activeDobIncident.status}
                      </p>
                      {activeDobIncident.description && (
                        <p className="text-xs text-secondary">{activeDobIncident.description}</p>
                      )}
                    </div>
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
                    closeButton
                    focusAfterOpen={false}
                  >
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold leading-tight">{activeWildfire.name}</p>
                      {activeWildfireSummary && <p className="text-xs text-secondary">{activeWildfireSummary}</p>}
                      <p className="text-xs text-tertiary">
                        Status: {activeWildfire.stageOfControl} &middot; Response: {formatTitleCase(activeWildfire.responseType)}
                      </p>
                      {activeWildfireSizeLabel && (
                        <p className="text-xs text-secondary">Size: {activeWildfireSizeLabel} ha</p>
                      )}
                      {activeWildfire.startDate && (
                        <p className="text-xs text-secondary">
                          Start: {activeWildfire.startDate}
                          {activeWildfire.timezone ? ` (${activeWildfire.timezone})` : ""}
                        </p>
                      )}
                    </div>
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
                    closeButton
                    focusAfterOpen={false}
                  >
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold leading-tight">{activeBorderEntry.name}</p>
                      {activeBorderEntrySummary && <p className="text-xs text-secondary">{activeBorderEntrySummary}</p>}
                      {activeBorderEntry.address && (
                        <p className="text-xs text-tertiary">
                          Address: {activeBorderEntry.address}
                          {activeBorderEntry.place ? `, ${activeBorderEntry.place}` : ""}
                          {activeBorderEntry.province ? `, ${activeBorderEntry.province}` : ""}
                        </p>
                      )}
                      {activeBorderEntry.url && (
                        <a
                          className="text-xs font-semibold text-utility-blue-600 underline"
                          href={activeBorderEntry.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open site
                        </a>
                      )}
                    </div>
                  </Popup>
                )}
              </Map>
              <MapSearchControl onLocationFound={handleLocationFound} />
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
