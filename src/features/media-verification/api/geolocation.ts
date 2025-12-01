import { GoogleGenAI, type GenerateContentResponse, type Part } from "@google/genai";

const MODEL_NAME = "gemini-2.5-flash";
const PROMPT_TEXT = [
  "Where was this photo taken? Bias to Canadian specific context.",
  "Respond with exactly three lines:",
  "1) Line 1 – only the best-guess location name (e.g., 'Ottawa, Ontario').",
  "2) Line 2 – a concise explanation citing the evidence with inline citations.",
  "3) Line 3 – 'Confidence: <number>/10' using a number between 0 and 10 for location certainty.",
  "Do not include any additional text before or after these lines.",
].join(" ");
const GROUNDING_TOOL = { googleSearch: {} } as const;

let cachedClient: GoogleGenAI | null = null;

const getGeminiApiKey = (): string => {
  if (typeof import.meta === "undefined" || typeof import.meta.env !== "object") {
    throw new Error("Gemini configuration is unavailable in this environment.");
  }

  const env = import.meta.env as Record<string, string | undefined>;
  const apiKey = env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("VITE_GEMINI_API_KEY is not configured.");
  }

  return apiKey;
};

const getGeminiClient = (): GoogleGenAI => {
  if (!cachedClient) {
    cachedClient = new GoogleGenAI({ apiKey: getGeminiApiKey() });
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
    .map((chunk, index) => {
      const uri = chunk.web?.uri;
      if (!uri) {
        return null;
      }
      return {
        index: index + 1,
        uri,
        title: chunk.web?.title,
      };
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
