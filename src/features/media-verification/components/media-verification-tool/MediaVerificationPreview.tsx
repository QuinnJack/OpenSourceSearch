import { useEffect, useMemo, useState } from "react";

import { AnalysisCardFrame } from "@/components/analysis";
import { Button } from "@/components/ui/buttons/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card/card";
import { getReadableFileSize } from "@/features/uploads/utils/getReadableFileSize";
import { cx } from "@/utils/cx";
import { ArrowLeft, ArrowRight, InfoCircle, SearchRefraction } from "@untitledui/icons";

import type { MediaFrameSummary, MediaVerificationFile } from "./MediaVerificationTool.types";

const formatTimestampLabel = (timestampMs?: number): string | undefined => {
  if (typeof timestampMs !== "number" || Number.isNaN(timestampMs)) {
    return undefined;
  }
  if (timestampMs < 1000) {
    return `${(timestampMs / 1000).toFixed(2)}s`;
  }
  if (timestampMs < 10_000) {
    return `${(timestampMs / 1000).toFixed(1)}s`;
  }
  return `${Math.round(timestampMs / 1000)}s`;
};

const formatDuration = (durationMs?: number): string | undefined => {
  if (typeof durationMs !== "number" || durationMs <= 0 || Number.isNaN(durationMs)) {
    return undefined;
  }
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
};

const buildFrameLabel = (frame: MediaFrameSummary | undefined, index: number): string => {
  if (frame?.label) {
    return frame.label;
  }
  return `Frame ${index + 1}`;
};

interface MediaVerificationPreviewProps {
  file: MediaVerificationFile;
  frames?: MediaFrameSummary[];
  activeFrameIndex?: number;
  onFrameChange?: (index: number) => void;
  videoPreviewUrl?: string;
  videoDurationMs?: number;
}

export function MediaVerificationPreview({
  file,
  frames,
  activeFrameIndex = 0,
  onFrameChange,
  videoPreviewUrl,
  videoDurationMs,
}: MediaVerificationPreviewProps) {
  const [previewMode, setPreviewMode] = useState<"frame" | "video">("frame");
  const [focusedFrameIndex, setFocusedFrameIndex] = useState<number>(activeFrameIndex);

  useEffect(() => {
    setFocusedFrameIndex(activeFrameIndex);
  }, [activeFrameIndex]);

  useEffect(() => {
    if (!videoPreviewUrl && previewMode === "video") {
      setPreviewMode("frame");
    }
  }, [previewMode, videoPreviewUrl]);

  const hasVideoView = Boolean(videoPreviewUrl);
  const frameList = frames ?? [];
  const totalViews = (hasVideoView ? 1 : 0) + frameList.length;
  const currentPointer = previewMode === "video" && hasVideoView ? 0 : hasVideoView ? focusedFrameIndex + 1 : focusedFrameIndex;
  const canStepBackward = currentPointer > 0;
  const canStepForward = currentPointer < totalViews - 1;

  const handleSelectVideo = () => {
    if (!hasVideoView) {
      return;
    }
    setPreviewMode("video");
  };

  const handleSelectFrame = (index: number) => {
    setPreviewMode("frame");
    setFocusedFrameIndex(index);
    if (index !== activeFrameIndex) {
      onFrameChange?.(index);
    }
  };

  const handleStep = (direction: -1 | 1) => {
    if (totalViews <= 1) {
      return;
    }
    const nextPointer = Math.min(totalViews - 1, Math.max(0, currentPointer + direction));
    if (nextPointer === currentPointer) {
      return;
    }
    if (hasVideoView && nextPointer === 0) {
      handleSelectVideo();
    } else {
      const frameIndex = hasVideoView ? nextPointer - 1 : nextPointer;
      handleSelectFrame(frameIndex);
    }
  };

  const activeFrame = frameList[focusedFrameIndex];
  const frameTimestamp =
    previewMode === "frame" ? formatTimestampLabel(activeFrame?.timestampMs ?? file.frameTimestampMs) : undefined;
  const defaultFrameLabel = frameList.length > 0 ? buildFrameLabel(activeFrame, focusedFrameIndex) : "Image";
  const frameLabel =
    previewMode === "frame"
      ? activeFrame?.label ?? file.frameLabel ?? defaultFrameLabel
      : undefined;
  const durationLabel = formatDuration(videoDurationMs);
  const videoLabel = hasVideoView ? `Video${durationLabel ? ` · ${durationLabel}` : ""}` : undefined;

  const viewButtons = useMemo(() => {
    const buttons: Array<{ key: string; label: string; isActive: boolean; onClick: () => void }>
      = [];
    if (hasVideoView && videoLabel) {
      buttons.push({
        key: "video",
        label: videoLabel,
        isActive: previewMode === "video",
        onClick: handleSelectVideo,
      });
    }
    frameList.forEach((frame, index) => {
      buttons.push({
        key: frame.id || `frame-${index}`,
        label: buildFrameLabel(frame, index),
        isActive: previewMode === "frame" && focusedFrameIndex === index,
        onClick: () => handleSelectFrame(index),
      });
    });
    return buttons;
  }, [focusedFrameIndex, frameList, hasVideoView, previewMode, videoLabel, handleSelectFrame, handleSelectVideo]);

  const previewContent = () => {
    if (previewMode === "video" && videoPreviewUrl) {
      return (
        <video
          controls
          playsInline
          className="max-h-full w-full object-contain"
          src={videoPreviewUrl}
        />
      );
    }
    if (file.previewUrl) {
      return <img src={file.previewUrl} alt={file.name} className="max-h-full w-full object-contain" data-default-preview="true" />;
    }
    return (
      <div className="flex h-full w-full items-center justify-center text-tertiary">
        <SearchRefraction className="size-5" />
      </div>
    );
  };

  return (
    <AnalysisCardFrame>
      <CardHeader className="pb-0">
        <CardTitle className="text-sm">Uploaded Media</CardTitle>
        <CardDescription className="text-xs">{file.name}</CardDescription>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          className="relative flex w-full min-h-[320px] items-center justify-center overflow-hidden rounded-md bg-secondary_alt md:min-h-[440px]"
          data-forensics-preview-region={previewMode === "frame" ? "true" : undefined}
        >
          {previewContent()}
        </div>

        {totalViews > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {viewButtons.map((button) => (
                <button
                  key={button.key}
                  type="button"
                  className={cx(
                    "rounded-full border px-3 py-1 text-xs transition duration-150 ease-linear",
                    button.isActive
                      ? "border-brand bg-brand text-white"
                      : "border-secondary text-secondary hover:border-brand hover:text-brand",
                  )}
                  onClick={button.onClick}
                >
                  {button.label}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <Button
                aria-label="View previous media"
                iconLeading={ArrowLeft}
                color="secondary"
                size="sm"
                isDisabled={!canStepBackward}
                onClick={() => handleStep(-1)}
              />
              <Button
                aria-label="View next media"
                iconTrailing={ArrowRight}
                color="secondary"
                size="sm"
                isDisabled={!canStepForward}
                onClick={() => handleStep(1)}
              />
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-tertiary">
          <div className="flex items-center gap-2">
            <InfoCircle className="size-4" />
            <span>Uploaded — • {getReadableFileSize(file.size)}</span>
          </div>
          <div className="text-right text-secondary">
            {previewMode === "video" && videoLabel}
            {previewMode === "frame" && (
              <span>
                {frameLabel}
                {frameTimestamp ? ` • ${frameTimestamp}` : ""}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </AnalysisCardFrame>
  );
}
