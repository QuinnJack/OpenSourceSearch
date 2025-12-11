import type { AnalysisData } from "@/shared/types/analysis";
import { CirculationTab } from "./CirculationTab";
import { ContextTab } from "./ContextTab";
import { ForensicsTab } from "./ForensicsTab";
import { MEDIA_VERIFICATION_TABS } from "@/features/media-verification/constants/tabItems";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";
import { Tabs } from "@/components/ui/tabs/tabs";
import { ValidityTab } from "./ValidityTab";

interface MediaVerificationTabsProps {
  activeTab: string;
  onTabChange: (key: string) => void;
  analysis: AnalysisData;
  file: MediaVerificationFile;
  geolocationEnabled?: boolean;
  geolocationAvailable?: boolean;
  layoutResizeKey?: string;
  locationLayerRecommendationLoading?: boolean;
  locationLayerRecommendationError?: string;
  locationLayerRecommendation?: MediaVerificationFile["locationLayerRecommendation"];
  geolocationConfidence?: number | null;
}

export function MediaVerificationTabs({
  activeTab,
  onTabChange,
  analysis,
  file,
  geolocationEnabled,
  geolocationAvailable,
  layoutResizeKey,
  locationLayerRecommendation,
  locationLayerRecommendationLoading,
  locationLayerRecommendationError,
  geolocationConfidence,
}: MediaVerificationTabsProps) {
  const circulationMatches = analysis.circulation?.webMatches ?? [];
  const partialMatchingImages = analysis.circulation?.partialMatchingImages ?? [];
  const visuallySimilarImages = analysis.circulation?.visuallySimilarImages ?? [];
  const imageUrl = (file.sourceUrl || file.previewUrl || "").trim();

  return (
    <Tabs selectedKey={activeTab} onSelectionChange={(key) => onTabChange(String(key))}>
      <Tabs.List items={MEDIA_VERIFICATION_TABS} type="underline" size="sm" className="grid grid-cols-4" />

      <Tabs.Panel id="validity" className="mt-6 space-y-4">
        <ValidityTab analysis={analysis} imageUrl={imageUrl} />
      </Tabs.Panel>

      <Tabs.Panel id="circulation" className="mt-6 space-y-4">
        <CirculationTab
          circulationMatches={circulationMatches}
          partialMatchingImages={partialMatchingImages}
          visuallySimilarImages={visuallySimilarImages}
          isVisionLoading={Boolean(file.visionLoading)}
          fallbackImageUrl={file.previewUrl || file.sourceUrl}
        />
      </Tabs.Panel>

      <Tabs.Panel id="context" className="mt-6">
        <ContextTab
          visionResult={file.visionWebDetection}
          isVisionLoading={Boolean(file.visionLoading)}
          geolocationAnalysis={file.geolocationAnalysis}
          geolocationLoading={Boolean(file.geolocationLoading)}
          geolocationError={file.geolocationError}
          geolocationRequested={Boolean(file.geolocationRequested)}
          geolocationEnabled={Boolean(geolocationEnabled)}
          geolocationAvailable={Boolean(geolocationAvailable)}
          geolocationCoordinates={file.geolocationCoordinates}
          geolocationCoordinatesLoading={Boolean(file.geolocationCoordinatesLoading)}
          geolocationCoordinatesError={file.geolocationCoordinatesError}
          locationLayerRecommendation={locationLayerRecommendation}
          locationLayerRecommendationLoading={locationLayerRecommendationLoading}
          locationLayerRecommendationError={locationLayerRecommendationError}
          geolocationConfidence={geolocationConfidence ?? file.geolocationConfidence}
          resizeTrigger={layoutResizeKey}
        />
      </Tabs.Panel>

      <Tabs.Panel id="forensics" className="mt-6" shouldForceMount>
        <ForensicsTab file={file} isActive={activeTab === "forensics"} />
      </Tabs.Panel>
    </Tabs>
  );
}
