export type ValidityStatus = "warning" | "error" | "info";

export interface AiDetectionData {
  status: ValidityStatus;
  label: string;
  confidence: number; // 0-100
  details: string;
  /** Optional confidence score from the SightEngine API, 0-100 */
  sightengineConfidence?: number;
}

export interface MetadataEntry {
  label: string;
  value: string;
  tone?: "error" | "success" | "warning" | "neutral";
}

export interface MetadataData {
  status: ValidityStatus;
  exifStripped: boolean;
  gpsData: boolean;
  details: string;
  entries?: MetadataEntry[];
}

export interface SynthesisData {
  status: ValidityStatus;
  origin: string;
  details: string;
}

export interface AnalysisData {
  aiDetection: AiDetectionData;
  metadata: MetadataData;
  synthesis: SynthesisData;
}
