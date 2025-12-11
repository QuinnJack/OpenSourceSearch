import { CardContent, CardHeader, CardTitle } from "@/components/ui/card/card";

import { AnalysisCardFrame } from "@/components/analysis";
import { ForensicsTool } from "./ForensicsTool";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";

interface ForensicsTabProps {
  file: MediaVerificationFile;
  isActive: boolean;
}

export function ForensicsTab({ file, isActive }: ForensicsTabProps) {
  return (
    <AnalysisCardFrame className={isActive ? undefined : "hidden"}>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">Photo Forensics</CardTitle>
      </CardHeader>
      <CardContent className="p-0 -mt-6">
        <ForensicsTool file={file} isActive={isActive} />
      </CardContent>
    </AnalysisCardFrame>
  );
}
