"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AnalysisCardFrame from "@/shared/components/analysis/shared/AnalysisCardFrame";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/base/card/card";
import { Button } from "@/shared/components/base/buttons/button";
import { BadgeWithIcon } from "@/shared/components/base/badges/badges";
import { imageFactCheckSearch, CORS_PROXY_ORIGIN, type FactCheckClaim } from "@/features/media-verification/api/fact-check";
import { isApiEnabled } from "@/shared/config/api-toggles";
import { AlertOctagon, AlertTriangle, Link01 } from "@untitledui/icons";

interface FactCheckCardProps {
  /** Publicly accessible URL for the image to be checked. */
  initialImageUrl?: string;
}

type ReviewPreviewMap = Record<string, string | undefined>;

const formatDate = (value?: string) => {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const normalizePreviewUrl = (rawUrl: string | null | undefined, baseUrl: string): string | undefined => {
  if (!rawUrl) {
    return undefined;
  }

  try {
    return new URL(rawUrl, baseUrl).toString();
  } catch {
    return undefined;
  }
};

const extractPreviewFromHtml = (html: string, baseUrl: string): string | undefined => {
  if (typeof window === "undefined" || typeof window.DOMParser === "undefined") {
    return undefined;
  }

  try {
    const parser = new window.DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const selectors = [
      'meta[property="og:image"]',
      'meta[property="og:image:url"]',
      'meta[name="twitter:image"]',
      'meta[name="twitter:image:src"]',
    ];

    for (const selector of selectors) {
      const element = doc.querySelector(selector);
      const content = element?.getAttribute("content");
      const normalized = normalizePreviewUrl(content, baseUrl);
      if (normalized) {
        return normalized;
      }
    }
  } catch {
    return undefined;
  }

  return undefined;
};

const fetchPreviewImage = async (url: string): Promise<string | undefined> => {
  try {
    const response = await fetch(`${CORS_PROXY_ORIGIN}${url}`, { method: "GET" });
    if (!response.ok) {
      return undefined;
    }

    const html = await response.text();
    return extractPreviewFromHtml(html, url);
  } catch {
    return undefined;
  }
};

const getRatingBadge = (rating: string | undefined) => {
  if (!rating) {
    return undefined;
  }

  const normalized = rating.toLowerCase();
  const isError = ["false", "fake", "pants", "scam", "fraud", "fabricated"].some((token) =>
    normalized.includes(token),
  );

  return {
    rating,
    color: isError ? "error" : "warning",
    Icon: isError ? AlertOctagon : AlertTriangle,
  } as const;
};

export const FactCheckCard = ({ initialImageUrl }: FactCheckCardProps) => {
  const [imageUrl, setImageUrl] = useState(initialImageUrl ?? "");
  const [claims, setClaims] = useState<FactCheckClaim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previews, setPreviews] = useState<ReviewPreviewMap>({});
  const [hasSearched, setHasSearched] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Reset state on URL change and auto-run search using provided URL
  useEffect(() => {
    const nextUrl = initialImageUrl ?? "";
    setImageUrl(nextUrl);
    setClaims([]);
    setPreviews({});
    setError(null);
    setHasSearched(false);

    const run = async () => {
      if (!isApiEnabled("google_images")) {
        setError("Google Images fact check is disabled.");
        setHasSearched(true);
        return;
      }
      const trimmedUrl = nextUrl.trim();
      if (!trimmedUrl) {
        setError("Enter a publicly accessible image URL to run a fact check.");
        setHasSearched(true);
        return;
      }
      if (trimmedUrl.startsWith("blob:")) {
        setError("The fact check API requires an image URL that is publicly reachable on the internet.");
        setHasSearched(true);
        return;
      }

      // Abort any inflight request
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setLoading(true);
      setError(null);
      setHasSearched(true);

      try {
        const response = await imageFactCheckSearch(trimmedUrl, {
          signal: abortController.signal,
          languageCode: "en-US",
        });
        setClaims(response.claims);
        if (!response.claims.length) {
          setError("No fact check records were found for this image.");
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        const message =
          caught instanceof Error ? caught.message : "An unexpected error occurred while running the fact check.";
        setError(message);
        setClaims([]);
      } finally {
        setLoading(false);
        abortControllerRef.current = null;
      }
    };

    // Auto-run when a URL is provided
    if (nextUrl) {
      void run();
    }
  }, [initialImageUrl]);

  const reviewItems = useMemo(() => {
    return claims.flatMap((claim) =>
      claim.reviews.map((review) => ({
        claim,
        review,
      })),
    );
  }, [claims]);

  useEffect(() => {
    if (!reviewItems.length) {
      setPreviews({});
      return;
    }

    let isCancelled = false;

    const loadPreviews = async () => {
      const unresolved = reviewItems
        .filter(({ review }) => !previews[review.url])
        .slice(0, 6); // avoid excessive parallel requests

      if (!unresolved.length) {
        return;
      }

      const entries: Array<[string, string | undefined]> = [];
      for (const { review } of unresolved) {
        if (isCancelled) {
          return;
        }

        const preview = await fetchPreviewImage(review.url);
        entries.push([review.url, preview]);
      }

      if (isCancelled) {
        return;
      }

      setPreviews((prev) => {
        const next = { ...prev };
        for (const [url, preview] of entries) {
          if (typeof next[url] === "undefined") {
            next[url] = preview;
          }
        }
        return next;
      });
    };

    void loadPreviews();

    return () => {
      isCancelled = true;
    };
  }, [reviewItems, previews]);

  const handleSearch = useCallback(async () => {
    if (!isApiEnabled("google_images")) {
      setError("Google Images fact check is disabled.");
      setClaims([]);
      setHasSearched(true);
      return;
    }
    const trimmedUrl = imageUrl.trim();

    if (!trimmedUrl) {
      setError("Enter a publicly accessible image URL to run a fact check.");
      setClaims([]);
      setHasSearched(true);
      return;
    }

    if (trimmedUrl.startsWith("blob:")) {
      setError("The fact check API requires an image URL that is publicly reachable on the internet.");
      setClaims([]);
      setHasSearched(true);
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setLoading(true);
    setError(null);
    setHasSearched(true);

    try {
      const response = await imageFactCheckSearch(trimmedUrl, {
        signal: abortController.signal,
        languageCode: "en-US",
      });
      setClaims(response.claims);
      if (!response.claims.length) {
        setError("No fact check records were found for this image.");
      }
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") {
        return;
      }

      const message =
        caught instanceof Error ? caught.message : "An unexpected error occurred while running the fact check.";
      setError(message);
      setClaims([]);
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  }, [imageUrl]);

  return (
    <AnalysisCardFrame>
      <CardHeader className='flex items-center gap-3'>
        <div className='flex flex-col gap-0.5 flex-1 min-w-0 text-left'>

          <CardTitle className="text-sm">Fact Check</CardTitle>
          <CardDescription className="text-xs">
            Run a reverse image lookup to find related fact-checking articles.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading && (
          <p className="text-xs text-tertiary">Searching for fact checks…</p>
        )}

        {!loading && error && (
          <p className="text-xs text-error-primary">{error}</p>
        )}

        {!loading && !error && hasSearched && claims.length === 0 && (
          <p className="text-xs text-tertiary">No fact check results yet. Try another image URL.</p>
        )}

        {!loading && claims.length > 0 && (
          <div className="space-y-4">
            {reviewItems.map(({ claim, review }) => {
              const reviewDate = formatDate(review.reviewDate);
              const previewImage = previews[review.url];
              const ratingBadge = getRatingBadge(review.textualRating);

              return (
                <div key={`${claim.text ?? "claim"}:${review.url}`} className="rounded-lg border border-secondary px-4 py-3">
                  <div className="flex flex-col gap-3 md:flex-row md:gap-4">
                    {previewImage && (
                      <div className="md:w-40 md:flex-shrink-0">
                        <a
                          href={review.url}
                          target="_blank"
                          rel="noreferrer"
                          className="group block overflow-hidden rounded-md"
                        >
                          <img
                            src={previewImage}
                            alt={review.title ? `Preview for ${review.title}` : "Fact check article preview image"}
                            className="h-24 w-full rounded-md object-cover transition-transform duration-200 ease-out group-hover:scale-105"
                          />
                        </a>
                      </div>
                    )}

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        {review.title && <p className="text-sm font-semibold text-secondary">{review.title}</p>}
                        {ratingBadge && (
                          <div className="flex md:w-full md:justify-center">
                            <BadgeWithIcon
                              size="sm"
                              type="modern"
                              color={ratingBadge.color}
                              iconLeading={ratingBadge.Icon}
                            >
                              <span className="text-xs capitalize">{ratingBadge.rating}</span>
                            </BadgeWithIcon>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-tertiary">
                        <span>{review.publisherName ?? review.publisherSite ?? "Unknown publisher"}</span>
                        {reviewDate && <span> • {reviewDate}</span>}
                      </div>

                      {claim.text && (
                        <p className="text-xs text-secondary">{claim.text}</p>
                      )}

                      <a
                        href={review.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-brand-secondary"
                      >
                        <Link01 className="size-3.5" />
                        Read fact check
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </AnalysisCardFrame >
  );
};

export default FactCheckCard;
