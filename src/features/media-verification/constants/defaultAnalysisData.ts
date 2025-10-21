import type { AnalysisData, CirculationImageReference, CirculationWebMatch } from "@/shared/types/analysis";

const DEFAULT_WEB_MATCHES: CirculationWebMatch[] = [
  {
    pageTitle: "",
    url: "",
    organization: "",
    matchType: "full",
    snippet: "",
    dateDetected: "",
    lastSeen: "",
    entityIds: [],
  },
];

const DEFAULT_IMAGE_REFERENCES: CirculationImageReference[] = [];

export const DEFAULT_ANALYSIS_DATA: AnalysisData = {
  aiDetection: {
    status: "warning",
    label: "Edited",
    confidence: 0,
    details: "",
    confidenceBreakdown: [],
  },
  metadata: {
    status: "error",
    exifStripped: true,
    gpsData: false,
    details: "EXIF metadata has been removed or stripped from this image",
    entries: [
      { label: "EXIF Data", value: "Missing", tone: "error" },
      { label: "Endianness", value: "Unknown", tone: "neutral" },
      { label: "GPS", value: "Not embedded", tone: "warning" },
    ],
    groups: [],
    bigEndian: undefined,
  },
  synthesis: {
    status: "info",
    origin: "Unknown",
    details: "Unable to determine original source or creation method",
  },
  circulation: {
    webMatches: DEFAULT_WEB_MATCHES.map((match) => ({ ...match })),
    partialMatchingImages: DEFAULT_IMAGE_REFERENCES.slice(),
    visuallySimilarImages: DEFAULT_IMAGE_REFERENCES.slice(),
  },
};
