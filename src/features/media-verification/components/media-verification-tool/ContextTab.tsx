import { useEffect, useRef, useState } from "react";
import Map from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import "mapbox-gl/dist/mapbox-gl.css";

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
}

interface LayerControlOption {
  id: string;
  label: string;
  description: string;
}

const MAPBOX_ACCESS_TOKEN =
  "pk.eyJ1Ijoic3RhbmRhbG9uZXF1aW5uIiwiYSI6ImNtaW5odWs1czFtbnkzZ3EzMWozanN2cmsifQ.P8ZoDe9WKINxE4qGnx3sHg";
const MAPBOX_STYLE_LIGHT_URL = "mapbox://styles/standalonequinn/cmio1g22h004301s44x2c5ud5";
const DARK_MODE_CLASS = "dark-mode";
const MAP_INITIAL_VIEW_STATE = {
  longitude: -92.67,
  latitude: 59.12,
  zoom: 2.69,
};

const VIEW_TYPE_OPTIONS: SelectItemType[] = [
  { id: "general", label: "General" },
  { id: "wildfires", label: "Wildfires" },
  { id: "hurricanes", label: "Hurricanes" },
  { id: "infrastructure", label: "Infrastructure" },
];

const LAYER_CONTROLS: LayerControlOption[] = [
  {
    id: "satellite",
    label: "Canadian Hurricane Response Zone",
    description: "Mapped corridors prioritized for national hurricane response operations.",
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
}: ContextTabProps) {
  const highlightTerms = getHighlightTerms(visionResult);
  const mapRef = useRef<MapRef | null>(null);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof document === "undefined") {
      return false;
    }
    if (document.documentElement.classList.contains(DARK_MODE_CLASS)) {
      return true;
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
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
  const hasHighlightTerms = highlightTerms.length > 0;
  const visibleLayers = LAYER_CONTROLS.filter((layer) => layerVisibility[layer.id]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const getDarkPreference = () => {
      if (document.documentElement.classList.contains(DARK_MODE_CLASS)) {
        return true;
      }
      return window.matchMedia("(prefers-color-scheme: dark)").matches;
    };

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => setIsDarkMode(getDarkPreference());

    const observer = new MutationObserver(() => setIsDarkMode(getDarkPreference()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    mediaQuery.addEventListener("change", handleMediaChange);
    setIsDarkMode(getDarkPreference());

    return () => {
      observer.disconnect();
      mediaQuery.removeEventListener("change", handleMediaChange);
    };
  }, []);

  useEffect(() => {
    const preset = isDarkMode ? "night" : "day";
    const mapInstance = mapRef.current;
    if (!mapInstance) {
      return;
    }

    const applyPreset = () => {
      try {
        mapInstance.setConfigProperty("basemap", "lightPreset", preset);
      } catch (error) {
        console.warn("Failed to set Mapbox light preset", error);
      }
    };

    if (mapInstance.isStyleLoaded()) {
      applyPreset();
      return;
    }

    const onStyleData = () => {
      applyPreset();
      mapInstance.off("styledata", onStyleData);
    };

    mapInstance.on("styledata", onStyleData);
    return () => {
      mapInstance.off("styledata", onStyleData);
    };
  }, [isDarkMode]);

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
            <div className="relative h-[28rem] w-full">
              <Map
                ref={(instance) => {
                  mapRef.current = instance;
                }}
                id="context-map"
                mapboxAccessToken={MAPBOX_ACCESS_TOKEN}
                initialViewState={MAP_INITIAL_VIEW_STATE}
                mapStyle={MAPBOX_STYLE_LIGHT_URL}
                reuseMaps
                attributionControl={false}
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>

          <Accordion type="single" collapsible defaultValue="layers" className="rounded-xl border border-secondary/30 bg-primary shadow-sm">
            <AccordionItem value="layers">
              <AccordionTrigger className="px-4 text-xs font-semibold uppercase tracking-wide text-secondary">Layers</AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="min-w-[12rem] flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide text-tertiary">View type</p>
                      <p className="text-sm text-secondary">Preset filters for situational focus.</p>
                    </div>
                    <div className="min-w-[14rem] flex-1 max-w-xs">
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
                    <div className="mt-2 flex flex-wrap gap-4">
                      {LAYER_CONTROLS.map((layer) => (
                        <Toggle
                          key={layer.id}
                          size="sm"
                          isSelected={layerVisibility[layer.id]}
                          onChange={(isSelected) =>
                            setLayerVisibility((prev) => ({
                              ...prev,
                              [layer.id]: isSelected,
                            }))
                          }
                          label={layer.label}
                          hint={layer.description}
                        />
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
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Vision hints</p>
          {isVisionLoading && (
            <p className="mt-1 text-xs text-tertiary">Pulling Google Vision context… maps will update when the response returns.</p>
          )}
          {highlightTerms.length === 0 && !isVisionLoading && (
            <p className="mt-1 text-sm text-tertiary">No best guesses yet. Showing the default Canada overview.</p>
          )}
          {highlightTerms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {highlightTerms.map((term) => (
                <Badge key={term} color="brand" size="sm">
                  {term}
                </Badge>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </AnalysisCardFrame>
  );
}
