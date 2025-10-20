"use client";

import { useEffect, useMemo, useState } from "react";

import AnalysisCardFrame from "@/shared/components/analysis/shared/AnalysisCardFrame";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/base/card/card";
import type { CirculationWebMatch } from "@/shared/types/analysis";
import * as Paginations from "@/components/application/pagination/pagination";
import { Link01 } from "@untitledui/icons";

interface FoundOnWebsitesCardProps {
  matches: CirculationWebMatch[];
  loading?: boolean;
}

const PAGE_SIZE = 6;

export const FoundOnWebsitesCard = ({ matches, loading = false }: FoundOnWebsitesCardProps) => {
  const [page, setPage] = useState<number>(1);

  const totalMatches = matches.length;
  const totalPages = Math.max(1, Math.ceil(totalMatches / PAGE_SIZE));

  useEffect(() => {
    setPage((prev) => Math.min(prev, totalPages));
  }, [totalPages]);

  const currentPage = Math.min(page, totalPages);

  const currentItems = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return matches.slice(start, start + PAGE_SIZE);
  }, [matches, currentPage]);

  const handlePageChange = (nextPage: number) => {
    const clamped = Math.min(Math.max(1, nextPage), totalPages);
    setPage(clamped);
  };

  return (
    <AnalysisCardFrame>
      <CardHeader className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <CardTitle className="text-sm">Found on Websites</CardTitle>
          <CardDescription className="text-xs text-tertiary">
            Highlights external pages that reference or reuse this image.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="rounded-lg border border-secondary/40 p-6 text-xs text-tertiary">Loading…</div>
        ) : currentItems.length === 0 ? (
          <div className="rounded-lg border border-secondary/40 p-6 text-xs text-tertiary">No matching websites found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-secondary/60 text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-tertiary">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Result
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-secondary/60">
                {currentItems.map((match) => {
                  const title = match.pageTitle?.trim() ? match.pageTitle : match.url;
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
