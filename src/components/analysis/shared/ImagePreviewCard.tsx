"use client";

import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/base/card/card";
import { InfoCircle, SearchRefraction } from "@untitledui/icons";
import AnalysisCardFrame from "@/components/analysis/shared/AnalysisCardFrame";

export interface ImagePreviewCardProps {
  name: string;
  sizeReadable: string;
  previewUrl?: string;
  uploadedInfo?: string; // e.g., "Uploaded 2 minutes ago"
}

export function ImagePreviewCard({ name, sizeReadable, previewUrl, uploadedInfo }: ImagePreviewCardProps) {
  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">Uploaded Image</CardTitle>
        <CardDescription className="text-xs">{name}</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div className="aspect-video w-full overflow-hidden rounded-lg bg-secondary_alt">
          {previewUrl ? (
            <img src={previewUrl} alt={name} className="h-full w-full object-contain" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-tertiary">
              <SearchRefraction className="size-5" />
            </div>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs text-tertiary">
          <InfoCircle className="size-4" />
          <span>{uploadedInfo ?? "Uploaded —"} • {sizeReadable} • —</span>
        </div>
      </CardContent>
    </AnalysisCardFrame>
  );
}

export default ImagePreviewCard;
