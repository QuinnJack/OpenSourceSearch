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
        fallbackImageUrl={fallbackImageUrl}
      />

      <AnalysisCardFrame>
        <CardHeader className="pb-0">
          <CardTitle className="text-sm">Circulation Analysis</CardTitle>
          <CardDescription className="text-xs">
            Additional repost patterns, timeline charts, and regional trends will appear here as they are implemented.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="text-sm text-tertiary">
            Track supplementary circulation signals such as first-seen timestamps, social shares, and clustering
            insights in a future update.
          </p>
        </CardContent>
      </AnalysisCardFrame>
    </>
  );
}
