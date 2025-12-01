"use client";

import { useState } from "react";

import { DEFAULT_ANALYSIS_DATA } from "@/features/media-verification/constants/defaultAnalysisData";
import { MediaVerificationHeader } from "./MediaVerificationHeader";
import { MediaVerificationPreview } from "./MediaVerificationPreview";
import { MediaVerificationTabs } from "./MediaVerificationTabs";
import type { MediaVerificationProps } from "./MediaVerificationTool.types";

export function MediaVerificationTool({ file, onBack, data, headerActions }: MediaVerificationProps) {
  const [activeTab, setActiveTab] = useState<string>("validity");
  const [forensicsHost, setForensicsHost] = useState<HTMLDivElement | null>(null);
  const analysis = data ?? DEFAULT_ANALYSIS_DATA;

  return (
    <div className="min-h-screen bg-primary">
      <MediaVerificationHeader onBack={onBack} headerActions={headerActions} />

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div className="grid gap-6 lg:grid-cols-2">
          <MediaVerificationPreview
            file={file}
            onForensicsHostReady={setForensicsHost}
          />

          <MediaVerificationTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            analysis={analysis}
            file={file}
            forensicsHost={forensicsHost}
            activeForensicsTab={activeTab === "forensics"}
          />
        </div>
      </div>
    </div>
  );
}

export default MediaVerificationTool;
