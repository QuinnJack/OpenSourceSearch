"use client";

import { CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";

import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";
import { Badge } from "@/components/ui/badges/badges";
import { SearchRefraction } from "@untitledui/icons";
import type { SynthesisData } from "@/shared/types/analysis";

export interface AiSynthesisCardProps {
  data: SynthesisData;
}

export function AiSynthesisCard({ data }: AiSynthesisCardProps) {
  return (
    <AnalysisCardFrame>
      <CardHeader className="border-b pb-2">
        <CardTitle className="text-sm mr-18">AI Synthesis</CardTitle>
        <CardDescription className="text-xs mr-11">Generation detection</CardDescription>
        <CardAction>
          <Badge type="modern" color="gray" className="px-2 py-0.5">
            <span className="text-xs font-medium">{data.origin}</span>
          </Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div className="rounded-md border border-secondary bg-primary px-3 py-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-secondary_alt">
              <SearchRefraction className="size-4 text-tertiary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-secondary">Origin Analysis</p>
              <p className="text-xs text-tertiary">Checking AI signatures...</p>
            </div>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-tertiary">{data.details}</p>
      </CardContent>
    </AnalysisCardFrame>
  );
}

export default AiSynthesisCard;
