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
import { API_KEY_CHANGE_EVENT, isApiKeyConfigured } from "@/shared/config/api-keys";

type VerificationView = "upload" | "analyze";

const hasGoogleVisionConfiguration = (): boolean => isApiKeyConfigured("google_vision");

const hasGeminiConfiguration = (): boolean => isApiKeyConfigured("gemini");

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

export interface VideoFrameSelection {
  parentId: string;
  videoName: string;
  videoSize: number;
  videoPreviewUrl?: string;
  videoDurationMs?: number;
  frames: UploadedFile[];
  activeIndex: number;
  sourceUrl?: string;
}

interface UseVerificationWorkflowResult {
  view: VerificationView;
  selectedFile: UploadedFile | null;
  analysisData: AnalysisData | undefined;
  videoContext: VideoFrameSelection | null;
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
  handleFrameSelection: (index: number) => void;
}

export const useVerificationWorkflow = (): UseVerificationWorkflowResult => {
  const [view, setView] = useState<VerificationView>("upload");
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | undefined>(
    undefined,
  );
  const [videoContext, setVideoContext] = useState<VideoFrameSelection | null>(null);
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

  const hydrateFrameFromCaches = (frame: UploadedFile): UploadedFile => {
    const cacheId = frame.id;
    const cachedVision = visionDataCache[cacheId];
    const cachedGeo = geolocationDataCache[cacheId];
    const cachedCoords = geolocationCoordinatesCache[cacheId];
    const cachedLayerRecommendation = layerRecommendationCache[cacheId];
    const layerRecommendationError = layerRecommendationErrorCache[cacheId];

    return {
      ...frame,
      visionWebDetection: cachedVision ?? frame.visionWebDetection,
      visionRequested: frame.visionRequested || Boolean(cachedVision),
      visionLoading: frame.visionLoading || Boolean(visionLoadingCache[cacheId]),
      geolocationAnalysis: cachedGeo ?? frame.geolocationAnalysis,
      geolocationRequested: frame.geolocationRequested || Boolean(cachedGeo),
      geolocationLoading: frame.geolocationLoading || Boolean(geolocationLoadingCache[cacheId]),
      geolocationConfidence: cachedGeo?.confidenceScore ?? frame.geolocationConfidence ?? null,
      geolocationCoordinates: cachedCoords ?? frame.geolocationCoordinates ?? null,
      geolocationCoordinatesLoading:
        frame.geolocationCoordinatesLoading || Boolean(geolocationCoordinatesLoadingCache[cacheId]),
      locationLayerRecommendation: cachedLayerRecommendation ?? frame.locationLayerRecommendation,
      locationLayerRecommendationLoading:
        frame.locationLayerRecommendationLoading || Boolean(layerRecommendationLoadingCache[cacheId]),
      locationLayerRecommendationError: layerRecommendationError ?? frame.locationLayerRecommendationError,
    };
  };

  const [googleVisionAvailable, setGoogleVisionAvailable] = useState<boolean>(() =>
    hasGoogleVisionConfiguration(),
  );
  const [geolocationAvailable, setGeolocationAvailable] = useState<boolean>(() =>
    hasGeminiConfiguration(),
  );
  const [googleMapsGeocodingAvailable, setGoogleMapsGeocodingAvailable] = useState<boolean>(() =>
    hasGoogleMapsConfiguration(),
  );

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

  const refreshApiAvailability = useCallback(() => {
    setGoogleVisionAvailable(hasGoogleVisionConfiguration());
    setGeolocationAvailable(hasGeminiConfiguration());
    setGoogleMapsGeocodingAvailable(hasGoogleMapsConfiguration());
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeyChange = () => {
      refreshApiAvailability();
    };
    const eventListener = handleKeyChange as EventListener;

    window.addEventListener(API_KEY_CHANGE_EVENT, eventListener);
    window.addEventListener("storage", eventListener);

    return () => {
      window.removeEventListener(API_KEY_CHANGE_EVENT, eventListener);
      window.removeEventListener("storage", eventListener);
    };
  }, [refreshApiAvailability]);

  useEffect(() => {
    if (!googleVisionAvailable) {
      setEnableGoogleVision(false);
      setApiToggleOverride("google_vision", false);
    }
  }, [googleVisionAvailable]);

  useEffect(() => {
    if (!geolocationAvailable) {
      setEnableGeolocation(false);
      setApiToggleOverride("geolocation", false);
    }
  }, [geolocationAvailable]);

  const applyFrameMutation = useCallback(
    (frameId: string, updater: (frame: UploadedFile) => UploadedFile) => {
      let updatedFrame: UploadedFile | null = null;
      setVideoContext((prev) => {
        if (!prev) {
          return prev;
        }
        const targetIndex = prev.frames.findIndex((frame) => frame.id === frameId);
        if (targetIndex === -1) {
          return prev;
        }
        const frames = [...prev.frames];
        updatedFrame = updater(frames[targetIndex]);
        frames[targetIndex] = updatedFrame;
        return { ...prev, frames };
      });
      if (updatedFrame && selectedFile?.id === frameId) {
        setSelectedFile(updatedFrame);
        setAnalysisData(buildAnalysisDataFromFile(updatedFrame));
      }
    },
    [selectedFile, setSelectedFile, setAnalysisData],
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
      applyFrameMutation(cacheKey, (frame) => ({
        ...frame,
        visionLoading: true,
        visionRequested: true,
      }));

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
        applyFrameMutation(cacheKey, (frame) => ({
          ...frame,
          visionWebDetection: result,
          visionLoading: false,
          visionRequested: true,
        }));
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
        applyFrameMutation(cacheKey, (frame) => ({
          ...frame,
          visionLoading: false,
        }));
      }
    },
    [enableGoogleVision, googleVisionAvailable, visionDataCache, visionLoadingCache, applyFrameMutation],
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
      applyFrameMutation(cacheKey, (frame) => ({
        ...frame,
        geolocationLoading: true,
        geolocationRequested: true,
        geolocationError: undefined,
      }));

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
          applyFrameMutation(cacheKey, (frame) => ({
            ...frame,
            geolocationAnalysis: result,
            geolocationLoading: false,
            geolocationError: undefined,
            geolocationRequested: true,
            geolocationConfidence: result.confidenceScore ?? frame.geolocationConfidence ?? null,
          }));
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
          applyFrameMutation(cacheKey, (frame) => ({
            ...frame,
            geolocationError: message,
            geolocationLoading: false,
            geolocationRequested: true,
          }));
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
          applyFrameMutation(cacheKey, (frame) => ({
            ...frame,
            geolocationLoading: false,
            geolocationRequested: true,
          }));
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
      applyFrameMutation,
    ],
  );

  const handleContinue = useCallback(
    (file: UploadedFile) => {
      const frames = file.mediaType === "video" && file.videoFrames?.length ? file.videoFrames : [file];

      const prepared = frames.map((frame) => {
        const hydrated = hydrateFrameFromCaches(frame);
        const cacheId = frame.id;
        const cachedVision = visionDataCache[cacheId];
        const isVisionLoading = Boolean(visionLoadingCache[cacheId]);
        const shouldRequestVision =
          enableGoogleVision &&
          googleVisionAvailable &&
          (!hydrated.visionRequested || (!cachedVision && !isVisionLoading));
        const cachedGeolocation = geolocationDataCache[cacheId];
        const isGeolocationLoading = Boolean(geolocationLoadingCache[cacheId]);
        const shouldRequestGeolocation =
          enableGeolocation &&
          geolocationAvailable &&
          (!hydrated.geolocationRequested || (!cachedGeolocation && !isGeolocationLoading));
        const cachedCoordinates = geolocationCoordinatesCache[cacheId];
        const isCoordinatesLoading = Boolean(geolocationCoordinatesLoadingCache[cacheId]);
        const cachedLayerRecommendation = layerRecommendationCache[cacheId];
        const isLayerLoading = Boolean(layerRecommendationLoadingCache[cacheId]);
        const layerError = layerRecommendationErrorCache[cacheId];

        return {
          frame: {
            ...hydrated,
            visionLoading: shouldRequestVision || isVisionLoading,
            visionRequested: hydrated.visionRequested || shouldRequestVision,
            geolocationLoading: shouldRequestGeolocation || isGeolocationLoading,
            geolocationRequested: hydrated.geolocationRequested || shouldRequestGeolocation,
            geolocationError: shouldRequestGeolocation ? undefined : hydrated.geolocationError,
            geolocationConfidence:
              cachedGeolocation?.confidenceScore ?? hydrated.geolocationConfidence ?? null,
            geolocationCoordinates: cachedCoordinates ?? hydrated.geolocationCoordinates ?? null,
            geolocationCoordinatesLoading: isCoordinatesLoading,
            locationLayerRecommendation: cachedLayerRecommendation ?? hydrated.locationLayerRecommendation,
            locationLayerRecommendationLoading:
              isLayerLoading || (shouldRequestGeolocation && !cachedLayerRecommendation),
            locationLayerRecommendationError: layerError ?? hydrated.locationLayerRecommendationError,
          },
          shouldRequestVision,
          shouldRequestGeolocation,
        };
      });

      const [activeEntry] = prepared;
      if (!activeEntry) {
        return;
      }

      setSelectedFile(activeEntry.frame);
      setAnalysisData(buildAnalysisDataFromFile(activeEntry.frame));
      setView("analyze");

      if (frames.length > 1) {
        setVideoContext({
          parentId: file.id,
          videoName: file.name,
          videoSize: file.size,
          videoPreviewUrl: file.videoPreviewUrl ?? file.previewUrl,
          videoDurationMs: file.videoDurationMs,
          frames: prepared.map((entry) => entry.frame),
          activeIndex: 0,
          sourceUrl: file.sourceUrl,
        });
      } else {
        setVideoContext(null);
      }

      prepared.forEach(({ frame, shouldRequestVision, shouldRequestGeolocation }) => {
        if (shouldRequestVision) {
          void requestVisionForFile({ ...frame, visionRequested: true });
        }
        if (shouldRequestGeolocation) {
          void requestGeolocationForFile({ ...frame, geolocationRequested: true });
        }
      });
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
      hydrateFrameFromCaches,
    ],
  );

  const handleBack = useCallback(() => {
    setSelectedFile(null);
    setAnalysisData(undefined);
    setVideoContext(null);
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
      setVideoContext(null);
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

  const handleFrameSelection = useCallback(
    (index: number) => {
      setVideoContext((prev) => {
        if (!prev) {
          return prev;
        }
        const clampedIndex = Math.max(0, Math.min(prev.frames.length - 1, index));
        const targetFrame = prev.frames[clampedIndex];
        if (!targetFrame) {
          return prev;
        }
        setSelectedFile(targetFrame);
        setAnalysisData(buildAnalysisDataFromFile(targetFrame));
        return { ...prev, activeIndex: clampedIndex };
      });
    },
    [setSelectedFile, setAnalysisData],
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
    videoContext,
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
    handleFrameSelection,
  };
};
