import { ImagePreviewCard } from "@/components/analysis";
import { getReadableFileSize } from "@/features/uploads/utils/getReadableFileSize";

import type { MediaVerificationFile } from "./MediaVerificationTool.types";

interface MediaVerificationPreviewProps {
  file: MediaVerificationFile;
}

export function MediaVerificationPreview({ file }: MediaVerificationPreviewProps) {
  return (
    <div className="space-y-4">
      <ImagePreviewCard
        name={file.name}
        sizeReadable={getReadableFileSize(file.size)}
        previewUrl={file.previewUrl}
        uploadedInfo="Uploaded 2 minutes ago"
      />
    </div>
  );
}
