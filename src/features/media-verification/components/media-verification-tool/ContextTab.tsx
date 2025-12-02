import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Marker, Popup } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

import { useTheme } from "@/app/providers/theme-context";
import { AnalysisCardFrame } from "@/components/analysis";
import { Badge } from "@/components/ui/badges/badges";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion/accordion";
import { Select, type SelectItemType } from "@/components/ui/select/select";
import { Toggle } from "@/components/ui/toggle/toggle";
import type { GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import type { GeolocationAnalysis } from "@/features/media-verification/api/geolocation";
import type { GeocodedLocation } from "@/features/media-verification/api/geocoding";
import { GeolocationCard } from "./GeolocationCard";

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

interface LayerControlOption {
  id: string;
  label: string;
  description: string;
  colorHex?: string;
  hoverColorHex?: string;
}

const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1Ijoic3RhbmRhbG9uZXF1aW5uIiwiYSI6ImNtaW5odWs1czFtbnkzZ3EzMWozanN2cmsifQ.P8ZoDe9WKINxE4qGnx3sHg";
const MAPBOX_STYLE_LIGHT_URL = "mapbox://styles/standalonequinn/cmio1g22h004301s44x2c5ud5";
const MAP_INITIAL_VIEW_STATE = {
  longitude: -92.67,
  latitude: 59.12,
  zoom: 2.69,
};
const DOB_INCIDENTS_URL =
  "https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/DOB_Incidents_public/FeatureServer/0/query?f=json&where=1%3D1&outFields=*&returnGeometry=true&spatialRel=esriSpatialRelIntersects";
const MAX_WEB_MERCATOR_EXTENT = 20037508.34;

const VIEW_TYPE_OPTIONS: SelectItemType[] = [
  { id: "general", label: "General" },
  { id: "wildfires", label: "Wildfires" },
  { id: "hurricanes", label: "Hurricanes" },
  { id: "infrastructure", label: "Infrastructure" },
];

const LAYER_CONTROLS: LayerControlOption[] = [
  {
    id: "dob-incidents",
    label: "DOB Incidents",
    description: "Live Department Operations Branch incident feed.",
    colorHex: "#dc2626",
    hoverColorHex: "#b91c1c",
  },
  {
    id: "satellite",
    label: "Canadian Hurricane Response Zone",
    description: "Mapped corridors prioritized for national hurricane response operations.",
    colorHex: "#ffa742",
    hoverColorHex: "#ffa742",
  },
  {
    id: "evacuation",
    label: "Evacuation routes",
    description: "Provincial corridors & access routes.",
  },
  {
    id: "infrastructure",
    label: "Critical infrastructure",
    description: "Power, telecom, and transportation assets.",
  },
  {
    id: "shelters",
    label: "Shelter capacity",
    description: "Status of emergency shelters nearby.",
  },
];

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

const DOB_STATUS_LABELS: Record<string, string> = {
  "1": "Open",
  "2": "Closed",
  "3": "Inactive",
  "4": "Resolved",
  "5": "Upcoming",
};

interface DobIncidentFeature {
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
  const [selectedViewType, setSelectedViewType] = useState<string>(VIEW_TYPE_OPTIONS[0]?.id ?? "general");
  const [layerVisibility, setLayerVisibility] = useState<Record<string, boolean>>(() =>
    LAYER_CONTROLS.reduce(
      (acc, layer) => {
        acc[layer.id] = true;
        return acc;
      },
      {} as Record<string, boolean>,
    ),
  );
  const [dobIncidents, setDobIncidents] = useState<DobIncidentFeature[]>([]);
  const [dobIncidentsLoading, setDobIncidentsLoading] = useState<boolean>(false);
  const [dobIncidentsError, setDobIncidentsError] = useState<string | null>(null);
  const [activeDobIncident, setActiveDobIncident] = useState<DobIncidentFeature | null>(null);
  const hasHighlightTerms = highlightTerms.length > 0;
  const visibleLayers = LAYER_CONTROLS.filter((layer) => layerVisibility[layer.id]);
  const showDobIncidents = layerVisibility["dob-incidents"];
  const visibleDobIncidents = useMemo(() => (showDobIncidents ? dobIncidents : []), [dobIncidents, showDobIncidents]);

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

  useEffect(() => {
    const abortController = new AbortController();
    const loadDobIncidents = async () => {
      setDobIncidentsLoading(true);
      setDobIncidentsError(null);
      try {
        const response = await fetch(DOB_INCIDENTS_URL, { signal: abortController.signal });
        if (!response.ok) {
          throw new Error(`Failed to load incidents (${response.status})`);
        }
        const json = await response.json();
        const normalized = normalizeDobIncidents(json?.features ?? []);
        setDobIncidents(normalized ?? []);
      } catch (error) {
        if ((error as Error).name === "AbortError") {
          return;
        }
        console.error("Failed to load DOB incident layer", error);
        setDobIncidentsError("DOB incident feed is unavailable right now.");
      } finally {
        setDobIncidentsLoading(false);
      }
    };
    loadDobIncidents();
    return () => {
      abortController.abort();
    };
  }, []);

  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left -mb-4">
          <CardTitle className="text-sm">Geolocation & Context</CardTitle>
          <CardDescription className="text-xs text-tertiary">
            {hasHighlightTerms
              ? "Map overlays adapt to the context detected in the upload."
              : "Use the situational layers to manually explore the map."}
          </CardDescription>
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
        />

        <section className="space-y-3">
          <div className="overflow-hidden rounded-xl border border-secondary/30 bg-primary shadow-sm">
            <div ref={mapContainerRef} className="relative h-[28rem] w-full">
              <Map
                ref={(instance) => {
                  mapRef.current = instance;
                }}
                id="context-map"
                mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
                initialViewState={MAP_INITIAL_VIEW_STATE}
                mapStyle={MAPBOX_STYLE_LIGHT_URL}
                onLoad={handleMapLoad}
                reuseMaps
                attributionControl={false}
                style={{ width: "100%", height: "100%" }}
              >
                {visibleDobIncidents.map((incident) => (
                  <Marker
                    key={incident.id}
                    longitude={incident.longitude}
                    latitude={incident.latitude}
                    anchor="bottom"
                    onClick={(event) => {
                      event.originalEvent.stopPropagation();
                      setActiveDobIncident(incident);
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

                {showDobIncidents && activeDobIncident && (
                  <Popup
                    longitude={activeDobIncident.longitude}
                    latitude={activeDobIncident.latitude}
                    anchor="top"
                    onClose={() => setActiveDobIncident(null)}
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
              </Map>
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
                        onSelectionChange={(key) => setSelectedViewType(String(key))}
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
                      {LAYER_CONTROLS.map((layer) => (
                        <div key={layer.id} className="min-w-0">
                          <Toggle
                            size="sm"
                            className="w-full"
                            isSelected={layerVisibility[layer.id]}
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
                      ))}
                    </div>
                  </div>
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <p className="text-xs text-tertiary">
            {visibleLayers.length > 0 ? `Active layers: ${visibleLayers.map((layer) => layer.label).join(", ")}` : "No layers enabled yet."}
          </p>
        </section>
      </CardContent>
    </AnalysisCardFrame>
  );
}
