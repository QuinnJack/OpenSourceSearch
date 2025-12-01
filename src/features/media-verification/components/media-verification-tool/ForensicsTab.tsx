import { AnalysisCardFrame } from "@/components/analysis";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";

import type { MediaVerificationFile } from "./MediaVerificationTool.types";
import { ForensicsTool } from "./ForensicsTool";

import { useCallback, useState } from "react";

interface ForensicsTabProps {
  file: MediaVerificationFile;
  previewHost?: HTMLElement | null;
  isActive?: boolean;
}

export function ForensicsTab({ file, previewHost, isActive }: ForensicsTabProps) {
  const [toolboxHost, setToolboxHost] = useState<HTMLDivElement | null>(null);
  const handleToolboxHostRef = useCallback((element: HTMLDivElement | null) => {
    setToolboxHost(element);
  }, []);

  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">Photo Forensics</CardTitle>
        <CardDescription className="text-xs">Powered by the Forensically toolkit from photo-forensics</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div ref={handleToolboxHostRef} className="min-h-[400px]">
          <ForensicsTool file={file} previewHost={previewHost} toolboxHost={toolboxHost} isActive={isActive} />
        </div>
      </CardContent>
    </AnalysisCardFrame>
  );
}
