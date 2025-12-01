import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion/accordion";

import { Badge } from "@/components/ui/badges/badges";
import type { GeocodedLocation } from "@/features/media-verification/api/geocoding";
import type { GeolocationAnalysis } from "@/features/media-verification/api/geolocation";
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
}

const buildCitationNodes = (text: string): ReactNode[] => {
  const nodes: ReactNode[] = [];
  const citationPattern = /\[(\d+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let key = 0;

  let match: RegExpExecArray | null;
  while ((match = citationPattern.exec(text)) !== null) {
    const index = match.index ?? 0;
    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    const group = [{ label: match[1], href: match[2], prefix: "" }];
    let groupEnd = citationPattern.lastIndex;

    while (text.slice(groupEnd, groupEnd + 2) === ", ") {
      const nextMatch = citationPattern.exec(text);
      if (!nextMatch || nextMatch.index !== groupEnd + 2) {
        break;
      }
      group.push({ label: nextMatch[1], href: nextMatch[2], prefix: ", " });
      groupEnd = citationPattern.lastIndex;
    }

    nodes.push(
      <sup key={`citation-${key++}`} className="ml-0.5 text-[0.7rem] font-normal leading-[1.7] align-super text-brand">
        {group.map((entry, index) => (
          <span key={`cite-${index}`} className="whitespace-nowrap">
            {entry.prefix}
            <a href={entry.href} target="_blank" rel="noreferrer" className="text-brand no-underline hover:text-brand-600">
              {entry.label}
            </a>
          </span>
        ))}
      </sup>,
    );

    cursor = groupEnd;
    citationPattern.lastIndex = groupEnd;
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
      <div className="space-y-2 rounded-xl border border-secondary/40 p-4">
        <p className="text-sm text-tertiary">Enable Geolocation in settings to query where this photo was taken.</p>
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
          {segments.locationLine ? buildCitationNodes(segments.locationLine) : "No answer yet."}
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
                {explanationContent ? buildCitationNodes(explanationContent) : "Gemini did not provide an explanation."}
              </div>
              <div className="space-y-1">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-secondary">Google sites visited</p>
                {mapQueries.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {mapQueries.map((query) => (
                      <Badge key={query} color="gray" size="sm">
                        {query}
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
