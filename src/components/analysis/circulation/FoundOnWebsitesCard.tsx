"use client";

import * as Paginations from "@/components/ui/pagination/pagination";

import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { useEffect, useMemo, useState } from "react";

import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import type { CirculationWebMatch } from "@/shared/types/analysis";
import { Link01 } from "@untitledui/icons";

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

export const FoundOnWebsitesCard = ({ matches, loading = false }: FoundOnWebsitesCardProps) => {
  const [page, setPage] = useState<number>(1);

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

  const totalMatches = validMatches.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const currentPage = Math.min(page, totalPages);

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return validMatches.slice(start, start + PAGE_SIZE);
  }, [validMatches, currentPage]);

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
          <div className="rounded-lg border border-secondary/40 p-6 text-xs text-tertiary">
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
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Published
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
                        {formattedDate ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && totalMatches > PAGE_SIZE && (
          <div className="mt-3">
            <Paginations.PaginationPageDefault
              page={currentPage}
              total={totalPages}
              onPageChange={handlePageChange}
            />
          </div>
        )}
      </CardContent>
    </AnalysisCardFrame>
  );
};

export default FoundOnWebsitesCard;
