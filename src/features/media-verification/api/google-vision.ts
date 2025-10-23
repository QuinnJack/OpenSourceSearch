"use client";

import type { CirculationImageReference, CirculationWebMatch, WebMatchType } from "@/shared/types/analysis";

import { getHostnameFromUrl } from "@/utils/url";
import { isApiEnabled } from "@/shared/config/api-toggles";

const VISION_ANNOTATE_ENDPOINT = "https://vision.googleapis.com/v1/images:annotate";

export interface VisionWebEntity {
  entityId?: string;
  score?: number;
  description?: string;
}

interface VisionWebImageReference {
  url?: string;
}

interface VisionWebDetectionPage {
  url?: string;
  pageTitle?: string;
  score?: number;
  fullMatchingImages?: VisionWebImageReference[];
  partialMatchingImages?: VisionWebImageReference[];
}

interface VisionWebDetectionPayload {
  webEntities?: VisionWebEntity[];
  pagesWithMatchingImages?: VisionWebDetectionPage[];
  webPagesWithMatchingImages?: VisionWebDetectionPage[];
  bestGuessLabels?: Array<{ label?: string; languageCode?: string }>;
  partialMatchingImages?: VisionWebImageReference[];
  visuallySimilarImages?: VisionWebImageReference[];
}

interface VisionAnnotateResponse {
  responses?: Array<{
    webDetection?: VisionWebDetectionPayload;
    error?: { code?: number; message?: string };
  }>;
}

export interface GoogleVisionWebDetectionResult {
  matches: CirculationWebMatch[];
  entities: VisionWebEntity[];
  bestGuesses: string[];
  partialMatchingImages: CirculationImageReference[];
  visuallySimilarImages: CirculationImageReference[];
}

export class GoogleVisionApiError extends Error {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = "GoogleVisionApiError";
  }
}

export interface GoogleVisionWebDetectionParams {
  base64Content?: string;
  imageUri?: string;
  maxResults?: number;
  signal?: AbortSignal;
}

const determineMatchType = (page: VisionWebDetectionPage): WebMatchType => {
  const fullCount = Array.isArray(page.fullMatchingImages) ? page.fullMatchingImages.length : 0;
  const partialCount = Array.isArray(page.partialMatchingImages) ? page.partialMatchingImages.length : 0;

  if (fullCount > 0) {
    return "full";
  }
  if (partialCount > 0) {
    return "partial";
  }
  return "similar";
};

const mapPagesToMatches = (
  pages: VisionWebDetectionPage[] | undefined,
  entityIds: string[] | undefined,
): CirculationWebMatch[] => {
  if (!Array.isArray(pages) || pages.length === 0) {
    return [];
  }

  const detectionDate = new Date().toISOString().slice(0, 10);
  const seen = new Map<string, CirculationWebMatch>();

  for (const page of pages) {
    if (typeof page?.url !== "string") {
      continue;
    }

    const url = page.url;
    const organization = getHostnameFromUrl(url);
    const matchType = determineMatchType(page);

    seen.set(url, {
      pageTitle: page.pageTitle ?? organization,
      url,
      organization,
      matchType,
      snippet: undefined,
      dateDetected: detectionDate,
      lastSeen: detectionDate,
      entityIds,
    });
  }

  return Array.from(seen.values());
};

const normalizeStringArray = (values?: Array<{ label?: string }>): string[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  return values
    .map((entry) => (typeof entry?.label === "string" ? entry.label : undefined))
    .filter((label): label is string => typeof label === "string" && label.trim().length > 0);
};

const normalizeImageReferences = (references?: VisionWebImageReference[]): CirculationImageReference[] => {
  if (!Array.isArray(references)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: CirculationImageReference[] = [];

  for (const reference of references) {
    if (typeof reference?.url !== "string" || reference.url.trim().length === 0) {
      continue;
    }

    const url = reference.url.trim();
    if (seen.has(url)) {
      continue;
    }

    seen.add(url);
    normalized.push({ url });
  }

  return normalized;
};

const getEntityIds = (entities: VisionWebEntity[] | undefined): string[] | undefined => {
  if (!Array.isArray(entities)) {
    return undefined;
  }

  const ids = entities
    .map((entity) => (typeof entity.entityId === "string" ? entity.entityId : undefined))
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0);

  return ids.length > 0 ? ids : undefined;
};

export const fetchVisionWebDetection = async (
  params: GoogleVisionWebDetectionParams,
): Promise<GoogleVisionWebDetectionResult> => {
  if (!isApiEnabled("google_vision")) {
    throw new GoogleVisionApiError("Google Vision web detection is disabled via settings.");
  }

  const apiKey = import.meta.env?.VITE_GOOGLE_VISION_API_KEY as string | undefined;
  if (!apiKey) {
    throw new GoogleVisionApiError("Google Vision API key is not configured.");
  }

  const { base64Content, imageUri, maxResults, signal } = params;

  if (!base64Content && !imageUri) {
    throw new GoogleVisionApiError("Either base64 content or an image URL must be provided for web detection.");
  }

  if (imageUri && imageUri.startsWith("blob:")) {
    throw new GoogleVisionApiError("Blob URLs cannot be used for Google Vision web detection requests.");
  }

  const requestBody = {
    requests: [
      {
        image: base64Content
          ? { content: base64Content }
          : {
              source: {
                imageUri,
              },
            },
        features: [
          {
            type: "WEB_DETECTION",
            maxResults,
          },
        ],
      },
    ],
  };

  const endpoint = `${VISION_ANNOTATE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(requestBody),
    signal,
  });

  if (!response.ok) {
    throw new GoogleVisionApiError(`Google Vision request failed with status ${response.status}`, response.status);
  }

  const payload = (await response.json()) as VisionAnnotateResponse;
  const firstResponse = Array.isArray(payload?.responses) ? payload.responses[0] : undefined;

  if (!firstResponse) {
    throw new GoogleVisionApiError("Google Vision returned an empty response.");
  }

  if (firstResponse.error) {
    const message = firstResponse.error.message ?? "Google Vision reported an error.";
    throw new GoogleVisionApiError(message, firstResponse.error.code);
  }

  const webDetection = firstResponse.webDetection;
  const entities = Array.isArray(webDetection?.webEntities) ? webDetection?.webEntities : [];
  const bestGuesses = normalizeStringArray(webDetection?.bestGuessLabels);
  const entityIds = getEntityIds(entities);
  const pageMatches = webDetection?.pagesWithMatchingImages ?? webDetection?.webPagesWithMatchingImages;
  const matches = mapPagesToMatches(pageMatches, entityIds);
  const partialMatchingImages = normalizeImageReferences(webDetection?.partialMatchingImages);
  const visuallySimilarImages = normalizeImageReferences(webDetection?.visuallySimilarImages);

  return {
    matches,
    entities,
    bestGuesses,
    partialMatchingImages,
    visuallySimilarImages,
  };
};
