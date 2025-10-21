
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { ThemeProvider } from "@/app/providers/theme-provider";
import { MediaVerificationTool } from "@/features/media-verification/components/media-verification-tool/MediaVerificationTool";
import { DEFAULT_ANALYSIS_DATA } from "@/features/media-verification/constants/defaultAnalysisData";
import { fetchVisionWebDetection } from "@/features/media-verification/api/google-vision";
import { FileUploader, type UploadedFile } from "@/features/uploads/components/file-upload/file-uploader";
import Examples from "@/features/uploads/components/Examples";
import { ThemeToggle } from "@/components/ui/theme/ThemeToggle";
import type { AnalysisData, CirculationWebMatch } from "@/shared/types/analysis";
import { Button } from "@/components/ui/buttons/button";
import { ButtonUtility } from "@/components/ui/buttons/button-utility";
import {
  Dialog,
  DialogTrigger,
  Modal,
  ModalOverlay,
} from "@/components/ui/modals/modal";
import {
  Input as AriaInput,
  Label,
  Text as AriaText,
  TextField,
} from "react-aria-components";
import { Toggle } from "@/components/ui/toggle/toggle";
import { Settings01, XClose } from "@untitledui/icons";
import {
  isApiEnabled,
  setApiToggleOverride,
} from "@/shared/config/api-toggles";

interface SettingsContentProps {
  enableSightengine: boolean;
  enableGoogleImages: boolean;
  enableGoogleVision: boolean;
  onToggleSightengine: (isEnabled: boolean) => void;
  onToggleGoogleImages: (isEnabled: boolean) => void;
  onToggleGoogleVision: (isEnabled: boolean) => void;
}

const SettingsContent = ({
  enableSightengine,
  enableGoogleImages,
  enableGoogleVision,
  onToggleSightengine,
  onToggleGoogleImages,
  onToggleGoogleVision,
}: SettingsContentProps) => (
  <div className="w-full rounded-xl bg-primary p-4 shadow-lg ring-1 ring-secondary">
    <div className="mb-3 flex items-start justify-between gap-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold text-secondary">Settings</h2>
        <p className="text-xs text-tertiary">
          Control which verification APIs are available in this workspace.
        </p>
      </div>

      <Button
        slot="close"
        aria-label="Close settings"
        color="tertiary"
        size="sm"
        iconLeading={XClose}
      />
    </div>

    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-secondary">
            Enable Sightengine
          </p>
          <p className="text-xs text-tertiary">
            Toggle the Sightengine AI detection API.
          </p>
        </div>
        <Toggle
          aria-label="Toggle Sightengine API"
          size="sm"
          isSelected={enableSightengine}
          onChange={(isSelected) => onToggleSightengine(Boolean(isSelected))}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-secondary">
            Enable Google Images
          </p>
          <p className="text-xs text-tertiary">
            Toggle Google Images fact-check search.
          </p>
        </div>
        <Toggle
          aria-label="Toggle Google Images API"
          size="sm"
          isSelected={enableGoogleImages}
          onChange={(isSelected) => onToggleGoogleImages(Boolean(isSelected))}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-secondary">
            Enable Google Vision
          </p>
          <p className="text-xs text-tertiary">
            Toggle Google Cloud Vision web detection for circulation insights.
          </p>
        </div>
        <Toggle
          aria-label="Toggle Google Vision API"
          size="sm"
          isSelected={enableGoogleVision}
          onChange={(isSelected) => onToggleGoogleVision(Boolean(isSelected))}
        />
      </div>
    </div>
  </div>
);

const deriveFileNameFromUrl = (rawUrl: string) => {
  try {
    const url = new URL(rawUrl);
    const pathname = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const cleaned = pathname.split("?")[0].split("#")[0];
    if (cleaned) {
      return cleaned;
    }

    const hostSlug = url.hostname
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/(^-|-$)/g, "");
    return hostSlug ? `${hostSlug}.jpg` : "remote-image.jpg";
  } catch {
    return "remote-image.jpg";
  }
};

const createLinkUploadedFile = (url: string): UploadedFile => {
  const identifier =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `link-${Date.now()}`;

  return {
    id: identifier,
    name: deriveFileNameFromUrl(url),
    size: 0,
    progress: 100,
    analysisState: "complete",
    previewUrl: url,
    sourceUrl: url,
    fileObject: undefined,
    base64Content: undefined,
    sightengineConfidence: undefined,
    analysisError: undefined,
    exifSummary: undefined,
    exifLoading: false,
    visionRequested: false,
    visionMatches: undefined,
    visionLoading: false,
  };
};

interface LinkModalContentProps {
  onSubmit: (url: string) => void;
  onRequestClose: () => void;
}

const LinkModalContent = ({
  onSubmit,
  onRequestClose,
}: LinkModalContentProps) => {
  const [linkValue, setLinkValue] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resetState = () => {
    setLinkValue("");
    setErrorMessage(null);
  };

  const handleClose = () => {
    resetState();
    onRequestClose();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = linkValue.trim();

    if (!trimmed) {
      setErrorMessage("Enter a link to continue.");
      return;
    }

    try {
      const parsed = new URL(trimmed);
      if (!/^https?:$/.test(parsed.protocol)) {
        setErrorMessage("Enter a valid http or https link.");
        return;
      }
    } catch {
      setErrorMessage("Enter a valid link, including https://.");
      return;
    }

    onSubmit(trimmed);
    resetState();
  };

  const isSubmitDisabled = linkValue.trim().length === 0;

  return (
    <div className="w-full rounded-xl bg-primary p-4 shadow-lg ring-1 ring-secondary">
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-secondary">Use link</h2>
            <p className="text-xs text-tertiary">
              Paste a direct image URL to verify without uploading a file.
            </p>
          </div>
          <Button
            slot="close"
            aria-label="Close link modal"
            color="tertiary"
            size="sm"
            iconLeading={XClose}
            onClick={handleClose}
          />
        </div>

        <TextField className="space-y-1" isRequired>
          <Label
            className="text-xs font-medium text-secondary"
            htmlFor="link-input"
          >
            Image link
          </Label>
          <AriaInput
            id="link-input"
            value={linkValue}
            onChange={(event) => {
              setLinkValue(event.target.value);
              if (errorMessage) {
                setErrorMessage(null);
              }
            }}
            aria-invalid={errorMessage ? "true" : undefined}
            placeholder="https://example.com/photo.jpg"
            className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-secondary outline-none transition duration-150 ease-linear focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            autoFocus
          />
          <AriaText slot="description" className="text-xs text-tertiary">
            Supports publicly accessible JPG, PNG, or GIF URLs.
          </AriaText>
          {errorMessage && (
            <AriaText
              slot="errorMessage"
              className="text-xs text-error-primary"
            >
              {errorMessage}
            </AriaText>
          )}
        </TextField>

        <div className="flex justify-end gap-2 pt-2">
          <Button color="secondary" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            size="sm"
            type="submit"
            isDisabled={isSubmitDisabled}
          >
            Use link
          </Button>
        </div>
      </form>
    </div>
  );
};

const LinkTrigger = ({
  onLinkSubmit,
}: {
  onLinkSubmit: (url: string) => void;
}) => (
  <DialogTrigger>
    {/* // TODO add back this back eventually  */}
    {/* <Button color="link-color" size="md">
      Use link
    </Button> */}
    <ModalOverlay className="sm:items-start sm:justify-end sm:p-4 sm:pt-16">
      <Modal>
        <Dialog className="mx-auto w-full max-w-md">
          {({ close }) => (
            <LinkModalContent
              onSubmit={(url) => {
                onLinkSubmit(url);
                close();
              }}
              onRequestClose={() => close()}
            />
          )}
        </Dialog>
      </Modal>
    </ModalOverlay>
  </DialogTrigger>
);

interface ControlsGroupProps {
  className?: string;
  enableSightengine: boolean;
  enableGoogleImages: boolean;
  enableGoogleVision: boolean;
  onToggleSightengine: (enabled: boolean) => void;
  onToggleGoogleImages: (enabled: boolean) => void;
  onToggleGoogleVision: (enabled: boolean) => void;
}

const ControlsGroup = ({
  className,
  enableSightengine,
  enableGoogleImages,
  enableGoogleVision,
  onToggleSightengine,
  onToggleGoogleImages,
  onToggleGoogleVision,
}: ControlsGroupProps) => (
  <div
    className={["flex items-center gap-2", className].filter(Boolean).join(" ")}
  >
    <DialogTrigger>
      <ButtonUtility
        tooltip="Settings"
        size="xs"
        color="secondary"
        icon={Settings01}
      />
      <ModalOverlay className="sm:items-start sm:justify-end sm:p-4 sm:pt-16">
        <Modal>
          <Dialog className="mx-auto w-full max-w-md">
            <SettingsContent
              enableSightengine={enableSightengine}
              enableGoogleImages={enableGoogleImages}
              enableGoogleVision={enableGoogleVision}
              onToggleSightengine={onToggleSightengine}
              onToggleGoogleImages={onToggleGoogleImages}
              onToggleGoogleVision={onToggleGoogleVision}
            />
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>

    <ThemeToggle variant="utility" />
  </div>
);

const buildAnalysisDataFromFile = (file: UploadedFile): AnalysisData => {
  const base = DEFAULT_ANALYSIS_DATA;

  const summary = file.exifSummary;

  const metadata = summary
    ? {
      status: summary.status,
      exifStripped: summary.exifStripped,
      gpsData: summary.gpsData,
      details: summary.details,
      entries: summary.entries,
      groups: summary.groups,
      bigEndian: summary.bigEndian,
      error: summary.error,
    }
    : {
      ...base.metadata,
      entries: base.metadata.entries ? [...base.metadata.entries] : undefined,
      groups: base.metadata.groups ? [...base.metadata.groups] : undefined,
      bigEndian: base.metadata.bigEndian,
      error: base.metadata.error,
    };

  const aiConfidence = file.sightengineConfidence;
  const confidenceBreakdown =
    typeof aiConfidence === "number"
      ? [
        {
          providerId: "sightengine",
          label: "SightEngine",
          value: aiConfidence,
        },
      ]
      : [];

  const confidence =
    confidenceBreakdown.length > 0
      ? Math.round(
        confidenceBreakdown.reduce((total, entry) => total + entry.value, 0) /
        confidenceBreakdown.length
      )
      : base.aiDetection.confidence;

  let status = base.aiDetection.status;
  if (typeof aiConfidence === "number") {
    status =
      aiConfidence >= 80 ? "error" : aiConfidence >= 45 ? "warning" : "info";
  }

  let label = base.aiDetection.label;
  if (typeof aiConfidence === "number") {
    label =
      status === "error"
        ? "Likely AI-generated"
        : status === "warning"
          ? "Possible Manipulation"
          : "Likely Authentic";
  }

  const aiDetails =
    typeof aiConfidence === "number"
      ? `SightEngine reports a ${aiConfidence}% likelihood that this media was AI-generated.`
      : base.aiDetection.details;

  return {
    ...base,
    aiDetection: {
      ...base.aiDetection,
      status,
      label,
      confidence,
      sightengineConfidence: aiConfidence,
      confidenceBreakdown,
      details: aiDetails,
    },
    metadata,
    synthesis: {
      ...base.synthesis,
    },
    circulation: {
      webMatches: (file.visionMatches && file.visionMatches.length > 0
        ? file.visionMatches
        : base.circulation.webMatches
      ).map((match) => ({ ...match })),
    },
  };
};

function App() {
  const [view, setView] = useState<"upload" | "analyze">("upload");
  const [selectedFile, setSelectedFile] = useState<UploadedFile | null>(null);
  const [analysisData, setAnalysisData] = useState<AnalysisData | undefined>(
    undefined
  );
  const [visionMatchesCache, setVisionMatchesCache] = useState<Record<string, CirculationWebMatch[]>>({});
  const [visionLoadingCache, setVisionLoadingCache] = useState<Record<string, boolean>>({});

  // Local state mirrors persisted API toggles
  const [enableSightengine, setEnableSightengine] = useState<boolean>(() =>
    isApiEnabled("sightengine")
  );
  const [enableGoogleImages, setEnableGoogleImages] = useState<boolean>(() =>
    isApiEnabled("google_images")
  );
  const [enableGoogleVision, setEnableGoogleVision] = useState<boolean>(() =>
    isApiEnabled("google_vision")
  );

  const requestVisionForFile = useCallback(
    (file: UploadedFile) => {
      if (!enableGoogleVision) {
        return;
      }

      const cacheKey = file.id;
      if (visionMatchesCache[cacheKey] || visionLoadingCache[cacheKey]) {
        return;
      }

      const base64Content = file.base64Content;
      const imageUri = base64Content ? undefined : file.sourceUrl ?? file.previewUrl;

      if (!base64Content && !imageUri) {
        return;
      }

      setVisionLoadingCache((prev) => ({ ...prev, [cacheKey]: true }));
      setSelectedFile((prev) => {
        if (!prev || prev.id !== cacheKey) {
          return prev;
        }
        return { ...prev, visionLoading: true };
      });

      void fetchVisionWebDetection({
        base64Content,
        imageUri,
        maxResults: 24,
      })
        .then((result) => {
          setVisionMatchesCache((prev) => ({ ...prev, [cacheKey]: result.matches }));
          setSelectedFile((prev) => {
            if (!prev || prev.id !== cacheKey) {
              return prev;
            }
            const updated = { ...prev, visionMatches: result.matches, visionLoading: false };
            setAnalysisData(buildAnalysisDataFromFile(updated));
            return updated;
          });
        })
        .catch((error) => {
          console.error("Google Vision web detection failed", error);
        })
        .finally(() => {
          setVisionLoadingCache((prev) => {
            const next = { ...prev };
            delete next[cacheKey];
            return next;
          });
          setSelectedFile((prev) => {
            if (!prev || prev.id !== cacheKey) {
              return prev;
            }
            return { ...prev, visionLoading: false };
          });
        });
    },
    [enableGoogleVision, visionLoadingCache, visionMatchesCache],
  );

  const handleContinue = (file: UploadedFile) => {
    const cachedMatches = visionMatchesCache[file.id];
    const isLoadingVision = Boolean(visionLoadingCache[file.id]);
    const shouldRequestVision =
      enableGoogleVision && (!file.visionRequested || (!cachedMatches && !isLoadingVision));

    const nextFile: UploadedFile = {
      ...file,
      visionMatches: cachedMatches ?? file.visionMatches,
      visionLoading: shouldRequestVision || isLoadingVision,
      visionRequested: file.visionRequested || shouldRequestVision,
    };

    setSelectedFile(nextFile);
    setAnalysisData(buildAnalysisDataFromFile(nextFile));
    setView("analyze");

    if (shouldRequestVision) {
      requestVisionForFile({ ...nextFile, visionRequested: true });
    }
  };

  const handleBack = () => {
    setSelectedFile(null);
    setAnalysisData(undefined);
    setView("upload");
  };

  const handleLinkSubmit = (link: string) => {
    const remoteFile = createLinkUploadedFile(link);
    const shouldRequestVision = enableGoogleVision;
    const nextFile: UploadedFile = shouldRequestVision
      ? { ...remoteFile, visionRequested: true, visionLoading: true }
      : remoteFile;

    setSelectedFile(nextFile);
    setAnalysisData(buildAnalysisDataFromFile(nextFile));
    setView("analyze");

    if (shouldRequestVision) {
      requestVisionForFile(nextFile);
    }
  };

  const handleToggleSightengine = (enabled: boolean) => {
    setEnableSightengine(enabled);
    setApiToggleOverride("sightengine", enabled);
  };

  const handleToggleGoogleImages = (enabled: boolean) => {
    setEnableGoogleImages(enabled);
    setApiToggleOverride("google_images", enabled);
  };

  const handleToggleGoogleVision = (enabled: boolean) => {
    setEnableGoogleVision(enabled);
    setApiToggleOverride("google_vision", enabled);
  };

  useEffect(() => {
    if (!enableGoogleVision || !selectedFile) {
      return;
    }

    const cacheKey = selectedFile.id;
    const hasMatches = Boolean(visionMatchesCache[cacheKey]?.length);
    const isLoadingVision = Boolean(visionLoadingCache[cacheKey]);

    if (hasMatches || isLoadingVision) {
      return;
    }

    requestVisionForFile({ ...selectedFile, visionRequested: true });
  }, [enableGoogleVision, requestVisionForFile, selectedFile, visionMatchesCache, visionLoadingCache]);

  return (
    <ThemeProvider>
      {view === "upload" && (
        <div className="relative mx-auto w-2xl">
          <ControlsGroup
            className="absolute right-0 top-0 z-20"
            enableSightengine={enableSightengine}
            enableGoogleImages={enableGoogleImages}
            enableGoogleVision={enableGoogleVision}
            onToggleSightengine={handleToggleSightengine}
            onToggleGoogleImages={handleToggleGoogleImages}
            onToggleGoogleVision={handleToggleGoogleVision}
          />

          <Examples />
          <div className="mx-auto w-2xl">
            <FileUploader
              onContinue={handleContinue}
              onVisionRequest={requestVisionForFile}
              linkTrigger={<LinkTrigger onLinkSubmit={handleLinkSubmit} />}
            />
          </div>
        </div>
      )}
      {view === "analyze" && selectedFile && (
        <div className="relative mx-auto w-full max-w-6xl">
          <MediaVerificationTool
            file={{
              name: selectedFile.name,
              size: selectedFile.size,
              previewUrl: selectedFile.previewUrl,
              sourceUrl: selectedFile.sourceUrl,
              base64Content: selectedFile.base64Content,
              visionLoading: selectedFile.visionLoading,
            }}
            onBack={handleBack}
            data={analysisData}
            headerActions={
              <ControlsGroup
                enableSightengine={enableSightengine}
                enableGoogleImages={enableGoogleImages}
                enableGoogleVision={enableGoogleVision}
                onToggleSightengine={handleToggleSightengine}
                onToggleGoogleImages={handleToggleGoogleImages}
                onToggleGoogleVision={handleToggleGoogleVision}
              />
            }
          />
        </div>
      )}
    </ThemeProvider>
  );
}

export default App;
