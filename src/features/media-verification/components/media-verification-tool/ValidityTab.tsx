import { AiDetectionCard, AiSynthesisCard, FactCheckCard, MetadataExifCard } from "@/components/analysis/validity";
import type { AnalysisData } from "@/shared/types/analysis";
import { isApiEnabled } from "@/shared/config/api-toggles";
import { useFactCheckSearch } from "@/features/media-verification/hooks/useFactCheckSearch";

interface ValidityTabProps {
  analysis: AnalysisData;
  imageUrl: string;
}

export function ValidityTab({ analysis, imageUrl }: ValidityTabProps) {
  const isGoogleImagesEnabled = isApiEnabled("google_images");
  const { claims, loading, error, hasSearched } = useFactCheckSearch(imageUrl, isGoogleImagesEnabled);

  return (
    <>
      <AiDetectionCard data={analysis.aiDetection} />
      <MetadataExifCard data={analysis.metadata} />
      <FactCheckCard
        claims={claims}
        loading={loading}
        error={error}
        hasSearched={hasSearched}
        isEnabled={isGoogleImagesEnabled}
      />
      <AiSynthesisCard data={analysis.synthesis} />
    </>
  );
}
