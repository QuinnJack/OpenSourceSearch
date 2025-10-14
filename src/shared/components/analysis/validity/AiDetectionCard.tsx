"use client";

import { AlertCircle } from "@untitledui/icons";

import AnalysisCardFrame from "@/shared/components/analysis/shared/AnalysisCardFrame";
import { BadgeWithIcon } from "@/shared/components/base/badges/badges";
import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/shared/components/base/card/card";
import { ProgressBar } from "@/shared/components/base/progress-indicators/progress-indicators";
import type { AiDetectionData } from "@/shared/types/analysis";

export interface AiDetectionCardProps {
  data: AiDetectionData;
  onOpenDetails?: () => void;
}

export function AiDetectionCard({ data }: AiDetectionCardProps) {
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
            size="md"
            color="error"
            iconLeading={AlertCircle}
          >
            <span className="text-xs font-regular truncate">{data.label}</span>
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

        {/* Placeholder per-engine scores */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-tertiary">Average AI Confidence</span>

            <span className="font-semibold text-secondary">{data.confidence}%</span>
          </div>
          <ProgressBar
            overlapSegments
            items={[
              { label: "Hive", value: 50, color: "oklch(51.15% 0.204 260.17)" },
              { label: "Sightengine", value: 70, color: "oklch(54.41% 0.214 19.06)" },
              { label: "Optic", value: 65, color: "oklch(70.03% 0.194 144.71)" },
            ]}
          />
        </div>
        {typeof data.sightengineConfidence === "number" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-xs text-tertiary">SightEngine Confidence</span>
              <span className="font-semibold text-secondary">{data.sightengineConfidence}%</span>
            </div>
            <ProgressBar value={data.sightengineConfidence} />
          </div>
        )}
      </CardContent>
    </AnalysisCardFrame >

  );
}

export default AiDetectionCard;
