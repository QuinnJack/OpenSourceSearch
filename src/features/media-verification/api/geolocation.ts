import { GoogleGenAI, type GenerateContentResponse, type Part } from "@google/genai";
import { getApiKey } from "@/shared/config/api-keys";

const MODEL_NAME = "gemini-2.5-flash";
const LAYER_RECOMMENDER_MODEL =
  (typeof import.meta !== "undefined" &&
    typeof import.meta.env === "object" &&
    (import.meta.env as Record<string, string | undefined>).VITE_GEMINI_LAYER_MODEL) ||
  "gemini-2.5-flash";
const PROMPT_TEXT = [
  "Where was this photo taken? Bias to Canadian specific context.",
  "Be as specific as possible: landmark/building + neighborhood/street + city + province/territory + country, when available.",
  "Respond with exactly three lines:",
  "1) Line 1 – only the best-guess location (e.g., 'Rideau Canal, Ottawa, Ontario' or 'Jasper, British Columbia').",  
  "2) Line 2 – a concise explanation citing the evidence with inline citations.",
  "3) Line 3 – 'Confidence: <number>/10'. Treat this as the map zoom signal: 10 = very precise (building/block), 7 = strong city-level, 5 = regional, 0 = unknown. Be conservative if unsure.",
  "Do not include any additional text before or after these lines.",
].join(" ");
const GROUNDING_TOOL = { googleSearch: {} } as const;

let cachedClient: GoogleGenAI | null = null;
let cachedClientKey: string | null = null;

const getGeminiApiKey = (): string => {
  const apiKey = getApiKey("gemini");
  if (!apiKey) {
    throw new Error("Gemini API key is not configured.");
  }

  return apiKey;
};

const getGeminiClient = (): GoogleGenAI => {
  const apiKey = getGeminiApiKey();
  if (!cachedClient || cachedClientKey !== apiKey) {
    cachedClient = new GoogleGenAI({ apiKey });
    cachedClientKey = apiKey;
  }

  return cachedClient;
};

export interface GeolocationSource {
  index: number;
  uri: string;
  title?: string;
}

export interface GeolocationAnalysis {
  answer: string;
  answerWithCitations: string;
  sources: GeolocationSource[];
  webSearchQueries: string[];
  searchEntryPointHtml?: string;
  locationLine?: string;
  explanation?: string;
  confidenceScore?: number;
}

export interface GeolocationRequestInput {
  base64Content?: string;
  mimeType?: string | null;
  imageUri?: string;
}

export interface LocationLayerDefinition {
  id: string;
  label: string;
  description: string;
  viewTypes?: string[];
  kind?: string;
}

export interface LocationLayerRecommendation {
  /** Unique identifier for deduping recommendations in the UI. */
  id: string;
  /** Layer IDs that should be enabled for this image. */
  recommendedLayerIds: string[];
  /** Short reason returned by Gemini. */
  reason?: string;
  /** Raw model text for debugging. */
  rawText?: string;
  /** Model name used to generate this recommendation. */
  model?: string;
}

export interface LocationLayerRecommendationInput extends GeolocationRequestInput {
  layers: LocationLayerDefinition[];
}

const buildPromptParts = ({ base64Content, mimeType, imageUri }: GeolocationRequestInput): Part[] => {
  if (!base64Content && !imageUri) {
    throw new Error("Missing image data for geolocation request.");
  }

  const parts: Part[] = [{ text: PROMPT_TEXT }];

  if (base64Content) {
    parts.push({
      inlineData: {
        data: base64Content,
        mimeType: mimeType ?? "image/jpeg",
      },
    });
  } else if (imageUri) {
    parts.push({
      text: `Image URL: ${imageUri}`,
    });
  }

  return parts;
};

const buildLayerRecommendationParts = ({
  base64Content,
  mimeType,
  imageUri,
  layers,
}: LocationLayerRecommendationInput): Part[] => {
  if (!base64Content && !imageUri) {
    throw new Error("Missing image data for layer recommendation.");
  }

  const manifest = layers.map((layer) => ({
    id: layer.id,
    label: layer.label,
    description: layer.description,
    viewTypes: layer.viewTypes,
    kind: layer.kind,
  }));

  const instructions = [
    "You are assisting a map UI to pre-enable only the most relevant contextual layers for this photo.",
    "You receive the image plus a manifest of available layers.",
    "Choose zero or more layer IDs to enable.",
    "Return ONLY a compact JSON object with two fields:",
    `{"recommendedLayerIds":["layer-id-1","layer-id-2"],"reason":"short justification"}`,
    "Rules:",
    "- recommendedLayerIds must only contain IDs present in the manifest.",
    "- Prefer 1-4 layers; use [] if none clearly apply.",
    "- reason must be under 240 characters and explain why.",
    "- Do not include any extra keys or text outside the JSON.",
  ].join(" ");

  const parts: Part[] = [
    {
      text: `${instructions}\nAvailable layers manifest:\n${JSON.stringify(manifest, null, 2)}`,
    },
  ];

  if (base64Content) {
    parts.push({
      inlineData: {
        data: base64Content,
        mimeType: mimeType ?? "image/jpeg",
      },
    });
  } else if (imageUri) {
    parts.push({
      text: `Image URL: ${imageUri}`,
    });
  }

  return parts;
};

const parseRecommendedLayers = (
  text: string,
  validLayerIds: string[],
): { recommendedLayerIds: string[]; reason?: string } => {
  const trimToJson = (raw: string): string | null => {
    const codeFenceMatch = /```(?:json)?\s*({[\s\S]*?})\s*```/i.exec(raw);
    if (codeFenceMatch?.[1]) {
      return codeFenceMatch[1];
    }
    const braceStart = raw.indexOf("{");
    const braceEnd = raw.lastIndexOf("}");
    if (braceStart !== -1 && braceEnd !== -1 && braceEnd > braceStart) {
      return raw.slice(braceStart, braceEnd + 1);
    }
    return null;
  };

  const jsonCandidate = trimToJson(text) ?? text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch {
    throw new Error("Gemini returned an unreadable layer response.");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Layer response was not a JSON object.");
  }

  const recommendation = parsed as { recommendedLayerIds?: unknown; layers?: unknown; reason?: unknown };
  const rawIds =
    recommendation.recommendedLayerIds ??
    recommendation.layers ??
    (Array.isArray(recommendation) ? recommendation : undefined);
  const ids: string[] = Array.isArray(rawIds)
    ? rawIds
        .map((id) => (typeof id === "string" ? id : null))
        .filter((id): id is string => Boolean(id && validLayerIds.includes(id)))
    : [];

  const uniqueIds = Array.from(new Set(ids));
  const reason = typeof recommendation.reason === "string" ? recommendation.reason.trim() : undefined;
  return { recommendedLayerIds: uniqueIds, reason };
};

const addCitations = (text: string, response: GenerateContentResponse): string => {
  const supports = response.candidates?.[0]?.groundingMetadata?.groundingSupports ?? [];
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

  if (!supports.length || !chunks.length) {
    return text;
  }

  const sorted = [...supports].sort((a, b) => {
    const aEnd = a.segment?.endIndex ?? 0;
    const bEnd = b.segment?.endIndex ?? 0;
    return bEnd - aEnd;
  });

  let withCitations = text;

  for (const support of sorted) {
    const endIndex = support.segment?.endIndex;
    if (typeof endIndex !== "number" || !support.groundingChunkIndices?.length) {
      continue;
    }

    const links = support.groundingChunkIndices
      .map((chunkIndex) => {
        const uri = chunks[chunkIndex]?.web?.uri;
        return uri ? `[${chunkIndex + 1}](${uri})` : null;
      })
      .filter((value): value is string => Boolean(value));

    if (!links.length) {
      continue;
    }

    const citation = links.join(", ");
    withCitations = `${withCitations.slice(0, endIndex)}${citation}${withCitations.slice(endIndex)}`;
  }

  return withCitations;
};

const extractSources = (response: GenerateContentResponse): GeolocationSource[] => {
  const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];
  return chunks
    .map<GeolocationSource | null>((chunk, index) => {
      const uri = chunk.web?.uri;
      if (!uri) {
        return null;
      }
      return {
        index: index + 1,
        uri,
        title: chunk.web?.title,
      } as GeolocationSource;
    })
    .filter((chunk): chunk is GeolocationSource => chunk !== null);
};

const parseAnswerSections = (text: string): { locationLine?: string; explanation?: string; confidenceScore?: number } => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  let confidenceScore: number | undefined;
  const filteredLines = lines.filter((line) => {
    const match = /confidence[^0-9]*(\d+(?:\.\d+)?)/i.exec(line);
    if (match) {
      const parsed = Number.parseFloat(match[1]);
      if (!Number.isNaN(parsed)) {
        confidenceScore = Math.max(0, Math.min(10, parsed));
      }
      return false;
    }
    return true;
  });

  const locationLine = filteredLines[0];
  const explanation = filteredLines.slice(1).join("\n");

  return {
    locationLine,
    explanation,
    confidenceScore,
  };
};

export const fetchGeolocationAnalysis = async ({ base64Content, mimeType, imageUri }: GeolocationRequestInput): Promise<GeolocationAnalysis> => {
  const client = getGeminiClient();
  const parts = buildPromptParts({ base64Content, mimeType, imageUri });

  const response = await client.models.generateContent({
    model: MODEL_NAME,
    contents: parts,
    config: {
      tools: [GROUNDING_TOOL],
    },
  });

  const answer = response.text?.trim();
  if (!answer) {
    throw new Error("Gemini did not return a geolocation answer.");
  }

  const answerWithCitations = addCitations(answer, response);
  const parsedSections = parseAnswerSections(answerWithCitations);
  const sources = extractSources(response);
  const webSearchQueries = response.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? [];
  const searchEntryPointHtml = response.candidates?.[0]?.groundingMetadata?.searchEntryPoint?.renderedContent;

  return {
    answer,
    answerWithCitations,
    sources,
    webSearchQueries,
    searchEntryPointHtml,
    locationLine: parsedSections.locationLine,
    explanation: parsedSections.explanation,
    confidenceScore: parsedSections.confidenceScore,
  };
};

export const fetchLocationLayerRecommendation = async ({
  base64Content,
  mimeType,
  imageUri,
  layers,
}: LocationLayerRecommendationInput): Promise<LocationLayerRecommendation> => {
  const client = getGeminiClient();
  const parts = buildLayerRecommendationParts({ base64Content, mimeType, imageUri, layers });

  const response = await client.models.generateContent({
    model: LAYER_RECOMMENDER_MODEL,
    contents: parts,
  });

  const answer = response.text?.trim();
  if (!answer) {
    throw new Error("Gemini did not return layer guidance.");
  }

  const { recommendedLayerIds, reason } = parseRecommendedLayers(
    answer,
    layers.map((layer) => layer.id),
  );

  const recommendationId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as Crypto).randomUUID()
      : `layer-rec-${Date.now()}`;

  return {
    id: recommendationId,
    recommendedLayerIds,
    reason,
    rawText: answer,
    model: LAYER_RECOMMENDER_MODEL,
  };
};
