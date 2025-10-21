import { AnalysisCardFrame } from "@/components/analysis";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";

export function ContextTab() {
  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">Context & Geolocation</CardTitle>
        <CardDescription className="text-xs">Location and visual context analysis</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <p className="text-sm text-tertiary">Context data will be displayed here...</p>
      </CardContent>
    </AnalysisCardFrame>
  );
}
