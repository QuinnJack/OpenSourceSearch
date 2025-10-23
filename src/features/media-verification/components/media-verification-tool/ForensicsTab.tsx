import { AnalysisCardFrame } from "@/components/analysis";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";

export function ForensicsTab() {
  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">Forensic Analysis</CardTitle>
        <CardDescription className="text-xs">Advanced image forensics and verification</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <p className="text-sm text-tertiary">Forensics data will be displayed here...</p>
      </CardContent>
    </AnalysisCardFrame>
  );
}
