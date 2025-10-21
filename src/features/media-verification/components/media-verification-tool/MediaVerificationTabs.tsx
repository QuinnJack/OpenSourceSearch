import { AnalysisCardFrame, FoundOnWebsitesCard } from "@/components/analysis";
import {
  AiDetectionCard,
  AiSynthesisCard,
  FactCheckCard,
  MetadataExifCard,
} from "@/components/analysis/validity";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { Tabs } from "@/components/ui/tabs/tabs";
import type { AnalysisData } from "@/shared/types/analysis";

import { MEDIA_VERIFICATION_TABS } from "@/features/media-verification/constants/tabItems";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";

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

  return (
    <Tabs selectedKey={activeTab} onSelectionChange={(key) => onTabChange(String(key))}>
      <Tabs.List items={MEDIA_VERIFICATION_TABS} type="button-border" size="sm" className="grid grid-cols-4" />

      <Tabs.Panel id="validity" className="mt-6 space-y-4">
        <AiDetectionCard data={analysis.aiDetection} />
        <MetadataExifCard data={analysis.metadata} />
        <FactCheckCard initialImageUrl={file.sourceUrl || file.previewUrl} />
        <AiSynthesisCard data={analysis.synthesis} />
      </Tabs.Panel>

      <Tabs.Panel id="circulation" className="mt-6 space-y-4">
        <FoundOnWebsitesCard matches={circulationMatches} loading={Boolean(file.visionLoading)} />

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
      </Tabs.Panel>

      <Tabs.Panel id="context" className="mt-6">
        <AnalysisCardFrame>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">Context & Geolocation</CardTitle>
            <CardDescription className="text-xs">Location and visual context analysis</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-tertiary">Context data will be displayed here...</p>
          </CardContent>
        </AnalysisCardFrame>
      </Tabs.Panel>

      <Tabs.Panel id="forensics" className="mt-6">
        <AnalysisCardFrame>
          <CardHeader className="pb-0">
            <CardTitle className="text-sm">Forensic Analysis</CardTitle>
            <CardDescription className="text-xs">Advanced image forensics and verification</CardDescription>
          </CardHeader>
          <CardContent className="pt-4">
            <p className="text-sm text-tertiary">Forensics data will be displayed here...</p>
          </CardContent>
        </AnalysisCardFrame>
      </Tabs.Panel>
    </Tabs>
  );
}
