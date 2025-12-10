import { useCallback, useEffect, useState } from "react";

import { fetchVisionWebDetection, type GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import {
  fetchGeolocationAnalysis,
  fetchLocationLayerRecommendation,
  type GeolocationAnalysis,
  type LocationLayerRecommendation,
} from "@/features/media-verification/api/geolocation";
import {
  fetchGeocodedLocation,
  hasGoogleMapsConfiguration,
  type GeocodedLocation,
} from "@/features/media-verification/api/geocoding";
import { DEFAULT_ANALYSIS_DATA } from "@/features/media-verification/constants/defaultAnalysisData";
import { MAP_LAYER_CONFIGS } from "@/features/media-verification/components/media-verification-tool/map-layer-config";
import type { AnalysisData } from "@/shared/types/analysis";
import { isApiEnabled, setApiToggleOverride } from "@/shared/config/api-toggles";
import type { UploadedFile } from "@/features/uploads/components/file-upload/file-uploader";

type VerificationView = "upload" | "analyze";

const hasGoogleVisionConfiguration = (): boolean => {
  if (typeof import.meta === "undefined" || typeof import.meta.env !== "object") {
    return false;
  }

  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = env.VITE_GOOGLE_VISION_API_KEY;
  return typeof apiKey === "string" && apiKey.trim().length > 0;
};

const hasGeminiConfiguration = (): boolean => {
  if (typeof import.meta === "undefined" || typeof import.meta.env !== "object") {
    return false;
  }

  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = env.VITE_GEMINI_API_KEY;
  return typeof apiKey === "string" && apiKey.trim().length > 0;
};

const deriveFileNameFromUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const cleaned = pathname.split("?")[0].split("#")[0];
    if (cleaned) {
      return cleaned;
    }

    const hostSlug = url.hostname
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/(^-|-$)/g, "");
    return hostSlug ? `${hostSlug}.jpg` : "remote-image.jpg";
  } catch {
    return "remote-image.jpg";
  }
};

const sanitizeLocationLabel = (label: string | undefined): string | undefined => {
  if (!label) {
    return undefined;
  }

  return label
    .replace(/\[\d+\]\([^)]*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();
};

const deriveLocationLabel = (analysis?: GeolocationAnalysis): string | undefined => {
  if (!analysis) {
    return undefined;
  }
  if (analysis.locationLine && analysis.locationLine.trim().length > 0) {
    return analysis.locationLine;
  }
  if (analysis.answerWithCitations && analysis.answerWithCitations.trim().length > 0) {
    const firstLine = analysis.answerWithCitations.split(/\n+/).find((line) => line.trim().length > 0);
    if (firstLine) {
      return firstLine;
    }
  }
  if (analysis.answer && analysis.answer.trim().length > 0) {
    const firstLine = analysis.answer.split(/\n+/).find((line) => line.trim().length > 0);
    if (firstLine) {
      return firstLine;
    }
  }
  return undefined;
};

const LOCATION_LAYER_MANIFEST = MAP_LAYER_CONFIGS.map((layer) => ({
  id: layer.id,
  label: layer.label,
  description: layer.description,
  viewTypes: layer.viewTypes,
  kind: layer.kind,
}));

const createLinkUploadedFile = (url: string): UploadedFile => {
  const identifier =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `link-${Date.now()}`;

  return {
    id: identifier,
    name: deriveFileNameFromUrl(url),
    size: 0,
    progress: 100,
    analysisState: "complete",
    previewUrl: url,
    sourceUrl: url,
    fileObject: undefined,
    base64Content: undefined,
    sightengineConfidence: undefined,
    analysisError: undefined,
    exifSummary: undefined,
    exifLoading: false,
    visionRequested: false,
    visionWebDetection: undefined,
    visionLoading: false,
    mimeType: null,
    geolocationRequested: false,
    geolocationAnalysis: undefined,
    geolocationLoading: false,
    geolocationError: undefined,
    geolocationConfidence: null,
    geolocationCoordinates: null,
    geolocationCoordinatesLoading: false,
    geolocationCoordinatesError: undefined,
    locationLayerRecommendation: undefined,
    locationLayerRecommendationLoading: false,
    locationLayerRecommendationError: undefined,
  };
};

const buildAnalysisDataFromFile = (file: UploadedFile): AnalysisData => {
  const base = DEFAULT_ANALYSIS_DATA;

  const summary = file.exifSummary;

  const metadata = summary
    ? {
        status: summary.status,
        exifStripped: summary.exifStripped,
        gpsData: summary.gpsData,
        details: summary.details,
        entries: summary.entries,
        groups: summary.groups,
        bigEndian: summary.bigEndian,
        error: summary.error,
      }
    : {
        ...base.metadata,
        entries: base.metadata.entries ? [...base.metadata.entries] : undefined,
        groups: base.metadata.groups ? [...base.metadata.groups] : undefined,
        bigEndian: base.metadata.bigEndian,
        error: base.metadata.error,
      };

  const aiConfidence = file.sightengineConfidence;
  const confidenceBreakdown =
    typeof aiConfidence === "number"
      ? [
          {
            providerId: "sightengine",
            label: "SightEngine",
            value: aiConfidence,
          },
        ]
      : [];

  const confidence =
    confidenceBreakdown.length > 0
      ? Math.round(
          confidenceBreakdown.reduce((total, entry) => total + entry.value, 0) /
            confidenceBreakdown.length,
        )
      : base.aiDetection.confidence;

  let status = base.aiDetection.status;
  if (typeof aiConfidence === "number") {
    status =
      aiConfidence >= 80 ? "error" : aiConfidence >= 45 ? "warning" : "info";
  }

  let label = base.aiDetection.label;
  if (typeof aiConfidence === "number") {
    label =
      status === "error"
        ? "Likely AI-generated"
        : status === "warning"
          ? "Possible Manipulation"
          : "Likely Authentic";
  }

  const aiDetails =
    typeof aiConfidence === "number"
      ? `SightEngine reports a ${aiConfidence}% likelihood that this media was AI-generated.`
      : base.aiDetection.details;

  const visionData = file.visionWebDetection;
  const resolvedWebMatches = visionData?.matches?.length
    ? visionData.matches
    : base.circulation.webMatches;
  const resolvedPartialMatches = visionData?.partialMatchingImages?.length
    ? visionData.partialMatchingImages
    : base.circulation.partialMatchingImages;
  const resolvedSimilarImages = visionData?.visuallySimilarImages?.length
    ? visionData.visuallySimilarImages
    : base.circulation.visuallySimilarImages;

  return {
    ...base,
    aiDetection: {
      ...base.aiDetection,
      status,
      label,
      confidence,
      sightengineConfidence: aiConfidence,
      confidenceBreakdown,
      details: aiDetails,
    },
    metadata,
    synthesis: {
      ...base.synthesis,
    },
    circulation: {
      webMatches: resolvedWebMatches.map((match) => ({ ...match })),
      partialMatchingImages: resolvedPartialMatches.map((image) => ({ ...image })),
      visuallySimilarImages: resolvedSimilarImages.map((image) => ({ ...image })),
    },
  };
};

interface UseVerificationWorkflowResult {
  view: VerificationView;
  selectedFile: UploadedFile | null;
  analysisData: AnalysisData | undefined;
  enableSightengine: boolean;
  enableGoogleImages: boolean;
  enableGoogleVision: boolean;
  enableGeolocation: boolean;
  handleContinue: (file: UploadedFile) => void;
  handleBack: () => void;
  handleLinkSubmit: (link: string) => void;
  handleToggleSightengine: (enabled: boolean) => void;
  handleToggleGoogleImages: (enabled: boolean) => void;
  handleToggleGoogleVision: (enabled: boolean) => void;
  handleToggleGeolocation: (enabled: boolean) => void;
  requestVisionForFile: (file: UploadedFile) => Promise<void>;
  requestGeolocationForFile: (file: UploadedFile) => Promise<void>;
  googleVisionAvailable: boolean;
  geolocationAvailable: boolean;
}

export const useVerificationWorkflow = (): UseVerificationWorkflowResult => {
  const [view, setView] = useState<VerificationView>("upload");
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | undefined>(
    undefined,
  );
  const [visionDataCache, setVisionDataCache] = useState<
    Record<string, GoogleVisionWebDetectionResult>
  >({});
  const [visionLoadingCache, setVisionLoadingCache] = useState<
    Record<string, boolean>
  >({});
  const [geolocationDataCache, setGeolocationDataCache] = useState<
    Record<string, GeolocationAnalysis>
  >({});
  const [geolocationLoadingCache, setGeolocationLoadingCache] = useState<
    Record<string, boolean>
  >({});
  const [layerRecommendationCache, setLayerRecommendationCache] = useState<
    Record<string, LocationLayerRecommendation>
  >({});
  const [layerRecommendationLoadingCache, setLayerRecommendationLoadingCache] = useState<
    Record<string, boolean>
  >({});
  const [layerRecommendationErrorCache, setLayerRecommendationErrorCache] = useState<
    Record<string, string | undefined>
  >({});
  const [geolocationCoordinatesCache, setGeolocationCoordinatesCache] = useState<
    Record<string, GeocodedLocation | null>
  >({});
  const [geolocationCoordinatesLoadingCache, setGeolocationCoordinatesLoadingCache] = useState<
    Record<string, boolean>
  >({});

  const googleVisionAvailable = hasGoogleVisionConfiguration();
  const geolocationAvailable = hasGeminiConfiguration();
  const googleMapsGeocodingAvailable = hasGoogleMapsConfiguration();

  // Local state mirrors persisted API toggles
  const [enableSightengine, setEnableSightengine] = useState<boolean>(() =>
    isApiEnabled("sightengine"),
  );
  const [enableGoogleImages, setEnableGoogleImages] = useState<boolean>(() =>
    isApiEnabled("google_images"),
  );
  const [enableGoogleVision, setEnableGoogleVision] = useState<boolean>(() =>
    googleVisionAvailable && isApiEnabled("google_vision"),
  );
  const [enableGeolocation, setEnableGeolocation] = useState<boolean>(() =>
    geolocationAvailable && isApiEnabled("geolocation"),
  );

  const requestVisionForFile = useCallback(
    async (file: UploadedFile): Promise<void> => {
      if (!enableGoogleVision || !googleVisionAvailable) {
        return;
      }

      const cacheKey = file.id;
      if (visionDataCache[cacheKey] || visionLoadingCache[cacheKey]) {
        return;
      }

      const base64Content = file.base64Content;
      const imageUri = base64Content ? undefined : file.sourceUrl ?? file.previewUrl;

      if (!base64Content && !imageUri) {
        return;
      }

      setVisionLoadingCache((prev) => ({ ...prev, [cacheKey]: true }));
      setSelectedFile((prev) => {
        if (!prev || prev.id !== cacheKey) {
          return prev;
        }
        return { ...prev, visionLoading: true };
      });

      try {
        const result = await fetchVisionWebDetection({
          base64Content,
          imageUri,
          maxResults: 24,
        });
        setVisionDataCache((prev) => ({ ...prev, [cacheKey]: result }));
        setSelectedFile((prev) => {
          if (!prev || prev.id !== cacheKey) {
            return prev;
          }
          const updated = { ...prev, visionWebDetection: result, visionLoading: false };
          setAnalysisData(buildAnalysisDataFromFile(updated));
          return updated;
        });
      } catch (error) {
        console.error("Google Vision web detection failed", error);
      } finally {
        setVisionLoadingCache((prev) => {
          const next = { ...prev };
          delete next[cacheKey];
          return next;
        });
        setSelectedFile((prev) => {
          if (!prev || prev.id !== cacheKey) {
            return prev;
          }
          return { ...prev, visionLoading: false };
        });
      }
    },
    [enableGoogleVision, googleVisionAvailable, visionDataCache, visionLoadingCache],
  );

  const startCoordinateLookup = useCallback(
    (fileId: string, locationLabel?: string) => {
      const normalizedLabel = sanitizeLocationLabel(locationLabel);
      if (!googleMapsGeocodingAvailable || !normalizedLabel) {
        if (process.env.NODE_ENV !== "production") {
          console.debug("[Workflow] skip geocode", { fileId, hasGeocoding: googleMapsGeocodingAvailable, normalizedLabel });
        }
        return;
      }

      if (
        geolocationCoordinatesCache[fileId] ||
        geolocationCoordinatesLoadingCache[fileId]
      ) {
        return;
      }

      setGeolocationCoordinatesLoadingCache((prev) => ({ ...prev, [fileId]: true }));
      setSelectedFile((prev) => {
        if (!prev || prev.id !== fileId) {
          return prev;
        }
        if (process.env.NODE_ENV !== "production") {
          console.debug("[Workflow] geocode start", { fileId, normalizedLabel });
        }
        return {
          ...prev,
          geolocationCoordinatesLoading: true,
          geolocationCoordinatesError: undefined,
        };
      });

      void fetchGeocodedLocation(normalizedLabel)
        .then((coords) => {
          if (coords) {
            setGeolocationCoordinatesCache((prev) => ({ ...prev, [fileId]: coords }));
          }
          setSelectedFile((prev) => {
            if (!prev || prev.id !== fileId) {
              return prev;
            }
        if (process.env.NODE_ENV !== "production") {
          console.debug("[Workflow] geocode found", { fileId, coords });
        }
            return {
              ...prev,
              geolocationCoordinates: coords ?? prev.geolocationCoordinates ?? null,
              geolocationCoordinatesLoading: false,
              geolocationCoordinatesError: coords ? undefined : prev.geolocationCoordinatesError,
            };
          });
        })
        .catch((error) => {
          console.error("Geocoding failed", error);
          setSelectedFile((prev) => {
            if (!prev || prev.id !== fileId) {
              return prev;
            }
            if (process.env.NODE_ENV !== "production") {
              console.debug("[Workflow] geocode error", {
                fileId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
            return {
              ...prev,
              geolocationCoordinatesLoading: false,
              geolocationCoordinatesError:
                error instanceof Error ? error.message : "Unable to look up coordinates.",
            };
          });
        })
        .finally(() => {
          setGeolocationCoordinatesLoadingCache((prev) => {
            const next = { ...prev };
            delete next[fileId];
            return next;
          });
        });
    },
    [
      googleMapsGeocodingAvailable,
      geolocationCoordinatesCache,
      geolocationCoordinatesLoadingCache,
      setSelectedFile,
      setGeolocationCoordinatesCache,
    ],
  );

  const requestLayerRecommendationForFile = useCallback(
    (file: UploadedFile): Promise<void> => {
      if (!enableGeolocation || !geolocationAvailable) {
        return Promise.resolve();
      }

      const cacheKey = file.id;
      if (layerRecommendationCache[cacheKey] || layerRecommendationLoadingCache[cacheKey]) {
        return Promise.resolve();
      }

      const base64Content = file.base64Content;
      const imageUri = base64Content ? undefined : file.sourceUrl ?? file.previewUrl;
      if (!base64Content && !imageUri) {
        return Promise.resolve();
      }

      setLayerRecommendationLoadingCache((prev) => ({ ...prev, [cacheKey]: true }));
      setSelectedFile((prev) => {
        if (!prev || prev.id !== cacheKey) {
          return prev;
        }
        return {
          ...prev,
          locationLayerRecommendationLoading: true,
          locationLayerRecommendationError: undefined,
        };
      });

      return fetchLocationLayerRecommendation({
        base64Content,
        imageUri,
        mimeType: file.mimeType,
        layers: LOCATION_LAYER_MANIFEST,
      })
        .then((recommendation) => {
          setLayerRecommendationCache((prev) => ({ ...prev, [cacheKey]: recommendation }));
          setLayerRecommendationErrorCache((prev) => {
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
          setSelectedFile((prev) => {
            if (!prev || prev.id !== cacheKey) {
              return prev;
            }
            return {
              ...prev,
              locationLayerRecommendation: recommendation,
              locationLayerRecommendationLoading: false,
              locationLayerRecommendationError: undefined,
            };
          });
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Failed to fetch location layer guidance.";
          setLayerRecommendationErrorCache((prev) => ({ ...prev, [cacheKey]: message }));
          setSelectedFile((prev) => {
            if (!prev || prev.id !== cacheKey) {
              return prev;
            }
            return {
              ...prev,
              locationLayerRecommendationError: message,
              locationLayerRecommendationLoading: false,
            };
          });
        })
        .finally(() => {
          setLayerRecommendationLoadingCache((prev) => {
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
        });
    },
    [
      enableGeolocation,
      geolocationAvailable,
      layerRecommendationCache,
      layerRecommendationLoadingCache,
      setSelectedFile,
    ],
  );

  const requestGeolocationForFile = useCallback(
    async (file: UploadedFile): Promise<void> => {
      if (!enableGeolocation || !geolocationAvailable) {
        return;
      }

      const cacheKey = file.id;
      const cachedAnalysis = geolocationDataCache[cacheKey];
      if (cachedAnalysis) {
        const label = deriveLocationLabel(cachedAnalysis);
        startCoordinateLookup(cacheKey, label);
        await requestLayerRecommendationForFile(file);
        return;
      }

      if (geolocationLoadingCache[cacheKey]) {
        return;
      }

      const base64Content = file.base64Content;
      const imageUri = base64Content ? undefined : file.sourceUrl ?? file.previewUrl;
      if (!base64Content && !imageUri) {
        return;
      }

      const layerPromise = requestLayerRecommendationForFile(file);

      setGeolocationLoadingCache((prev) => ({ ...prev, [cacheKey]: true }));
      setSelectedFile((prev) => {
        if (!prev || prev.id !== cacheKey) {
          return prev;
        }
        return {
          ...prev,
          geolocationLoading: true,
          geolocationError: undefined,
          geolocationRequested: true,
        };
      });

      const geolocationPromise = fetchGeolocationAnalysis({
        base64Content,
        imageUri,
        mimeType: file.mimeType,
      })
        .then((result) => {
          setGeolocationDataCache((prev) => ({ ...prev, [cacheKey]: result }));
          setSelectedFile((prev) => {
            if (!prev || prev.id !== cacheKey) {
              return prev;
            }
            const updated: UploadedFile = {
              ...prev,
              geolocationAnalysis: result,
              geolocationLoading: false,
              geolocationError: undefined,
              geolocationRequested: true,
              geolocationConfidence: result.confidenceScore ?? prev.geolocationConfidence ?? null,
            };
            setAnalysisData(buildAnalysisDataFromFile(updated));
            return updated;
          });
          const label = deriveLocationLabel(result);
          startCoordinateLookup(cacheKey, label);
        })
        .catch((error) => {
          const message =
            error instanceof Error ? error.message : "Failed to retrieve a geolocation answer.";
          console.error("Gemini geolocation failed", error);
          setSelectedFile((prev) => {
            if (!prev || prev.id !== cacheKey) {
              return prev;
            }
            return {
              ...prev,
              geolocationError: message,
              geolocationLoading: false,
              geolocationRequested: true,
            };
          });
        })
        .finally(() => {
          setGeolocationLoadingCache((prev) => {
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
          setSelectedFile((prev) => {
            if (!prev || prev.id !== cacheKey) {
              return prev;
            }
            return { ...prev, geolocationLoading: false, geolocationRequested: true };
          });
        });

      await Promise.all([layerPromise, geolocationPromise]);
    },
    [
      enableGeolocation,
      geolocationAvailable,
      geolocationDataCache,
      geolocationLoadingCache,
      startCoordinateLookup,
      setAnalysisData,
      requestLayerRecommendationForFile,
    ],
  );

  const handleContinue = useCallback(
    (file: UploadedFile) => {
      const cachedVisionData = visionDataCache[file.id];
      const isLoadingVision = Boolean(visionLoadingCache[file.id]);
      const shouldRequestVision =
        enableGoogleVision &&
        googleVisionAvailable &&
        (!file.visionRequested || (!cachedVisionData && !isLoadingVision));
      const cachedGeolocationData = geolocationDataCache[file.id];
      const isLoadingGeolocation = Boolean(geolocationLoadingCache[file.id]);
      const shouldRequestGeolocation =
        enableGeolocation &&
        geolocationAvailable &&
        (!file.geolocationRequested || (!cachedGeolocationData && !isLoadingGeolocation));
      const cachedCoordinates = geolocationCoordinatesCache[file.id];
      const isLoadingCoordinates = Boolean(geolocationCoordinatesLoadingCache[file.id]);
      const cachedLayerRecommendation = layerRecommendationCache[file.id];
      const isLoadingLayerRecommendation = Boolean(layerRecommendationLoadingCache[file.id]);
      const layerRecommendationError = layerRecommendationErrorCache[file.id];

      const nextFile: UploadedFile = {
        ...file,
        visionWebDetection: cachedVisionData ?? file.visionWebDetection,
        visionLoading: shouldRequestVision || isLoadingVision,
        visionRequested: file.visionRequested || shouldRequestVision,
        geolocationAnalysis: cachedGeolocationData ?? file.geolocationAnalysis,
        geolocationLoading: shouldRequestGeolocation || isLoadingGeolocation,
        geolocationRequested: file.geolocationRequested || shouldRequestGeolocation,
        geolocationError: shouldRequestGeolocation ? undefined : file.geolocationError,
        geolocationConfidence:
          cachedGeolocationData?.confidenceScore ?? file.geolocationConfidence ?? null,
        geolocationCoordinates: cachedCoordinates ?? file.geolocationCoordinates ?? null,
        geolocationCoordinatesLoading: isLoadingCoordinates,
        geolocationCoordinatesError: file.geolocationCoordinatesError,
        locationLayerRecommendation: cachedLayerRecommendation ?? file.locationLayerRecommendation,
        locationLayerRecommendationLoading:
          isLoadingLayerRecommendation || (shouldRequestGeolocation && !cachedLayerRecommendation),
        locationLayerRecommendationError: layerRecommendationError ?? file.locationLayerRecommendationError,
      };

      setSelectedFile(nextFile);
      setAnalysisData(buildAnalysisDataFromFile(nextFile));
      setView("analyze");

      if (shouldRequestVision) {
        void requestVisionForFile({ ...nextFile, visionRequested: true });
      }
      if (shouldRequestGeolocation) {
        void requestGeolocationForFile({ ...nextFile, geolocationRequested: true });
      }
    },
    [
      enableGoogleVision,
      googleVisionAvailable,
      requestVisionForFile,
      visionDataCache,
      visionLoadingCache,
      enableGeolocation,
      geolocationAvailable,
      requestGeolocationForFile,
      geolocationDataCache,
      geolocationLoadingCache,
      geolocationCoordinatesCache,
      geolocationCoordinatesLoadingCache,
      layerRecommendationCache,
      layerRecommendationLoadingCache,
      layerRecommendationErrorCache,
    ],
  );

  const handleBack = useCallback(() => {
    setSelectedFile(null);
    setAnalysisData(undefined);
    setView("upload");
  }, []);

  const handleLinkSubmit = useCallback(
    (link: string) => {
      const remoteFile = createLinkUploadedFile(link);
      const shouldRequestVision = enableGoogleVision && googleVisionAvailable;
      const shouldRequestGeolocation = enableGeolocation && geolocationAvailable;
      const nextFile: UploadedFile = {
        ...remoteFile,
        visionRequested: shouldRequestVision,
        visionLoading: shouldRequestVision,
        geolocationRequested: shouldRequestGeolocation,
        geolocationLoading: shouldRequestGeolocation,
        geolocationConfidence: null,
        geolocationCoordinates: null,
        geolocationCoordinatesLoading: shouldRequestGeolocation,
        geolocationCoordinatesError: undefined,
        locationLayerRecommendation: undefined,
        locationLayerRecommendationLoading: shouldRequestGeolocation,
        locationLayerRecommendationError: undefined,
      };

      setSelectedFile(nextFile);
      setAnalysisData(buildAnalysisDataFromFile(nextFile));
      setView("analyze");

      if (shouldRequestVision) {
        void requestVisionForFile(nextFile);
      }
      if (shouldRequestGeolocation) {
        void requestGeolocationForFile(nextFile);
      }
    },
    [
      enableGoogleVision,
      googleVisionAvailable,
      requestVisionForFile,
      enableGeolocation,
      geolocationAvailable,
      requestGeolocationForFile,
    ],
  );

  const handleToggleSightengine = useCallback((enabled: boolean) => {
    setEnableSightengine(enabled);
    setApiToggleOverride("sightengine", enabled);
  }, []);

  const handleToggleGoogleImages = useCallback((enabled: boolean) => {
    setEnableGoogleImages(enabled);
    setApiToggleOverride("google_images", enabled);
  }, []);

  const handleToggleGoogleVision = useCallback(
    (enabled: boolean) => {
      if (enabled && !googleVisionAvailable) {
        console.warn("Google Vision cannot be enabled until VITE_GOOGLE_VISION_API_KEY is configured.");
        setEnableGoogleVision(false);
        setApiToggleOverride("google_vision", false);
        return;
      }

      setEnableGoogleVision(enabled);
      setApiToggleOverride("google_vision", enabled);
    },
    [googleVisionAvailable],
  );

  const handleToggleGeolocation = useCallback(
    (enabled: boolean) => {
      if (enabled && !geolocationAvailable) {
        console.warn("Geolocation cannot be enabled until VITE_GEMINI_API_KEY is configured.");
        setEnableGeolocation(false);
        setApiToggleOverride("geolocation", false);
        return;
      }

      setEnableGeolocation(enabled);
      setApiToggleOverride("geolocation", enabled);
    },
    [geolocationAvailable],
  );

  useEffect(() => {
    if (!enableGoogleVision || !selectedFile || !googleVisionAvailable) {
      return;
    }

    const cacheKey = selectedFile.id;
    const hasMatches = Boolean(visionDataCache[cacheKey]?.matches?.length);
    const isLoadingVision = Boolean(visionLoadingCache[cacheKey]);

    if (hasMatches || isLoadingVision) {
      return;
    }

    void requestVisionForFile({ ...selectedFile, visionRequested: true });
  }, [
    enableGoogleVision,
    requestVisionForFile,
    selectedFile,
    visionDataCache,
    visionLoadingCache,
    googleVisionAvailable,
  ]);

  return {
    view,
    selectedFile,
    analysisData,
    enableSightengine,
    enableGoogleImages,
    enableGoogleVision,
    enableGeolocation,
    handleContinue,
    handleBack,
    handleLinkSubmit,
    handleToggleSightengine,
    handleToggleGoogleImages,
    handleToggleGoogleVision,
    handleToggleGeolocation,
    requestVisionForFile,
    googleVisionAvailable,
    geolocationAvailable,
    requestGeolocationForFile,
  };
};
