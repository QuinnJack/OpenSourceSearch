import { useEffect, useMemo, useState } from "react";

import { AnalysisCardFrame } from "@/components/analysis";
import { Badge } from "@/components/ui/badges/badges";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import type { GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import {
  DEFAULT_CANADA_VIEWPORT,
  EXPERIENCE_WEB_MAPS,
  buildExperienceUrl,
  rankWebMaps,
  type ExperienceMapMatch,
  type ExperienceWebMap,
} from "@/features/media-verification/constants/experienceMaps";
import { cx } from "@/utils/cx";

interface ContextTabProps {
  visionResult?: GoogleVisionWebDetectionResult;
  isVisionLoading: boolean;
}

const getEntityLabels = (visionResult?: GoogleVisionWebDetectionResult): string[] => {
  return (visionResult?.entities ?? [])
    .map((entity) => entity.description)
    .filter((description): description is string => Boolean(description && description.trim().length > 0));
};

const getHighlightTerms = (visionResult?: GoogleVisionWebDetectionResult): string[] => {
  const bestGuesses = visionResult?.bestGuesses ?? [];
  if (bestGuesses.length > 0) {
    return bestGuesses;
  }
  return getEntityLabels(visionResult);
};

const getInitialMapId = (matches: ExperienceMapMatch[]): string | undefined => {
  if (matches[0]) {
    return matches[0].map.id;
  }
  return EXPERIENCE_WEB_MAPS[0]?.id;
};

export function ContextTab({ visionResult, isVisionLoading }: ContextTabProps) {
  const highlightTerms = getHighlightTerms(visionResult);
  const mapMatches = useMemo(
    () => rankWebMaps(visionResult?.entities, visionResult?.bestGuesses),
    [visionResult?.entities, visionResult?.bestGuesses],
  );
  const [selectedMapId, setSelectedMapId] = useState<string | undefined>(() => getInitialMapId(mapMatches));
  const [userOverride, setUserOverride] = useState(false);
  const topMatchId = mapMatches[0]?.map.id;

  useEffect(() => {
    if (userOverride) {
      return;
    }
    const nextId = topMatchId ?? EXPERIENCE_WEB_MAPS[0]?.id;
    if (nextId && nextId !== selectedMapId) {
      setSelectedMapId(nextId);
    }
  }, [selectedMapId, topMatchId, userOverride]);

  const availableMap = useMemo<ExperienceWebMap | undefined>(() => {
    const fallback = EXPERIENCE_WEB_MAPS[0];
    if (!selectedMapId) {
      return fallback;
    }
    return EXPERIENCE_WEB_MAPS.find((map) => map.id === selectedMapId) ?? fallback;
  }, [selectedMapId]);

  const selectedMapUrl = availableMap ? buildExperienceUrl(availableMap, DEFAULT_CANADA_VIEWPORT) : undefined;
  const hasMatches = mapMatches.length > 0;

  const recommendedIds = useMemo(() => new Set(mapMatches.map((match) => match.map.id)), [mapMatches]);

  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left -mb-6">
          <CardTitle className="text-sm">Geolocation</CardTitle>
          <CardDescription className="text-xs text-tertiary">
            {hasMatches ? "Recommended map selection based on the detected context." : "Choose any Experience Builder map to explore context."}
          </CardDescription>
        </div>


      </CardHeader>
      <CardContent className="space-y-4 pt-4">


        <section className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">

            <div className="ml-auto flex items-center gap-2">
              <label htmlFor="map-selector" className="text-xs font-medium text-secondary">
                Switch map
              </label>
              <select
                id="map-selector"
                className="rounded-lg border border-secondary/40 bg-primary px-3 py-1.5 text-sm text-secondary shadow-xs focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/40"
                value={availableMap?.id ?? ""}
                onChange={(event) => {
                  setSelectedMapId(event.target.value);
                  setUserOverride(true);
                }}
              >
                {EXPERIENCE_WEB_MAPS.map((map) => (
                  <option key={map.id} value={map.id}>
                    {map.title}
                    {recommendedIds.has(map.id) ? " • suggested" : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasMatches && (
            <div className="flex flex-wrap gap-2">
              {mapMatches.map((match) => (
                <button
                  type="button"
                  key={match.map.id}
                  onClick={() => {
                    setSelectedMapId(match.map.id);
                    setUserOverride(true);
                  }}
                  className={cx(
                    "rounded-full border px-3 py-1 text-xs font-medium transition",
                    match.map.id === availableMap?.id
                      ? "border-brand/60 bg-brand/10 text-brand-600"
                      : "border-secondary/40 text-secondary hover:border-brand/40 hover:text-brand-700",
                  )}
                >
                  {match.map.title}
                  <span className="ml-1 text-[0.7rem] text-tertiary">
                    ({match.score} match{match.score === 1 ? "" : "es"})
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {availableMap && selectedMapUrl ? (
          <div className="space-y-3">
            <div>
              <p className="text-sm font-semibold text-secondary">{availableMap.title}</p>
              <p className="text-xs text-tertiary">{availableMap.description}</p>
            </div>
            <div className="overflow-hidden rounded-xl border border-secondary/30 bg-primary shadow-sm">
              <iframe
                key={availableMap.id}
                src={selectedMapUrl}
                title={`Experience Builder map: ${availableMap.title}`}
                loading="lazy"
                className="h-96 w-full border-0"
                allowFullScreen
              />
            </div>
            {availableMap.tags && availableMap.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {availableMap.tags.map((tag) => (
                  <Badge key={tag} color="gray" size="sm">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-tertiary">No Experience Builder maps are configured yet.</p>
        )}
        <section>
          <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Vision hints</p>
          {isVisionLoading && (
            <p className="mt-1 text-xs text-tertiary">Pulling Google Vision context… maps will update when the response returns.</p>
          )}
          {highlightTerms.length === 0 && !isVisionLoading && (
            <p className="mt-1 text-sm text-tertiary">No best guesses yet. Showing the default Canada overview.</p>
          )}
          {highlightTerms.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {highlightTerms.map((term) => (
                <Badge key={term} color="brand" size="sm">
                  {term}
                </Badge>
              ))}
            </div>
          )}
        </section>
      </CardContent>
    </AnalysisCardFrame>
  );
}
