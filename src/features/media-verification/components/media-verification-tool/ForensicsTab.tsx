import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";

import { AnalysisCardFrame } from "@/components/analysis";
import { ForensicsTool } from "./ForensicsTool";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";

interface ForensicsTabProps {
  file: MediaVerificationFile;
}

export function ForensicsTab({ file }: ForensicsTabProps) {
  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">Photo Forensics</CardTitle>
        <CardDescription className="text-xs">Powered by the Forensically toolkit from photo-forensics</CardDescription>
      </CardHeader>
      <CardContent className="p-0 -mt-6">
        <ForensicsTool file={file} />
      </CardContent>
    </AnalysisCardFrame>
  );
}
