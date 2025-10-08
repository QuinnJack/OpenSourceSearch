"use client";

import { AiDetectionCard, AiSynthesisCard, MetadataExifCard } from "@/components/analysis/validity";
import { AnalysisCardFrame, ImagePreviewCard } from "@/components/analysis";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/base/card/card";
import { FlipBackward, Scan } from "@untitledui/icons";

import type { AnalysisData } from "@/types/analysis";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Tabs } from "@/components/application/tabs/tabs";
import { getReadableFileSize } from "@/components/application/file-upload/file-upload-base";
import { useState } from "react";

interface MediaVerificationProps {
  file: {
    name: string;
    size: number;
    previewUrl?: string;
  };
  onBack: () => void;
  data?: AnalysisData;
}

export function MediaVerificationTool({ file, onBack, data }: MediaVerificationProps) {
  const [activeTab, setActiveTab] = useState<string>("validity");

  const analysis: AnalysisData =
    data ?? {
      aiDetection: {
        status: "warning",
        label: "Real but Edited",
        confidence: 78,
        details: "Image shows signs of digital manipulation in specific regions",
      },
      metadata: {
        status: "error",
        exifStripped: true,
        gpsData: false,
        details: "EXIF metadata has been removed or stripped from this image",
      },
      synthesis: {
        status: "info",
        origin: "Unknown",
        details: "Unable to determine original source or creation method",
      },
    };

  const tabItems = [
    { id: "validity", children: "Validity" },
    { id: "circulation", children: "Circulation" },
    { id: "context", children: "Context" },
    { id: "forensics", children: "Forensics" },
  ];

  const headerIconClass = "size-5 text-primary";

  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="border-b border-secondary bg-primary">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-active">
                <Scan className={headerIconClass} />
              </div>
              <div>
                <h1 className="text-base font-semibold text-secondary">Media Verification Tool</h1>
                <p className="text-xs text-tertiary mr-7">AI-Assisted Image Analysis</p>
              </div>
            </div>

            <div className="flex items-center">
              <ButtonUtility
                color="secondary"
                tooltip="Back"
                icon={FlipBackward}
                size="xs"
                className="mt-0 mr-2 self-start"
                onClick={onBack}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Left: Image Preview */}
          <div className="space-y-4">
            <ImagePreviewCard
              name={file.name}
              sizeReadable={getReadableFileSize(file.size)}
              previewUrl={file.previewUrl}
              uploadedInfo="Uploaded 2 minutes ago"
            />
          </div>

          {/* Right: Analysis Tabs */}
          <div>
            <Tabs selectedKey={activeTab} onSelectionChange={(key) => setActiveTab(String(key))}>
              <Tabs.List
                items={tabItems}
                type="button-border"
                size="sm"
                className="grid w-full grid-cols-4"
              />

              {/* Validity Tab */}
              <Tabs.Panel id="validity" className="mt-6 space-y-4">
                <AiDetectionCard data={analysis.aiDetection} />
                <MetadataExifCard data={analysis.metadata} />
                <AiSynthesisCard data={analysis.synthesis} />
              </Tabs.Panel>

              {/* Circulation Tab */}
              <Tabs.Panel id="circulation" className="mt-6">
                <AnalysisCardFrame>
                  <CardHeader className="pb-0">
                    <CardTitle className="text-sm">Circulation Analysis</CardTitle>
                    <CardDescription className="text-xs">Track where this image has appeared online</CardDescription>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm text-tertiary">Circulation data will be displayed here...</p>
                  </CardContent>
                </AnalysisCardFrame>
              </Tabs.Panel>

              {/* Context Tab */}
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

              {/* Forensics Tab */}
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
          </div>
        </div>
      </div>
    </div >
  );
}

export default MediaVerificationTool;
