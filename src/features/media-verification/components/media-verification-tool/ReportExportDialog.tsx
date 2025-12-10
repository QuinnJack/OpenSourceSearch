"use client";

import { useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";

import { Button } from "@/components/ui/buttons/button";
import { ButtonUtility } from "@/components/ui/buttons/button-utility";
import { Dialog, DialogTrigger, Modal, ModalOverlay } from "@/components/ui/modals/modal";
import { Toggle } from "@/components/ui/toggle/toggle";
import type { GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import type { GeolocationAnalysis } from "@/features/media-verification/api/geolocation";
import type { FactCheckState } from "@/features/media-verification/hooks/useFactCheckSearch";
import {
  DEFAULT_REPORT_OPTIONS,
  exportVerificationReport,
  type ReportExportOptions,
} from "@/features/media-verification/utils/report-export";
import type { AnalysisData } from "@/shared/types/analysis";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";

interface ReportExportDialogProps {
  file: MediaVerificationFile;
  analysis: AnalysisData;
  visionResult?: GoogleVisionWebDetectionResult;
  geolocationAnalysis?: GeolocationAnalysis;
  factCheckState: FactCheckState;
  isFactCheckEnabled?: boolean;
}

const buildDefaultOptions = (): ReportExportOptions => ({ ...DEFAULT_REPORT_OPTIONS });

export function ReportExportDialog({
  file,
  analysis,
  visionResult,
  geolocationAnalysis,
  factCheckState,
  isFactCheckEnabled = true,
}: ReportExportDialogProps) {
  const [options, setOptions] = useState<ReportExportOptions>(buildDefaultOptions);
  const [isExporting, setIsExporting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isFactCheckEnabled && options.includeValidity.factCheck) {
      setOptions((prev) => ({
        ...prev,
        includeValidity: { ...prev.includeValidity, factCheck: false },
      }));
    }
  }, [isFactCheckEnabled, options.includeValidity.factCheck]);

  const hasAnySectionSelected = useMemo(() => {
    const validity = options.includeValidity;
    const circulation = options.includeCirculation;
    const context = options.includeContext;
    return (
      options.includeOverview ||
      validity.aiDetection ||
      validity.metadata ||
      validity.factCheck ||
      validity.aiSynthesis ||
      circulation.webMatches ||
      circulation.visualMatches ||
      context.geolocation ||
      context.visionSummary ||
      context.mapRecommendations ||
      options.includeForensics
    );
  }, [options]);

  const applyPresetAll = () => {
    setOptions(buildDefaultOptions());
  };

  const applyPresetEssentials = () => {
    setOptions((prev) => ({
      ...prev,
      includeOverview: true,
      includePreviewImage: true,
      includeValidity: { aiDetection: true, metadata: true, factCheck: isFactCheckEnabled, aiSynthesis: false },
      includeCirculation: { webMatches: true, visualMatches: false },
      includeContext: { geolocation: true, visionSummary: true, mapRecommendations: true },
      includeForensics: false,
    }));
  };

  const toggleOption = (path: keyof ReportExportOptions | string, value: boolean) => {
    setOptions((prev) => {
      const next: ReportExportOptions = {
        ...prev,
        includeValidity: { ...prev.includeValidity },
        includeCirculation: { ...prev.includeCirculation },
        includeContext: { ...prev.includeContext },
      };

      switch (path) {
        case "includeOverview":
          next.includeOverview = value;
          break;
        case "includePreviewImage":
          next.includePreviewImage = value;
          break;
        case "validity.aiDetection":
          next.includeValidity.aiDetection = value;
          break;
        case "validity.metadata":
          next.includeValidity.metadata = value;
          break;
        case "validity.factCheck":
          next.includeValidity.factCheck = value;
          break;
        case "validity.aiSynthesis":
          next.includeValidity.aiSynthesis = value;
          break;
        case "circulation.webMatches":
          next.includeCirculation.webMatches = value;
          break;
        case "circulation.visualMatches":
          next.includeCirculation.visualMatches = value;
          break;
        case "context.geolocation":
          next.includeContext.geolocation = value;
          break;
        case "context.visionSummary":
          next.includeContext.visionSummary = value;
          break;
        case "context.mapRecommendations":
          next.includeContext.mapRecommendations = value;
          break;
        case "includeForensics":
          next.includeForensics = value;
          break;
        default:
          break;
      }

      return next;
    });
  };

  const handleExport = async (close: () => void) => {
    setIsExporting(true);
    setErrorMessage(null);
    try {
      await exportVerificationReport({
        file,
        analysis,
        visionResult,
        geolocationAnalysis,
        factCheckState,
        options,
      });
      close();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Export failed. Please try again.";
      setErrorMessage(message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DialogTrigger>
      <ButtonUtility tooltip="Export PDF" size="xs" color="secondary" icon={Download} />
      <ModalOverlay>
        <Modal>
          <Dialog className="mx-auto w-full max-w-2xl">
            {({ close }) => (
              <div className="space-y-5 rounded-2xl bg-primary p-5 text-secondary shadow-xl ring-1 ring-secondary/40">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-semibold">Export report</p>
                    <p className="text-xs text-tertiary">
                      Choose which tabs and cards to include in the PDF sent to stakeholders.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" color="tertiary" onClick={applyPresetEssentials}>
                      Essentials
                    </Button>
                    <Button size="sm" color="secondary" onClick={applyPresetAll}>
                      All tabs
                    </Button>
                  </div>
                </div>

                <div className="grid gap-4 rounded-xl border border-secondary/30 bg-secondary/5 p-4 md:grid-cols-2">
                  <section className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-secondary">Overview</p>
                      <p className="text-xs text-tertiary">File summary and preview.</p>
                    </div>
                    <Toggle
                      size="sm"
                      label="Include overview"
                      isSelected={options.includeOverview}
                      onChange={(isSelected) => toggleOption("includeOverview", Boolean(isSelected))}
                    />
                    <Toggle
                      size="sm"
                      label="Include preview image"
                      hint="Adds the uploaded image to the cover section."
                      isSelected={options.includePreviewImage}
                      onChange={(isSelected) => toggleOption("includePreviewImage", Boolean(isSelected))}
                    />
                  </section>

                  <section className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-secondary">Validity</p>
                      <p className="text-xs text-tertiary">Signals from AI detection, metadata, fact check.</p>
                    </div>
                    <Toggle
                      size="sm"
                      label="Automated detection"
                      isSelected={options.includeValidity.aiDetection}
                      onChange={(isSelected) => toggleOption("validity.aiDetection", Boolean(isSelected))}
                    />
                    <Toggle
                      size="sm"
                      label="Metadata"
                      isSelected={options.includeValidity.metadata}
                      onChange={(isSelected) => toggleOption("validity.metadata", Boolean(isSelected))}
                    />
                    <Toggle
                      size="sm"
                      label="Fact check results"
                      hint={isFactCheckEnabled ? undefined : "Disabled in settings"}
                      isDisabled={!isFactCheckEnabled}
                      isSelected={options.includeValidity.factCheck && isFactCheckEnabled}
                      onChange={(isSelected) => toggleOption("validity.factCheck", Boolean(isSelected) && isFactCheckEnabled)}
                    />
                    <Toggle
                      size="sm"
                      label="AI synthesis note"
                      isSelected={options.includeValidity.aiSynthesis}
                      onChange={(isSelected) => toggleOption("validity.aiSynthesis", Boolean(isSelected))}
                    />
                  </section>

                  <section className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-secondary">Circulation</p>
                      <p className="text-xs text-tertiary">Web matches and visually similar images.</p>
                    </div>
                    <Toggle
                      size="sm"
                      label="Web matches"
                      isSelected={options.includeCirculation.webMatches}
                      onChange={(isSelected) => toggleOption("circulation.webMatches", Boolean(isSelected))}
                    />
                    <Toggle
                      size="sm"
                      label="Visual matches"
                      isSelected={options.includeCirculation.visualMatches}
                      onChange={(isSelected) => toggleOption("circulation.visualMatches", Boolean(isSelected))}
                    />
                  </section>

                  <section className="space-y-3">
                    <div>
                      <p className="text-sm font-semibold text-secondary">Context</p>
                      <p className="text-xs text-tertiary">Geolocation, entities, map recommendations.</p>
                    </div>
                    <Toggle
                      size="sm"
                      label="Geolocation analysis"
                      isSelected={options.includeContext.geolocation}
                      onChange={(isSelected) => toggleOption("context.geolocation", Boolean(isSelected))}
                    />
                    <Toggle
                      size="sm"
                      label="Vision entities & best guesses"
                      isSelected={options.includeContext.visionSummary}
                      onChange={(isSelected) => toggleOption("context.visionSummary", Boolean(isSelected))}
                    />
                    <Toggle
                      size="sm"
                      label="Recommended maps"
                      hint="Top ArcGIS experiences based on detected context."
                      isSelected={options.includeContext.mapRecommendations}
                      onChange={(isSelected) => toggleOption("context.mapRecommendations", Boolean(isSelected))}
                    />
                  </section>

                  <section className="space-y-3 md:col-span-2">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-secondary">Extras</p>
                        <p className="text-xs text-tertiary">Optional sections to include.</p>
                      </div>
                      <Toggle
                        size="sm"
                        label="Forensics tool note"
                        isSelected={options.includeForensics}
                        onChange={(isSelected) => toggleOption("includeForensics", Boolean(isSelected))}
                      />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="flex flex-col gap-1 text-xs text-tertiary">
                        Report title
                        <input
                          type="text"
                          value={options.title ?? ""}
                          onChange={(event) =>
                            setOptions((prev) => ({ ...prev, title: event.target.value || DEFAULT_REPORT_OPTIONS.title }))
                          }
                          className="rounded-md border border-secondary/40 bg-primary px-3 py-2 text-sm text-secondary shadow-inner shadow-black/5 focus:border-secondary/60 focus:outline-none"
                          placeholder="Media Verification Report"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-xs text-tertiary">
                        File name
                        <input
                          type="text"
                          value={options.fileName ?? ""}
                          onChange={(event) =>
                            setOptions((prev) => ({ ...prev, fileName: event.target.value.trim() || undefined }))
                          }
                          className="rounded-md border border-secondary/40 bg-primary px-3 py-2 text-sm text-secondary shadow-inner shadow-black/5 focus:border-secondary/60 focus:outline-none"
                          placeholder="Optional custom file name"
                        />
                      </label>
                    </div>
                  </section>
                </div>

                {errorMessage ? <p className="text-xs text-utility-error-500">{errorMessage}</p> : null}

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-tertiary">
                    {hasAnySectionSelected
                      ? "Include at least one card to export a tailored PDF."
                      : "Select one or more cards to enable export."}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" color="tertiary" onClick={close}>
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      color="primary"
                      iconLeading={Download}
                      isDisabled={!hasAnySectionSelected || isExporting}
                      onClick={() => {
                        void handleExport(close);
                      }}
                    >
                      {isExporting ? "Exporting..." : "Export PDF"}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}

export default ReportExportDialog;


