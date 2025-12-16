"use client";

import { isApiEnabled } from "@/shared/config/api-toggles";
import { CORS_PROXY_ORIGIN } from "@/shared/constants/network";
import { getApiKey } from "@/shared/config/api-keys";

const FACT_CHECK_BASE_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:imageSearch";

const FACT_CHECK_USE_CORS_ENV = import.meta.env?.VITE_FACT_CHECK_USE_CORS as string | undefined;
const SHOULD_USE_CORS_PROXY =
  FACT_CHECK_USE_CORS_ENV !== undefined ? FACT_CHECK_USE_CORS_ENV === "true" : !import.meta.env.PROD;

export interface FactCheckClaimReview {
  publisherName?: string;
  publisherSite?: string;
  url: string;
  title?: string;
  reviewDate?: string;
  textualRating?: string;
  languageCode?: string;
}

export interface FactCheckClaim {
  text?: string;
  claimant?: string;
  claimDate?: string;
  reviews: FactCheckClaimReview[];
}

export interface FactCheckSearchResponse {
  nextPageToken?: string;
  claims: FactCheckClaim[];
}

export class FactCheckApiError extends Error {
  public readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = "FactCheckApiError";
  }
}

export const imageFactCheckSearch = async (
  imageUri: string,
  options?: { languageCode?: string; pageSize?: number; pageToken?: string; signal?: AbortSignal },
): Promise<FactCheckSearchResponse> => {
  if (!isApiEnabled("google_images")) {
    throw new FactCheckApiError("Google Images fact check is disabled.");
  }
  const apiKey = getApiKey("google_fact_check");

  if (!apiKey) {
    throw new FactCheckApiError("Unable to run Google fact checks because an API key is not configured.");
  }

  if (!imageUri) {
    throw new FactCheckApiError("Image URL is required.");
  }

  const trimmedUri = imageUri.trim();
  if (!trimmedUri) {
    throw new FactCheckApiError("Image URL is required.");
  }

  const endpointUrl = new URL(FACT_CHECK_BASE_URL);
  endpointUrl.searchParams.set("key", apiKey);
  endpointUrl.searchParams.set("imageUri", trimmedUri);

  if (options?.languageCode) {
    endpointUrl.searchParams.set("languageCode", options.languageCode);
  }
  if (typeof options?.pageSize === "number") {
    endpointUrl.searchParams.set("pageSize", String(options.pageSize));
  }
  if (options?.pageToken) {
    endpointUrl.searchParams.set("pageToken", options.pageToken);
  }

  const requestUrl = SHOULD_USE_CORS_PROXY
    ? `${CORS_PROXY_ORIGIN}${endpointUrl.toString()}`
    : endpointUrl.toString();

  const response = await fetch(requestUrl, {
    method: "GET",
    signal: options?.signal,
  });

  if (!response.ok) {
    const message = `Fact Check request failed with status ${response.status}`;
    throw new FactCheckApiError(message, response.status);
  }

  const payload = await response.json();
  const nextPageToken = payload?.nextPageToken ?? undefined;
  const results = Array.isArray(payload?.results) ? (payload.results as unknown[]) : [];

  const claims = results.reduce<FactCheckClaim[]>((acc, result) => {
    if (!result || typeof result !== "object") {
      return acc;
    }

    const claimCandidate = (result as { claim?: unknown }).claim;
    if (!claimCandidate || typeof claimCandidate !== "object") {
      return acc;
    }

    const claimData = claimCandidate as {
      text?: unknown;
      claimant?: unknown;
      claimDate?: unknown;
      claimReview?: unknown;
    };

    const claimReviewsRaw = Array.isArray(claimData.claimReview) ? claimData.claimReview : [];
    const reviews = claimReviewsRaw.reduce<FactCheckClaimReview[]>((reviewAcc, rawReview) => {
      if (!rawReview || typeof rawReview !== "object") {
        return reviewAcc;
      }

      const review = rawReview as {
        publisher?: { name?: unknown; site?: unknown };
        url?: unknown;
        title?: unknown;
        reviewDate?: unknown;
        textualRating?: unknown;
        languageCode?: unknown;
      };

      const url = typeof review.url === "string" ? review.url : undefined;
      if (!url) {
        return reviewAcc;
      }

      const normalizedReview: FactCheckClaimReview = {
        publisherName: typeof review.publisher?.name === "string" ? review.publisher.name : undefined,
        publisherSite: typeof review.publisher?.site === "string" ? review.publisher.site : undefined,
        url,
        title: typeof review.title === "string" ? review.title : undefined,
        reviewDate: typeof review.reviewDate === "string" ? review.reviewDate : undefined,
        textualRating: typeof review.textualRating === "string" ? review.textualRating : undefined,
        languageCode: typeof review.languageCode === "string" ? review.languageCode : undefined,
      };

      reviewAcc.push(normalizedReview);
      return reviewAcc;
    }, []);

    if (!reviews.length) {
      return acc;
    }

    const normalizedClaim: FactCheckClaim = {
      text: typeof claimData.text === "string" ? claimData.text : undefined,
      claimant: typeof claimData.claimant === "string" ? claimData.claimant : undefined,
      claimDate: typeof claimData.claimDate === "string" ? claimData.claimDate : undefined,
      reviews,
    };

    acc.push(normalizedClaim);
    return acc;
  }, []);

  return { nextPageToken, claims };
};
