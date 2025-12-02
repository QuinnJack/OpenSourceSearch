"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";

import { DEFAULT_ANALYSIS_DATA } from "@/features/media-verification/constants/defaultAnalysisData";
import { MediaVerificationHeader } from "./MediaVerificationHeader";
import { MediaVerificationPreview } from "./MediaVerificationPreview";
import { MediaVerificationTabs } from "./MediaVerificationTabs";
import type { MediaVerificationProps } from "./MediaVerificationTool.types";

export function MediaVerificationTool({
  file,
  onBack,
  data,
  headerActions,
  geolocationEnabled,
  geolocationAvailable,
}: MediaVerificationProps) {
  const [activeTab, setActiveTab] = useState<string>("validity");
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isDesktop, setIsDesktop] = useState<boolean>(() => (typeof window !== "undefined" ? window.innerWidth >= 1024 : false));
  const [fullWidthPanel, setFullWidthPanel] = useState<"preview" | "tabs" | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const analysis = data ?? DEFAULT_ANALYSIS_DATA;
  const FULL_WIDTH_THRESHOLD = 80;
  const EXIT_FULL_WIDTH_THRESHOLD = 79;
  const layoutResizeKey = `${isDesktop ? "desktop" : "mobile"}-${fullWidthPanel ?? "split"}-${Math.round(splitPercent * 100)}`;

  const clampSplit = useCallback((value: number) => Math.min(100, Math.max(0, value)), []);

  const updateSplit = useCallback(
    (clientX: number) => {
      if (!containerRef.current) {
        return;
      }
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width === 0) {
        return;
      }
      const relativeX = clientX - rect.left;
      const percent = (relativeX / rect.width) * 100;
      setSplitPercent(clampSplit(percent));
    },
    [clampSplit],
  );

  useEffect(() => {
    const handleResize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  useEffect(() => {
    if (!isDesktop) {
      setFullWidthPanel(null);
    }
  }, [isDesktop]);

  useEffect(() => {
    if (fullWidthPanel === "preview") {
      if (splitPercent <= EXIT_FULL_WIDTH_THRESHOLD) {
        setFullWidthPanel(null);
      }
      return;
    }
    if (fullWidthPanel === "tabs") {
      if (100 - splitPercent <= EXIT_FULL_WIDTH_THRESHOLD) {
        setFullWidthPanel(null);
      }
      return;
    }
    if (!fullWidthPanel) {
      if (splitPercent >= FULL_WIDTH_THRESHOLD) {
        setFullWidthPanel("preview");
      } else if (100 - splitPercent >= FULL_WIDTH_THRESHOLD) {
        setFullWidthPanel("tabs");
      }
    }
  }, [splitPercent, fullWidthPanel]);

  useEffect(() => {
    if (!isDragging) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      updateSplit(event.clientX);
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches[0]) {
        updateSplit(event.touches[0].clientX);
      }
      event.preventDefault();
    };

    const stopDragging = () => {
      setIsDragging(false);
    };

    const previousUserSelect = document.body.style.userSelect;
    const previousCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopDragging);
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", stopDragging);
    window.addEventListener("touchcancel", stopDragging);

    return () => {
      document.body.style.userSelect = previousUserSelect;
      document.body.style.cursor = previousCursor;
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopDragging);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", stopDragging);
      window.removeEventListener("touchcancel", stopDragging);
    };
  }, [isDragging, updateSplit]);

  const previewWidth = fullWidthPanel === "preview" ? 100 : splitPercent;
  const tabsWidth = fullWidthPanel === "tabs" ? 100 : 100 - splitPercent;
  const previewStyle = isDesktop
    ? {
        flexBasis: `${previewWidth}%`,
        maxWidth: `${previewWidth}%`,
        display: fullWidthPanel === "tabs" ? "none" : undefined,
      }
    : undefined;
  const tabsStyle = isDesktop
    ? {
        flexBasis: `${tabsWidth}%`,
        maxWidth: `${tabsWidth}%`,
        display: fullWidthPanel === "preview" ? "none" : undefined,
      }
    : undefined;

  const handleMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (!isDesktop) {
      return;
    }
    event.preventDefault();
    setIsDragging(true);
  };

  const handleTouchStart = (event: ReactTouchEvent<HTMLDivElement>) => {
    if (!isDesktop) {
      return;
    }
    event.preventDefault();
    if (event.touches[0]) {
      updateSplit(event.touches[0].clientX);
    }
    setIsDragging(true);
  };

  return (
    <div className="min-h-screen bg-primary">
      <MediaVerificationHeader onBack={onBack} headerActions={headerActions} />

      <div className="mx-auto max-w-6xl px-6 py-6">
        <div ref={containerRef} className="flex flex-col gap-6 lg:flex-row lg:gap-6">
          <div className="relative w-full" style={previewStyle}>
            <MediaVerificationPreview file={file} />
            {isDesktop && fullWidthPanel !== "tabs" && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize preview width"
                className={`absolute inset-y-0 right-0 w-2 cursor-col-resize touch-none ${
                  isDragging ? "bg-secondary/20" : "bg-transparent"
                }`}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
              />
            )}
          </div>

          <div className="relative w-full" style={tabsStyle}>
            <MediaVerificationTabs
              activeTab={activeTab}
              onTabChange={setActiveTab}
              analysis={analysis}
              file={file}
              geolocationEnabled={geolocationEnabled}
              geolocationAvailable={geolocationAvailable}
              layoutResizeKey={layoutResizeKey}
            />
            {isDesktop && fullWidthPanel !== "preview" && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize analysis panels"
                className={`absolute inset-y-0 left-0 w-2 cursor-col-resize touch-none ${
                  isDragging ? "bg-secondary/20" : "bg-transparent"
                }`}
                onMouseDown={handleMouseDown}
                onTouchStart={handleTouchStart}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default MediaVerificationTool;
