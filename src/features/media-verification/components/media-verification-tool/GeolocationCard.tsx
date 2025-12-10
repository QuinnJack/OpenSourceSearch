import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion/accordion";

import { Badge } from "@/components/ui/badges/badges";
import type { GeocodedLocation } from "@/features/media-verification/api/geocoding";
import type { GeolocationAnalysis, GeolocationSource } from "@/features/media-verification/api/geolocation";
import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

interface GeolocationCardProps {
  analysis?: GeolocationAnalysis;
  isLoading: boolean;
  error?: string;
  wasRequested: boolean;
  isEnabled: boolean;
  isAvailable: boolean;
  coordinates?: GeocodedLocation | null;
  coordinatesLoading?: boolean;
  coordinatesError?: string;
  onLocationClick?: (location: GeocodedLocation) => void;
}

const buildCitationNodes = (text: string, sources?: GeolocationSource[]): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const sourceMap = new Map<number, string>();
  sources?.forEach((source) => {
    if (typeof source.index === "number" && source.uri) {
      sourceMap.set(source.index, source.uri);
    }
  });

  const citationPattern = /\[(\d+)\]\(([^)]+)\)|\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g;
  let cursor = 0;
  let key = 0;

  const renderSuperscript = (group: { label: string; href?: string; prefix: string }[]) => (
    <sup key={`citation-${key++}`} className="ml-0.5 text-[0.7rem] font-normal leading-[1.4] align-super text-brand">
      {group.map((entry, index) => (
        <span key={`cite-${index}`} className="whitespace-nowrap">
          {entry.prefix}
          {entry.href ? (
            <a href={entry.href} target="_blank" rel="noreferrer" className="text-brand no-underline hover:text-brand-600">
              {entry.label}
            </a>
          ) : (
            entry.label
          )}
        </span>
      ))}
    </sup>
  );

  let match: RegExpExecArray | null;
  while ((match = citationPattern.exec(text)) !== null) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    if (match[1] && match[2]) {
      const group = [{ label: match[1] as string, href: match[2], prefix: "" }];
      let groupEnd = citationPattern.lastIndex;

      while (text.slice(groupEnd, groupEnd + 2) === ", ") {
        const nextMatch = citationPattern.exec(text);
        if (!nextMatch || nextMatch.index !== groupEnd + 2 || !nextMatch[1] || !nextMatch[2]) {
          citationPattern.lastIndex = groupEnd;
          break;
        }
        group.push({ label: nextMatch[1], href: nextMatch[2], prefix: ", " });
        groupEnd = citationPattern.lastIndex;
      }

      nodes.push(renderSuperscript(group));
      cursor = groupEnd;
      citationPattern.lastIndex = groupEnd;
      continue;
    }

    if (match[3]) {
      const labels = match[3]
        .split(/\s*,\s*/)
        .map((label, entryIndex) => {
          const parsed = Number.parseInt(label, 10);
          return {
            label,
            href: Number.isFinite(parsed) ? sourceMap.get(parsed) : undefined,
            prefix: entryIndex > 0 ? ", " : "",
          };
        })
        .filter((entry) => entry.label.length > 0);

      if (labels.length > 0) {
        nodes.push(renderSuperscript(labels));
        cursor = citationPattern.lastIndex;
        continue;
      }
    }

    const fallback = text.slice(index, citationPattern.lastIndex);
    nodes.push(fallback);
    cursor = citationPattern.lastIndex;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes;
};

const getSegments = (analysis: GeolocationAnalysis): { locationLine: string; explanation: string } => {
  if (analysis.locationLine || analysis.explanation) {
    return {
      locationLine: analysis.locationLine ?? "",
      explanation: analysis.explanation ?? "",
    };
  }

  const content = analysis.answerWithCitations || analysis.answer || "";
  const lines = content.split(/\n+/).map((segment) => segment.trim()).filter(Boolean);
  const withoutConfidence = lines.filter((line) => !/confidence:/i.test(line));
  return {
    locationLine: withoutConfidence[0] ?? "",
    explanation: withoutConfidence.slice(1).join(" "),
  };
};

export const GeolocationCard = ({
  analysis,
  isLoading,
  error,
  wasRequested,
  isEnabled,
  isAvailable,
  coordinates,
  coordinatesLoading,
  coordinatesError,
  onLocationClick,
}: GeolocationCardProps) => {
  if (!isAvailable) {
    return (
      <div className="space-y-2 rounded-xl border border-secondary/40 p-4">
        <p className="text-sm text-tertiary">
          Add <code>VITE_GEMINI_API_KEY</code> to enable Gemini-powered geolocation answers.
        </p>
      </div>
    );
  }

  if (!isEnabled) {
    return (
      <div className="rounded-lg border border-secondary/40 bg-primary px-3 py-3 text-xs text-tertiary">
        Enable Location Analysis in settings to ask Gemini where this photo was taken and prefill relevant map layers.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-2 rounded-xl border border-secondary/40 p-4">
        <p className="text-sm text-tertiary">Geolocating...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2 rounded-xl border border-secondary/40 p-4">
        <p className="text-sm text-error-primary">
          Gemini could not determine a location: <span className="font-medium">{error}</span>
        </p>
      </div>
    );
  }

  if (!wasRequested) {
    return (
      <div className="space-y-2 rounded-xl border border-secondary/40 p-4">
        <p className="text-sm text-tertiary">Upload a photo or paste a link to ask Gemini for grounded location insight.</p>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="space-y-2 rounded-xl border border-secondary/40 p-4">
        <p className="text-sm text-tertiary">No answer is available yet. Try again once the image finishes processing.</p>
      </div>
    );
  }

  const segments = getSegments(analysis);
  const resolvedConfidence =
    typeof analysis.confidenceScore === "number" ? analysis.confidenceScore : undefined;
  const explanationContent = segments.explanation?.trim();

  const mapQueries = analysis.webSearchQueries ?? [];

  return (
    <div className="space-y-4 rounded-xl border border-secondary/40 p-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-secondary">Geolocation</p>
        <p className={cx("text-base font-semibold text-secondary leading-relaxed")}>
          {segments.locationLine ? (
            onLocationClick && coordinates ? (
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) return;
                  onLocationClick(coordinates);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    if ((e.target as HTMLElement).closest('a')) return;
                    e.preventDefault();
                    onLocationClick(coordinates);
                  }
                }}
                className="text-left hover:text-brand-600 cursor-pointer transition-colors inline-block"
                title="Fly to this location on the map"
              >
                {buildCitationNodes(segments.locationLine, analysis.sources)}
              </div>
            ) : (
              buildCitationNodes(segments.locationLine, analysis.sources)
            )
          ) : (
            "No answer yet."
          )}
        </p>
      </div>

      <Accordion type="multiple" className="w-full space-y-2">
        <AccordionItem value="details" className="border-secondary/30">
          <AccordionTrigger className="px-2 text-xs font-semibold uppercase tracking-wide text-secondary">
            Explanation
          </AccordionTrigger>
          <AccordionContent className="px-2">
            <div className="space-y-3 text-sm text-secondary">
              <div>
                {explanationContent ? buildCitationNodes(explanationContent, analysis.sources) : "Gemini did not provide an explanation."}
              </div>
              <div className="space-y-1">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-secondary">Google Searches</p>
                {mapQueries.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {mapQueries.map((query) => (
                      <Badge
                        key={query}
                        color="gray"
                        size="sm"
                      >
                        <a
                          href={`https://www.google.com/search?q=${encodeURIComponent(query)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="cursor-pointer focus:underline"
                          tabIndex={0}
                          title={`Search Google for "${query}"`}
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => {
                            // Support enter/space key for accessibility
                            if (e.key === "Enter" || e.key === " ") {
                              window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank", "noopener,noreferrer");
                            }
                          }}
                        >
                          {query}
                        </a>
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-tertiary">No search terms were shared for this response.</p>
                )}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {coordinatesLoading ? (
        <p className="text-[0.7rem] text-tertiary">Dev coords: looking up…</p>
      ) : coordinates ? (
        <p className="text-[0.7rem] text-tertiary">
          Dev coords: {coordinates.latitude.toFixed(4)}, {coordinates.longitude.toFixed(4)}
          {typeof resolvedConfidence === "number" && ` (Gemini confidence ${resolvedConfidence}/10)`}
        </p>
      ) : coordinatesError ? (
        <p className="text-[0.7rem] text-error-primary">Dev coords error: {coordinatesError}</p>
      ) : null}
    </div>
  );
};
