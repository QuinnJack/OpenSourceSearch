"use client";

import * as Paginations from "@/components/ui/pagination/pagination";

import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { useMemo, useState } from "react";

import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import type { CirculationImageReference } from "@/shared/types/analysis";
import { Link01 } from "@untitledui/icons";

interface VisuallySimilarImagesCardProps {
  partialMatches: CirculationImageReference[];
  visuallySimilarImages: CirculationImageReference[];
  loading?: boolean;
  fallbackImageUrl?: string;
}

type CardImage = CirculationImageReference & {
  category: "partial" | "similar";
};

const ALLOWED_IMAGE_EXTENSIONS = [
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ".gif",
  ".bmp",
  ".tiff",
  ".tif",
  ".svg",
  ".heic",
];

const getColumnCountForWidth = (width: number | undefined): number => {
  if (typeof width !== "number" || Number.isNaN(width)) {
    return 4;
  }

  if (width >= 768) {
    return 4;
  }

  if (width >= 640) {
    return 3;
  }

  return 2;
};

const isDirectImageUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    const lastSegment = parsed.pathname.split("/").pop() ?? "";
    const normalizedSegment = lastSegment.toLowerCase();
    return ALLOWED_IMAGE_EXTENSIONS.some((extension) => normalizedSegment.endsWith(extension));
  } catch {
    return false;
  }
};

const filterImageReferences = (references: CirculationImageReference[], category: CardImage["category"]): CardImage[] => {
  if (!Array.isArray(references)) {
    return [];
  }

  const seen = new Set<string>();
  const filtered: CardImage[] = [];

  for (const reference of references) {
    if (!reference || typeof reference.url !== "string") {
      continue;
    }

    const trimmedUrl = reference.url.trim();
    if (trimmedUrl.length === 0 || !isDirectImageUrl(trimmedUrl)) {
      continue;
    }

    if (seen.has(trimmedUrl)) {
      continue;
    }

    seen.add(trimmedUrl);
    filtered.push({ url: trimmedUrl, category });
  }

  return filtered;
};

const ImageThumbnail = ({
  image,
  index,
  isBlurred = false,
  fallbackUrl,
}: {
  image: CardImage;
  index: number;
  isBlurred?: boolean;
  fallbackUrl?: string;
}) => {
  const [hasError, setHasError] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const ariaLabel = `Match ${index + 1}`;

  const isUsingFallback = hasError && typeof fallbackUrl === "string" && fallbackUrl.length > 0 && !fallbackFailed;
  const imageSrc = !hasError ? image.url : fallbackUrl;
  const shouldBlur = isBlurred || isUsingFallback;

  const handleImageError = () => {
    if (!hasError) {
      setHasError(true);
      return;
    }

    setFallbackFailed(true);
  };

  return (
    <a
      key={image.url}
      href={image.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Open ${ariaLabel} in a new tab`}
      className="group relative block overflow-hidden rounded-lg border border-secondary/40 shadow-sm transition hover:border-brand-500/40 hover:shadow-md"
    >
      {imageSrc && !fallbackFailed ? (
        <img
          src={imageSrc}
          alt={ariaLabel}
          loading="lazy"
          onError={handleImageError}
          className={`h-24 w-full object-cover transition duration-200 ease-out group-hover:scale-105 ${shouldBlur ? "blur-sm brightness-90" : ""}`}
        />
      ) : (
        <div className="flex h-24 w-full items-center justify-center bg-secondary/20 text-xs font-medium text-tertiary">
          Image unavailable
        </div>
      )}
      <div className="pointer-events-none absolute inset-0 bg-primary/0 transition group-hover:bg-primary/10" />
      <span className="pointer-events-none absolute bottom-2 left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full bg-primary/90 px-2 py-0.5 text-[11px] font-medium text-brand-500 shadow ring-1 ring-brand-400/40 transition group-hover:flex">
        <Link01 className="size-3" />
        Open
      </span>
    </a>
  );
};

export const VisuallySimilarImagesCard = ({
  partialMatches,
  visuallySimilarImages,
  loading = false,
  fallbackImageUrl,
}: VisuallySimilarImagesCardProps) => {
  const filteredPartial = useMemo(() => filterImageReferences(partialMatches, "partial"), [partialMatches]);
  const filteredSimilar = useMemo(() => filterImageReferences(visuallySimilarImages, "similar"), [visuallySimilarImages]);

  const galleryItems = useMemo(() => {
    const merged: CardImage[] = [];
    const seen = new Set<string>();

    for (const item of filteredPartial) {
      if (seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      merged.push(item);
    }

    for (const item of filteredSimilar) {
      if (seen.has(item.url)) {
        continue;
      }
      seen.add(item.url);
      merged.push(item);
    }

    return merged;
  }, [filteredPartial, filteredSimilar]);

  const columns = Math.max(1, getColumnCountForWidth(typeof window !== "undefined" ? window.innerWidth : undefined));
  const rowsPerPage = 2;
  const pageSize = columns * rowsPerPage;
  const totalItems = galleryItems.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / (pageSize || 1)));
  const [page, setPage] = useState<number>(1);

  const effectivePage = Math.min(page, totalPages);

  const currentItems = useMemo(() => {
    if (pageSize === 0) {
      return [];
    }

    const start = (effectivePage - 1) * pageSize;
    return galleryItems.slice(start, start + pageSize);
  }, [galleryItems, effectivePage, pageSize]);

  const handlePageChange = (nextPage: number) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    setPage(clamped);
  };

  const isLoading = loading;
  const hasImages = totalItems > 0;

  const itemsForLoadingState = currentItems.length > 0
    ? currentItems
    : galleryItems.length > 0
      ? galleryItems.slice(0, pageSize || galleryItems.length)
      : fallbackImageUrl
        ? [{ url: fallbackImageUrl, category: "similar" as const }]
        : [];

  return (
    <AnalysisCardFrame>
      <CardHeader className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left -mb-5">
          <CardTitle className="text-sm">Visually Similar Images</CardTitle>
          <CardDescription className="text-xs text-tertiary">
            Explore partial and visually similar matches.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {itemsForLoadingState.map((image, index) => (
              <ImageThumbnail
                image={image}
                index={(effectivePage - 1) * pageSize + index}
                key={`${image.url}-loading`}
                isBlurred
                fallbackUrl={fallbackImageUrl}
              />
            ))}
            {itemsForLoadingState.length === 0 && fallbackImageUrl && (
              <ImageThumbnail
                image={{ url: fallbackImageUrl, category: "similar" }}
                index={(effectivePage - 1) * pageSize}
                isBlurred
                fallbackUrl={fallbackImageUrl}
              />
            )}
          </div>
        ) : !hasImages ? (
          <div className="rounded-lg border border-secondary/40 bg-primary px-3 py-3 text-xs text-tertiary">
            No direct image matches detected.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {currentItems.map((image, index) => (
                <ImageThumbnail
                  image={image}
                  index={(effectivePage - 1) * pageSize + index}
                  key={image.url}
                  fallbackUrl={fallbackImageUrl}
                />
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-4">
                <Paginations.PaginationButtonGroup
                  page={effectivePage}
                  total={totalPages}
                  onPageChange={handlePageChange}
                  align="center"
                />
              </div>
            )}
          </>
        )}
      </CardContent>
    </AnalysisCardFrame>
  );
};

export default VisuallySimilarImagesCard;
