import { useState } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card/card";
import { AnalysisCardFrame } from "@/components/analysis";
import { ForensicsTool } from "./ForensicsTool";
import { VanishingPointsTool } from "./VanishingPointsTool";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";
import { cx } from "@/utils/cx";

interface ForensicsTabProps {
  file: MediaVerificationFile;
  isActive: boolean;
}

export function ForensicsTab({ file, isActive }: ForensicsTabProps) {
  const [activeTool, setActiveTool] = useState<"forensics" | "vanishing-points">("forensics");

  return (
    <AnalysisCardFrame className={cx("flex flex-col h-full", isActive ? undefined : "hidden")}>
      <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Photo Forensics</CardTitle>
        <div className="flex gap-2">
          <ToolButton
            label="General"
            isActive={activeTool === "forensics"}
            onClick={() => setActiveTool("forensics")}
          />
          <ToolButton
            label="Vanishing Points"
            isActive={activeTool === "vanishing-points"}
            onClick={() => setActiveTool("vanishing-points")}
          />
        </div>
      </CardHeader>
      <CardContent className="p-0 -mt-6 flex-1 relative min-h-0">
        <div className={cx("w-full h-full", activeTool === "forensics" ? "block" : "hidden")}>
          <ForensicsTool file={file} isActive={isActive && activeTool === "forensics"} />
        </div>
        <div className={cx("w-full h-full", activeTool === "vanishing-points" ? "block" : "hidden")}>
          <VanishingPointsTool file={file} isActive={isActive && activeTool === "vanishing-points"} />
        </div>
      </CardContent>
    </AnalysisCardFrame>
  );
}

function ToolButton({ label, isActive, onClick }: { label: string; isActive: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "px-3 py-1 text-xs rounded-full border transition-colors",
        isActive
          ? "bg-brand-600 border-brand-600 text-white"
          : "bg-transparent border-gray-600 text-gray-400 hover:text-gray-200"
      )}
    >
      {label}
    </button>
  );
}
