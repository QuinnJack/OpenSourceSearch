"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { BadgeWithIcon } from "@/components/ui/badges/badges";
import { CORS_PROXY_ORIGIN, type FactCheckClaim } from "@/features/media-verification/api/fact-check";
import { AlertOctagon, AlertTriangle, Link01 } from "@untitledui/icons";

interface FactCheckCardProps {
  claims: FactCheckClaim[];
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
  isEnabled: boolean;
}

type ReviewPreviewMap = Record<string, string | undefined>;
const INFO_STATUS_MESSAGES = new Set([
  "No fact check records were found for this image.",
  "Enter a publicly accessible image URL to run a fact check.",
  "The fact check API requires an image URL that is publicly reachable on the internet.",
]);

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

export const FactCheckCard = ({ claims, loading, error, hasSearched, isEnabled }: FactCheckCardProps) => {
  const [previews, setPreviews] = useState<ReviewPreviewMap>({});
  const previousClaimsRef = useRef<FactCheckClaim[] | null>(null);

  useEffect(() => {
    if (previousClaimsRef.current !== claims) {
      previousClaimsRef.current = claims;
      setPreviews({});
    }
  }, [claims]);

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

  return (
    <AnalysisCardFrame>
      <CardHeader className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0 text-left -mb-5">

          <CardTitle className="text-sm">Fact Check</CardTitle>
          <CardDescription className="text-xs">
            Run a reverse image lookup to find related fact-checking articles.
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 pt-4">
        {(() => {
          if (!isEnabled) {
            return (
              <div className="rounded-lg border border-secondary/40 bg-primary px-3 py-3 text-xs text-tertiary">
                Google Images fact-check search is disabled. Enable it in Settings to find related articles.
              </div>
            );
          }

          if (loading) {
            return (
              <div className="rounded-lg border border-secondary/40 bg-primary px-3 py-3 text-xs text-tertiary">
                Searching for fact checks…
              </div>
            );
          }

          if (error) {
            const isInfoTone = INFO_STATUS_MESSAGES.has(error);
            return (
              <div
                className={`rounded-lg border px-3 py-3 text-sm ${
                  isInfoTone ? "border-secondary/40 bg-primary text-tertiary" : "border-error-primary/50 bg-error-primary/5 text-error-primary"
                }`}
              >
                {error}
              </div>
            );
          }

          if (!error && hasSearched && claims.length === 0) {
            return (
              <div className="rounded-lg border border-secondary/40 bg-primary px-3 py-3 text-xs text-tertiary">
                No fact check results yet. Try providing a different reference image.
              </div>
            );
          }

          return null;
        })()}

        {!loading && !error && isEnabled && claims.length > 0 && (
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
