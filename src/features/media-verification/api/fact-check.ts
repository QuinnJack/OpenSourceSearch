"use client";

import { isApiEnabled } from "@/shared/config/api-toggles";

const FACT_CHECK_BASE_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:imageSearch";
export const CORS_PROXY_ORIGIN = "https://cors-anywhere.com/";

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
  constructor(message: string, public readonly status?: number) {
    super(message);
  }
}

export const imageFactCheckSearch = async (
  imageUri: string,
  options?: { languageCode?: string; pageSize?: number; pageToken?: string; signal?: AbortSignal },
): Promise<FactCheckSearchResponse> => {
  if (!isApiEnabled("google_images")) {
    throw new FactCheckApiError("Google Images fact check is disabled.");
  }
  const apiKey = import.meta.env?.VITE_GOOGLE_FACT_CHECK_API_KEY as string | undefined;

  if (!apiKey) {
    throw new FactCheckApiError("Google Fact Check API key is not configured.");
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

  const proxiedUrl = `${CORS_PROXY_ORIGIN}${endpointUrl.toString()}`;

  const response = await fetch(proxiedUrl, {
    method: "GET",
    signal: options?.signal,
  });

  if (!response.ok) {
    const message = `Fact Check request failed with status ${response.status}`;
    throw new FactCheckApiError(message, response.status);
  }

  const payload = await response.json();
  const nextPageToken = payload?.nextPageToken ?? undefined;
  const results = Array.isArray(payload?.results) ? payload.results : [];

  const claims: FactCheckClaim[] = results
    .map((result: unknown) => {
      if (!result || typeof result !== "object") {
        return undefined;
      }

      const claim = (result as { claim?: unknown }).claim;
      if (!claim || typeof claim !== "object") {
        return undefined;
      }

      const claimData = claim as {
        text?: unknown;
        claimant?: unknown;
        claimDate?: unknown;
        claimReview?: unknown;
      };

      const claimReviewsRaw = Array.isArray(claimData.claimReview) ? claimData.claimReview : [];
      const reviews: FactCheckClaimReview[] = claimReviewsRaw
        .map((rawReview) => {
          if (!rawReview || typeof rawReview !== "object") {
            return undefined;
          }

          const review = rawReview as {
            publisher?: { name?: unknown; site?: unknown };
            url?: unknown;
            title?: unknown;
            reviewDate?: unknown;
            textualRating?: unknown;
            languageCode?: unknown;
          };

          const publisherName =
            typeof review.publisher?.name === "string" ? review.publisher.name : undefined;
          const publisherSite =
            typeof review.publisher?.site === "string" ? review.publisher.site : undefined;
          const url = typeof review.url === "string" ? review.url : undefined;

          if (!url) {
            return undefined;
          }

          return {
            publisherName,
            publisherSite,
            url,
            title: typeof review.title === "string" ? review.title : undefined,
            reviewDate: typeof review.reviewDate === "string" ? review.reviewDate : undefined,
            textualRating: typeof review.textualRating === "string" ? review.textualRating : undefined,
            languageCode: typeof review.languageCode === "string" ? review.languageCode : undefined,
          };
        })
        .filter((review): review is FactCheckClaimReview => Boolean(review));

      return {
        text: typeof claimData.text === "string" ? claimData.text : undefined,
        claimant: typeof claimData.claimant === "string" ? claimData.claimant : undefined,
        claimDate: typeof claimData.claimDate === "string" ? claimData.claimDate : undefined,
        reviews,
      };
    })
    .filter((claim): claim is FactCheckClaim => Boolean(claim && claim.reviews.length > 0));

  return { nextPageToken, claims };
};
