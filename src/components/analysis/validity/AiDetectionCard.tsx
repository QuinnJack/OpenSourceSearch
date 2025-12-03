"use client";

import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";

import type { AiDetectionData } from "@/shared/types/analysis";
import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import { BadgeWithIcon } from "@/components/ui/badges/badges";
import { ProgressBar } from "@/components/ui/progress-indicators/progress-indicators";
import { AlertCircle } from "@untitledui/icons";

export interface AiDetectionCardProps {
  data: AiDetectionData;
  onOpenDetails?: () => void;
}

export function AiDetectionCard({ data }: AiDetectionCardProps) {
  const providerColorMap: Record<string, string> = {
    sightengine: "oklch(54.41% 0.214 19.06)",
  };

  const providerSegments =
    (data.confidenceBreakdown && data.confidenceBreakdown.length > 0)
      ? data.confidenceBreakdown
      : typeof data.sightengineConfidence === "number"
        ? [
          {
            providerId: "sightengine",
            label: "SightEngine",
            value: data.sightengineConfidence,
          },
        ]
        : [];

  const progressItems = providerSegments.map((segment) => ({
    label: segment.label,
    value: segment.value,
    color: providerColorMap[segment.providerId] ?? undefined,
  }));

  const hasConfidenceValue = Number.isFinite(data.confidence) && (data.confidence ?? 0) > 0;
  const hasConfidenceData = progressItems.length > 0 || hasConfidenceValue;
  const averageConfidenceDisplay = hasConfidenceValue ? Math.round(Number(data.confidence)) : null;
  const fallbackMessage = data.details?.trim() || "Automated detection results are not yet available for this image.";

  return (
    <AnalysisCardFrame>
      <CardHeader className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5 flex-1 min-w-0 text-left -mb-5">
          <CardTitle className="flex items-center gap-1 text-sm justify-start text-left">
            Automated Detection
          </CardTitle>
          <CardDescription className="text-xs text-tertiary">
            Provider confidence breakdowns from connected detection services.
          </CardDescription>
        </div>
        {hasConfidenceData && data.label && (
          <div className="flex items-center gap-2 shrink-0">
            <BadgeWithIcon
              type="pill-color"
              size="sm"
              color="error"
              iconLeading={AlertCircle}
              className="px-2 py-0.5"
            >
              <span className="text-sm font-regular truncate">{data.label}</span>
            </BadgeWithIcon>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        {hasConfidenceData ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-tertiary">Average AI Confidence</span>
              {typeof averageConfidenceDisplay === "number" && (
                <span className="font-semibold text-secondary">{averageConfidenceDisplay}%</span>
              )}
            </div>
            {progressItems.length > 0 ? (
              <ProgressBar overlapSegments items={progressItems} />
            ) : (
              <ProgressBar value={data.confidence ?? 0} />
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-secondary/40 bg-primary px-3 py-3 text-xs text-tertiary">
            {fallbackMessage}
          </div>
        )}
      </CardContent>
    </AnalysisCardFrame>
  );
}

export default AiDetectionCard;
