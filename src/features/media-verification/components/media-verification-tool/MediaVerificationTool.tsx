"use client";

import { useState } from "react";

import { DEFAULT_ANALYSIS_DATA } from "@/features/media-verification/constants/defaultAnalysisData";
import { MediaVerificationHeader } from "./MediaVerificationHeader";
import { MediaVerificationPreview } from "./MediaVerificationPreview";
import { MediaVerificationTabs } from "./MediaVerificationTabs";
import type { MediaVerificationProps } from "./MediaVerificationTool.types";

export function MediaVerificationTool({
  file,
  onBack,
  data,
  headerActions,
  geolocationEnabled,
  geolocationAvailable,
}: MediaVerificationProps) {
  const [activeTab, setActiveTab] = useState<string>("validity");
  const analysis = data ?? DEFAULT_ANALYSIS_DATA;

  return (
    <div className="min-h-screen bg-primary">
      <MediaVerificationHeader onBack={onBack} headerActions={headerActions} />

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <MediaVerificationPreview file={file} />

          <MediaVerificationTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            analysis={analysis}
            file={file}
            geolocationEnabled={geolocationEnabled}
            geolocationAvailable={geolocationAvailable}
          />
        </div>
      </div>
    </div>
  );
}

export default MediaVerificationTool;
