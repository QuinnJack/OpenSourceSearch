import { Tabs } from "@/components/ui/tabs/tabs";
import type { AnalysisData } from "@/shared/types/analysis";

import { MEDIA_VERIFICATION_TABS } from "@/features/media-verification/constants/tabItems";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";
import { ValidityTab } from "./ValidityTab";
import { CirculationTab } from "./CirculationTab";
import { ContextTab } from "./ContextTab";
import { ForensicsTab } from "./ForensicsTab";

interface MediaVerificationTabsProps {
  activeTab: string;
  onTabChange: (key: string) => void;
  analysis: AnalysisData;
  file: MediaVerificationFile;
}

export function MediaVerificationTabs({
  activeTab,
  onTabChange,
  analysis,
  file,
}: MediaVerificationTabsProps) {
  const circulationMatches = analysis.circulation?.webMatches ?? [];
  const partialMatchingImages = analysis.circulation?.partialMatchingImages ?? [];
  const visuallySimilarImages = analysis.circulation?.visuallySimilarImages ?? [];
  const imageUrl = (file.sourceUrl || file.previewUrl || "").trim();

  return (
    <Tabs selectedKey={activeTab} onSelectionChange={(key) => onTabChange(String(key))}>
      <Tabs.List items={MEDIA_VERIFICATION_TABS} type="button-border" size="sm" className="grid grid-cols-4" />

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
        <ContextTab />
      </Tabs.Panel>

      <Tabs.Panel id="forensics" className="mt-6">
        <ForensicsTab />
      </Tabs.Panel>
    </Tabs>
  );
}
