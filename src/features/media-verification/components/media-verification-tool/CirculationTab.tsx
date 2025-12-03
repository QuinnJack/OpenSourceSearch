import { AnalysisCardFrame, FoundOnWebsitesCard, VisuallySimilarImagesCard } from "@/components/analysis";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import type { AnalysisData } from "@/shared/types/analysis";

interface CirculationTabProps {
  circulationMatches: NonNullable<AnalysisData["circulation"]>["webMatches"];
  partialMatchingImages: NonNullable<AnalysisData["circulation"]>["partialMatchingImages"];
  visuallySimilarImages: NonNullable<AnalysisData["circulation"]>["visuallySimilarImages"];
  isVisionLoading: boolean;
  fallbackImageUrl?: string | null;
}

export function CirculationTab({
  circulationMatches,
  partialMatchingImages,
  visuallySimilarImages,
  isVisionLoading,
  fallbackImageUrl,
}: CirculationTabProps) {
  return (
    <>
      <FoundOnWebsitesCard matches={circulationMatches} loading={isVisionLoading} />
      <VisuallySimilarImagesCard
        partialMatches={partialMatchingImages}
        visuallySimilarImages={visuallySimilarImages}
        loading={isVisionLoading}
        fallbackImageUrl={fallbackImageUrl ?? undefined}
      />

    </>
  );
}
