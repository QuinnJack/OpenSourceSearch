import type { ReactNode } from "react";

import type { GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import type {
  GeolocationAnalysis,
  LocationLayerRecommendation,
} from "@/features/media-verification/api/geolocation";
import type { GeocodedLocation } from "@/features/media-verification/api/geocoding";
import type { AnalysisData } from "@/shared/types/analysis";

export interface MediaVerificationFile {
  name: string;
  size: number;
  previewUrl?: string;
  /** Optional public source URL for the media */
  sourceUrl?: string;
  /** Base64-encoded representation of the image without the data URL prefix */
  base64Content?: string;
  /** True while Google Vision web detection is still loading */
  visionLoading?: boolean;
  /** Cached Google Vision response, used to derive context maps */
  visionWebDetection?: GoogleVisionWebDetectionResult;
  /** Cached Gemini geolocation analysis */
  geolocationAnalysis?: GeolocationAnalysis;
  /** True while Gemini geolocation is running */
  geolocationLoading?: boolean;
  /** Captured Gemini geolocation error */
  geolocationError?: string;
  /** Whether a geolocation request has been made */
  geolocationRequested?: boolean;
  /** Gemini-provided confidence score (0-10) */
  geolocationConfidence?: number | null;
  /** Coordinates resolved from the Gemini location prediction */
  geolocationCoordinates?: GeocodedLocation | null;
  /** Indicates the coordinate lookup is in-flight */
  geolocationCoordinatesLoading?: boolean;
  /** Error from coordinate lookup */
  geolocationCoordinatesError?: string;
  /** Gemini layer recommendations for the context map */
  locationLayerRecommendation?: LocationLayerRecommendation;
  /** True while Gemini evaluates relevant layers to toggle */
  locationLayerRecommendationLoading?: boolean;
  /** Error returned from the layer recommendation attempt (if any) */
  locationLayerRecommendationError?: string;
}

export interface MediaVerificationProps {
  file: MediaVerificationFile;
  onBack: () => void;
  data?: AnalysisData;
  headerActions?: ReactNode;
  geolocationEnabled?: boolean;
  geolocationAvailable?: boolean;
}
