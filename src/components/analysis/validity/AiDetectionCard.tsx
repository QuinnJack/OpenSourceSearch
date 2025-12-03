"use client";

import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";

import type { AiDetectionData } from "@/shared/types/analysis";
import { AlertCircle } from "@untitledui/icons";
import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import { BadgeWithIcon } from "@/components/ui/badges/badges";
import { ProgressBar } from "@/components/ui/progress-indicators/progress-indicators";

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

  const averageConfidenceDisplay = Number.isFinite(data.confidence)
    ? Math.round(data.confidence)
    : 0;

  return (
    <AnalysisCardFrame>
      <CardHeader className='flex items-center gap-3'>
        <div className='flex flex-col gap-0.5 flex-1 min-w-0 text-left'>
          <CardTitle className='flex items-center gap-1 text-sm justify-start text-left'>
            Automated Detection
          </CardTitle>
          <CardDescription></CardDescription>
        </div>
        <div className='flex items-center gap-2 shrink-0'>

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
      </CardHeader>
      <CardContent className="space-y-3">
        {/* <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-tertiary">Confidence Score</span>
            <span className="font-semibold text-secondary">{data.confidence}%</span>
          </div>
           <ProgressBar value={data.confidence} /> 
        </div> */}

        {/* Averaged confidence with per-provider hover breakdown */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-tertiary">Average AI Confidence</span>

            <span className="font-semibold text-secondary">{averageConfidenceDisplay}%</span>
          </div>
          {progressItems.length > 0 ? (
            <ProgressBar overlapSegments items={progressItems} />
          ) : (
            <ProgressBar value={data.confidence} />
          )}
        </div>
      </CardContent>
    </AnalysisCardFrame >

  );
}

export default AiDetectionCard;
