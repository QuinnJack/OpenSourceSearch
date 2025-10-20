export type ValidityStatus = "warning" | "error" | "info";

export interface AiDetectionData {
  status: ValidityStatus;
  label: string;
  confidence: number; // 0-100
  details: string;
  /** Optional confidence score from the SightEngine API, 0-100 */
  sightengineConfidence?: number;
  /**
   * Provider-level confidence scores that contribute to the averaged confidence value.
   * Each entry represents a single provider's confidence percentage.
   */
  confidenceBreakdown?: Array<{
    providerId: string;
    label: string;
    value: number;
  }>;
}

export interface MetadataEntry {
  label: string;
  value: string;
  tone?: "error" | "success" | "warning" | "neutral";
}

export interface MetadataGroup {
  title: string;
  entries: MetadataEntry[];
}

export interface MetadataData {
  status: ValidityStatus;
  exifStripped: boolean;
  gpsData: boolean;
  details: string;
  entries?: MetadataEntry[];
  groups?: MetadataGroup[];
  bigEndian?: boolean;
  error?: string;
}

export interface SynthesisData {
  status: ValidityStatus;
  origin: string;
  details: string;
}

export type WebMatchType = "full" | "partial" | "similar";

export interface CirculationWebMatch {
  pageTitle: string;
  url: string;
  matchType: WebMatchType;
  organization?: string;
  /** Optional short summary or snippet from the page where the image appears */
  snippet?: string;
  /**
   * The first seen date in ISO-8601 format (YYYY-MM-DD).
   * This is typically when the source was first indexed with a matching image.
   */
  dateDetected?: string;
  /**
   * Last seen or last indexed date in ISO-8601 format (YYYY-MM-DD).
   * Useful to show ongoing circulation.
   */
  lastSeen?: string;
  /** Optional set of entity IDs associated with the match (e.g., Knowledge Graph IDs). */
  entityIds?: string[];
}

export interface CirculationData {
  webMatches: CirculationWebMatch[];
}

export interface AnalysisData {
  aiDetection: AiDetectionData;
  metadata: MetadataData;
  synthesis: SynthesisData;
  circulation: CirculationData;
}
