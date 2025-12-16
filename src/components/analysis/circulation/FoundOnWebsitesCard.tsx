"use client";

import * as Paginations from "@/components/ui/pagination/pagination";

import { ArrowDown, ArrowUp, Link01 } from "@untitledui/icons";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { useEffect, useMemo, useState } from "react";

import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import type { CirculationWebMatch } from "@/shared/types/analysis";
import { usePublicationDates } from "@/features/media-verification/hooks/usePublicationDates";

interface FoundOnWebsitesCardProps {
  matches: CirculationWebMatch[];
  loading?: boolean;
}

const PAGE_SIZE = 6;

const hasValidUrl = (value: string | undefined): value is string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  try {
    const parsed = new URL(value.trim());
    return ["http:", "https:"].includes(parsed.protocol);
  } catch {
    return false;
  }
};

const parseMatchDate = (match: CirculationWebMatch): Date | undefined => {
  const isoDate = match.dateDetected ?? match.lastSeen;
  if (!isoDate) {
    return undefined;
  }
  const parsed = new Date(isoDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
};

const formatWorkerDate = (iso?: string | null): string | null => {
  if (!iso) {
    return null;
  }
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

export const FoundOnWebsitesCard = ({ matches, loading = false }: FoundOnWebsitesCardProps) => {
  const [page, setPage] = useState<number>(1);
  const [publishedSort, setPublishedSort] = useState<"desc" | "asc" | null>(null);

  const validMatches = useMemo(() => {
    const filtered = matches.filter((match) => hasValidUrl(match.url));
    return [...filtered].sort((a, b) => {
      const dateA = parseMatchDate(a);
      const dateB = parseMatchDate(b);
      if (dateA && dateB) {
        if (dateA.getTime() === dateB.getTime()) {
          return a.url.localeCompare(b.url);
        }
        return dateA.getTime() - dateB.getTime();
      }
      if (dateA) {
        return -1;
      }
      if (dateB) {
        return 1;
      }
      return a.url.localeCompare(b.url);
    });
  }, [matches]);

  const urlsForLookup = useMemo(() => validMatches.map((match) => match.url), [validMatches]);
  const { results: publicationDates } = usePublicationDates(urlsForLookup);

  const resolvePublishedTimestamp = (match: CirculationWebMatch) => {
    const workerInfo = publicationDates[match.url];
    const source =
      workerInfo?.originalDate ??
      workerInfo?.lastUpdate ??
      match.dateDetected ??
      match.lastSeen;
    if (!source) {
      const fallback = parseMatchDate(match);
      return fallback ? fallback.getTime() : null;
    }
    const timestamp = Date.parse(source);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
    const fallback = parseMatchDate(match);
    return fallback ? fallback.getTime() : null;
  };

  const sortedMatches = useMemo(() => {
    if (!publishedSort) {
      return validMatches;
    }
    const next = [...validMatches];
    next.sort((a, b) => {
      const aValue = resolvePublishedTimestamp(a);
      const bValue = resolvePublishedTimestamp(b);
      if (aValue === null && bValue === null) {
        return a.url.localeCompare(b.url);
      }
      if (aValue === null) {
        return 1;
      }
      if (bValue === null) {
        return -1;
      }
      return publishedSort === "desc" ? bValue - aValue : aValue - bValue;
    });
    return next;
  }, [validMatches, publishedSort, publicationDates]);

  const totalMatches = sortedMatches.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const currentPage = Math.min(page, totalPages);

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return sortedMatches.slice(start, start + PAGE_SIZE);
  }, [sortedMatches, currentPage]);

  const handlePublishedSortToggle = () => {
    setPublishedSort((prev) => {
      const next = prev === "desc" ? "asc" : "desc";
      setPage(1);
      return next;
    });
  };

  const handlePageChange = (nextPage: number) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    setPage(clamped);
  };

  return (
    <AnalysisCardFrame>
      <CardHeader className="flex items-start gap-1">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left -mb-6">
          <CardTitle className="text-sm">Found on Websites</CardTitle>
          <CardDescription className="text-xs text-tertiary">
            Highlights external pages that reference or reuse this image.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="rounded-lg border border-secondary/40 p-6 text-xs text-tertiary">Loading…</div>
        ) : totalMatches === 0 ? (
          <div className="rounded-lg border border-secondary/40 bg-primary px-3 py-3 text-xs text-tertiary">
            No matching websites detected.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-secondary/60 text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-tertiary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Result
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2 text-right font-medium"
                    aria-sort={
                      publishedSort === "asc" ? "ascending" : publishedSort === "desc" ? "descending" : "none"
                    }
                  >
                    <button
                      type="button"
                      onClick={handlePublishedSortToggle}
                      className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-tertiary hover:text-secondary"
                    >
                      <span>Published</span>
                      {publishedSort === "desc" ? (
                        <ArrowDown className="size-3" />
                      ) : publishedSort === "asc" ? (
                        <ArrowUp className="size-3" />
                      ) : (
                        <ArrowDown className="size-3 opacity-40" />
                      )}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary/60">
                {currentItems.map((match) => {
                  const parsedDate = parseMatchDate(match);
                  const formattedDate = parsedDate
                    ? parsedDate.toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })
                    : undefined;
                  const rawTitle = match.pageTitle?.trim();
                  const cleanedTitle = rawTitle && rawTitle.includes("-")
                    ? rawTitle.substring(0, rawTitle.lastIndexOf("-")).trim() || rawTitle
                    : rawTitle;
                  const title = cleanedTitle && cleanedTitle.length > 0 ? cleanedTitle : match.url;
                  return (
                    <tr key={`${match.url}-${match.pageTitle ?? ""}`} className="align-top">
                      <td className="px-3 py-3 text-left">
                        <div className="flex flex-col gap-1">
                          <p className="text-left text-sm font-medium text-secondary line-clamp-2">{title}</p>
                          <a
                            href={match.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex max-w-full items-center gap-1 break-all text-xs text-brand-500 hover:text-brand-400"
                          >
                            <Link01 className="size-3 shrink-0" />
                            <span className="break-all">{match.url}</span>
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right align-middle text-xs text-tertiary">
                        <div className="flex flex-col items-end gap-0.5">
                          {(() => {
                            const workerInfo = publicationDates[match.url];
                            const lines: Array<{ label: string; tone?: "muted" | "error" }> = [];

                            if (workerInfo?.status === "loading") {
                              lines.push({ label: "Detecting…", tone: "muted" });
                            } else if (workerInfo?.status === "error") {
                              lines.push({ label: "—" });
                              lines.push({ label: "Detection failed", tone: "muted" });
                            } else if (workerInfo?.status === "success") {
                              const original = formatWorkerDate(workerInfo.originalDate);
                              const updated = formatWorkerDate(workerInfo.lastUpdate);
                              if (original) {
                                lines.push({ label: `Original · ${original}` });
                              }
                              if (updated && updated !== original) {
                                lines.push({ label: `Updated · ${updated}` });
                              }
                            }

                            if (lines.length === 0) {
                              lines.push({ label: formattedDate ?? "—", tone: formattedDate ? "muted" : undefined });
                            }

                            return lines.map((line) => (
                              <span
                                key={`${match.url}-${line.label}`}
                                className={
                                  line.tone === "muted"
                                    ? "text-[11px] text-tertiary"
                                    : line.tone === "error"
                                      ? "text-[11px] text-destructive"
                                      : "text-xs font-medium text-secondary"
                                }
                              >
                                {line.label}
                              </span>
                            ));
                          })()}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalPages > 1 && (
          <Paginations.PaginationButtonGroup
            page={currentPage}
            total={totalPages}
            onPageChange={handlePageChange}
            align="center"
          />
        )}
      </CardContent>
    </AnalysisCardFrame>
  );
};

export default FoundOnWebsitesCard;
