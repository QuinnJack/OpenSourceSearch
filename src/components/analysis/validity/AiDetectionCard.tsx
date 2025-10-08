"use client";

import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/base/card/card";

import type { AiDetectionData } from "@/types/analysis";
import { AlertCircle } from "@untitledui/icons";
import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import { BadgeWithIcon } from "@/components/base/badges/badges";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";

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
            Automated AI Detection
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
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-tertiary">Confidence Score</span>
            <span className="font-semibold text-secondary">{data.confidence}%</span>
          </div>
          <ProgressBar value={data.confidence} />
        </div>

        {/* Placeholder per-engine scores */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-xs text-tertiary">Average Confidence Score</span>

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
      </CardContent>
    </AnalysisCardFrame >

  );
}

export default AiDetectionCard;
