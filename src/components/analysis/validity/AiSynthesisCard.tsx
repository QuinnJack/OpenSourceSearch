"use client";

import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";

import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import { Badge } from "@/components/ui/badges/badges";
import type { SynthesisData } from "@/shared/types/analysis";

export interface AiSynthesisCardProps {
  data: SynthesisData;
}

export function AiSynthesisCard({ data }: AiSynthesisCardProps) {
  const originLabel = data.origin?.trim();
  const showOriginBadge = Boolean(originLabel && originLabel.toLowerCase() !== "unknown");
  const synthesisDetails = data.details?.trim();
  const message = synthesisDetails || "AI synthesis analysis is not yet available for this upload.";

  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm mr-18">AI Synthesis</CardTitle>
        <CardDescription className="text-xs mr-11">Generation detection overview.</CardDescription>
        {showOriginBadge && (
          <CardAction>
            <Badge type="modern" color="gray" className="px-2 py-0.5">
              <span className="text-xs font-medium">{originLabel}</span>
            </Badge>
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div className="rounded-lg border border-secondary/40 bg-primary px-3 py-3 text-sm text-tertiary">
          {message}
        </div>
      </CardContent>
    </AnalysisCardFrame>
  );
}

export default AiSynthesisCard;
