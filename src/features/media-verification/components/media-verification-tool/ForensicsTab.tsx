import { CardContent, CardHeader, CardTitle } from "@/components/ui/card/card";
import { AnalysisCardFrame } from "@/components/analysis";
import { ForensicsTool } from "./ForensicsTool";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";
import { cx } from "@/utils/cx";

interface ForensicsTabProps {
  file: MediaVerificationFile;
  isActive: boolean;
}

export function ForensicsTab({ file, isActive }: ForensicsTabProps) {
  return (
    <AnalysisCardFrame className={cx("flex flex-col h-full", isActive ? undefined : "hidden")}>
      <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm">Photo Forensics</CardTitle>
      </CardHeader>
      <CardContent className="p-0 -mt-6 flex-1 relative min-h-0">
        <ForensicsTool file={file} isActive={isActive} />
      </CardContent>
    </AnalysisCardFrame>
  );
}
