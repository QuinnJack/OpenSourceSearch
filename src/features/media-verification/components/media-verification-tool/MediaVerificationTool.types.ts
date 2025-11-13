import type { ReactNode } from "react";

import type { GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
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
}

export interface MediaVerificationProps {
  file: MediaVerificationFile;
  onBack: () => void;
  data?: AnalysisData;
  headerActions?: ReactNode;
}
