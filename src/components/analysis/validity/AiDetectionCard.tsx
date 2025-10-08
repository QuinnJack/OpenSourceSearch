"use client";

import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/base/card/card";
import { BadgeWithIcon } from "@/components/base/badges/badges";
import { ProgressBar } from "@/components/base/progress-indicators/progress-indicators";
import { AlertCircle } from "@untitledui/icons";
import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import type { AiDetectionData } from "@/types/analysis";

export interface AiDetectionCardProps {
  data: AiDetectionData;
  onOpenDetails?: () => void;
}

export function AiDetectionCard({ data }: AiDetectionCardProps) {
  return (
    <AnalysisCardFrame>
      <CardHeader className="border-b pb-2">
        <CardTitle className="text-sm mr-10">AI Detection</CardTitle>
        <CardDescription className="text-xs mr-2">Manipulation analysis</CardDescription>
        <CardAction>
          <BadgeWithIcon type="modern" color={data.status === "warning" ? "warning" : data.status === "error" ? "error" : "gray"} iconTrailing={AlertCircle} className="px-2 py-0.5">
            <span className="text-xs font-medium">{data.label}</span>
          </BadgeWithIcon>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-tertiary">Confidence Score</span>
            <span className="font-semibold text-secondary">{data.confidence}%</span>
          </div>
          <ProgressBar value={data.confidence} />
        </div>
        <p className="text-sm leading-relaxed text-tertiary">{data.details}</p>
      </CardContent>
    </AnalysisCardFrame>
  );
}

export default AiDetectionCard;
