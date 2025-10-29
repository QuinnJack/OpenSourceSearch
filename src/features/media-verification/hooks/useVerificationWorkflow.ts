import { useCallback, useEffect, useState } from "react";

import { fetchVisionWebDetection, type GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import { DEFAULT_ANALYSIS_DATA } from "@/features/media-verification/constants/defaultAnalysisData";
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
  handleContinue: (file: UploadedFile) => void;
  handleBack: () => void;
  handleLinkSubmit: (link: string) => void;
  handleToggleSightengine: (enabled: boolean) => void;
  handleToggleGoogleImages: (enabled: boolean) => void;
  handleToggleGoogleVision: (enabled: boolean) => void;
  requestVisionForFile: (file: UploadedFile) => void;
  googleVisionAvailable: boolean;
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

  const googleVisionAvailable = hasGoogleVisionConfiguration();

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

  const requestVisionForFile = useCallback(
    (file: UploadedFile) => {
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

      void fetchVisionWebDetection({
        base64Content,
        imageUri,
        maxResults: 24,
      })
        .then((result) => {
          setVisionDataCache((prev) => ({ ...prev, [cacheKey]: result }));
          setSelectedFile((prev) => {
            if (!prev || prev.id !== cacheKey) {
              return prev;
            }
            const updated = { ...prev, visionWebDetection: result, visionLoading: false };
            setAnalysisData(buildAnalysisDataFromFile(updated));
            return updated;
          });
        })
        .catch((error) => {
          console.error("Google Vision web detection failed", error);
        })
        .finally(() => {
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
        });
    },
    [enableGoogleVision, googleVisionAvailable, visionDataCache, visionLoadingCache],
  );

  const handleContinue = useCallback(
    (file: UploadedFile) => {
      const cachedVisionData = visionDataCache[file.id];
      const isLoadingVision = Boolean(visionLoadingCache[file.id]);
      const shouldRequestVision =
        enableGoogleVision &&
        googleVisionAvailable &&
        (!file.visionRequested || (!cachedVisionData && !isLoadingVision));

      const nextFile: UploadedFile = {
        ...file,
        visionWebDetection: cachedVisionData ?? file.visionWebDetection,
        visionLoading: shouldRequestVision || isLoadingVision,
        visionRequested: file.visionRequested || shouldRequestVision,
      };

      setSelectedFile(nextFile);
      setAnalysisData(buildAnalysisDataFromFile(nextFile));
      setView("analyze");

      if (shouldRequestVision) {
        requestVisionForFile({ ...nextFile, visionRequested: true });
      }
    },
    [enableGoogleVision, googleVisionAvailable, requestVisionForFile, visionDataCache, visionLoadingCache],
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
      const nextFile: UploadedFile = shouldRequestVision
        ? { ...remoteFile, visionRequested: true, visionLoading: true }
        : remoteFile;

      setSelectedFile(nextFile);
      setAnalysisData(buildAnalysisDataFromFile(nextFile));
      setView("analyze");

      if (shouldRequestVision) {
        requestVisionForFile(nextFile);
      }
    },
    [enableGoogleVision, googleVisionAvailable, requestVisionForFile],
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

    requestVisionForFile({ ...selectedFile, visionRequested: true });
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
    handleContinue,
    handleBack,
    handleLinkSubmit,
    handleToggleSightengine,
    handleToggleGoogleImages,
    handleToggleGoogleVision,
    requestVisionForFile,
    googleVisionAvailable,
  };
};
