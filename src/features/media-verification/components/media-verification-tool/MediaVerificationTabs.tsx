import { useEffect, useMemo, useRef, useState } from "react";

import { AnalysisCardFrame, FoundOnWebsitesCard, VisuallySimilarImagesCard } from "@/components/analysis";
import {
  AiDetectionCard,
  AiSynthesisCard,
  FactCheckCard,
  MetadataExifCard,
} from "@/components/analysis/validity";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { Tabs } from "@/components/ui/tabs/tabs";
import type { AnalysisData } from "@/shared/types/analysis";
import { isApiEnabled } from "@/shared/config/api-toggles";

import { MEDIA_VERIFICATION_TABS } from "@/features/media-verification/constants/tabItems";
import { imageFactCheckSearch, type FactCheckClaim } from "@/features/media-verification/api/fact-check";
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
  const partialMatchingImages = analysis.circulation?.partialMatchingImages ?? [];
  const visuallySimilarImages = analysis.circulation?.visuallySimilarImages ?? [];
  const imageUrl = useMemo(() => (file.sourceUrl || file.previewUrl || "").trim(), [file.previewUrl, file.sourceUrl]);

  const [factCheckClaims, setFactCheckClaims] = useState<FactCheckClaim[]>([]);
  const [factCheckLoading, setFactCheckLoading] = useState(false);
  const [factCheckError, setFactCheckError] = useState<string | null>(null);
  const [factCheckHasSearched, setFactCheckHasSearched] = useState(false);
  const factCheckAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (factCheckAbortControllerRef.current) {
      factCheckAbortControllerRef.current.abort();
      factCheckAbortControllerRef.current = null;
    }

    setFactCheckClaims([]);
    setFactCheckError(null);
    setFactCheckHasSearched(false);
    setFactCheckLoading(false);

    if (!isApiEnabled("google_images")) {
      setFactCheckError("Google Images fact check is disabled.");
      setFactCheckHasSearched(true);
      return;
    }

    const trimmedUrl = imageUrl;
    if (!trimmedUrl) {
      setFactCheckError("Enter a publicly accessible image URL to run a fact check.");
      setFactCheckHasSearched(true);
      return;
    }

    if (trimmedUrl.startsWith("blob:")) {
      setFactCheckError("The fact check API requires an image URL that is publicly reachable on the internet.");
      setFactCheckHasSearched(true);
      return;
    }

    const controller = new AbortController();
    factCheckAbortControllerRef.current = controller;

    setFactCheckLoading(true);
    setFactCheckHasSearched(true);

    const run = async () => {
      try {
        const response = await imageFactCheckSearch(trimmedUrl, {
          signal: controller.signal,
          languageCode: "en-US",
        });
        setFactCheckClaims(response.claims);
        if (!response.claims.length) {
          setFactCheckError("No fact check records were found for this image.");
        } else {
          setFactCheckError(null);
        }
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") {
          return;
        }
        const message =
          caught instanceof Error ? caught.message : "An unexpected error occurred while running the fact check.";
        setFactCheckError(message);
        setFactCheckClaims([]);
      } finally {
        if (!controller.signal.aborted) {
          setFactCheckLoading(false);
        }
        if (factCheckAbortControllerRef.current === controller) {
          factCheckAbortControllerRef.current = null;
        }
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [imageUrl]);

  return (
    <Tabs selectedKey={activeTab} onSelectionChange={(key) => onTabChange(String(key))}>
      <Tabs.List items={MEDIA_VERIFICATION_TABS} type="button-border" size="sm" className="grid grid-cols-4" />

      <Tabs.Panel id="validity" className="mt-6 space-y-4">
        <AiDetectionCard data={analysis.aiDetection} />
        <MetadataExifCard data={analysis.metadata} />
        <FactCheckCard
          claims={factCheckClaims}
          loading={factCheckLoading}
          error={factCheckError}
          hasSearched={factCheckHasSearched}
        />
        <AiSynthesisCard data={analysis.synthesis} />
      </Tabs.Panel>

      <Tabs.Panel id="circulation" className="mt-6 space-y-4">
        <FoundOnWebsitesCard matches={circulationMatches} loading={Boolean(file.visionLoading)} />
        <VisuallySimilarImagesCard
          partialMatches={partialMatchingImages}
          visuallySimilarImages={visuallySimilarImages}
          loading={Boolean(file.visionLoading)}
          fallbackImageUrl={file.previewUrl || file.sourceUrl}
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
