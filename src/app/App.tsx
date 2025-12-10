import { type FormEvent, useState } from "react";

import { ThemeProvider } from "@/app/providers/theme-provider";
import { MediaVerificationTool } from "@/features/media-verification/components/media-verification-tool/MediaVerificationTool";
import { FileUploader } from "@/features/uploads/components/file-upload/file-uploader";
import Examples from "@/features/uploads/components/Examples";
import { ThemeToggle } from "@/components/ui/theme/ThemeToggle";
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
import { useVerificationWorkflow } from "@/features/media-verification/hooks/useVerificationWorkflow";

interface SettingsContentProps {
  enableSightengine: boolean;
  enableGoogleImages: boolean;
  enableGoogleVision: boolean;
  googleVisionAvailable: boolean;
  enableGeolocation: boolean;
  geolocationAvailable: boolean;
  onToggleSightengine: (isEnabled: boolean) => void;
  onToggleGoogleImages: (isEnabled: boolean) => void;
  onToggleGoogleVision: (isEnabled: boolean) => void;
  onToggleGeolocation: (isEnabled: boolean) => void;
}

const SettingsContent = ({
  enableSightengine,
  enableGoogleImages,
  enableGoogleVision,
  googleVisionAvailable,
  enableGeolocation,
  geolocationAvailable,
  onToggleSightengine,
  onToggleGoogleImages,
  onToggleGoogleVision,
  onToggleGeolocation,
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
          <div className="space-y-1 text-xs text-tertiary">
            <p>
              Toggle Google Cloud Vision web detection for circulation insights.
            </p>
            {!googleVisionAvailable && (
              <p className="italic">
                Add <code>VITE_GOOGLE_VISION_API_KEY</code> to your environment
                configuration to enable this integration.
              </p>
            )}
          </div>
        </div>
        <Toggle
          aria-label="Toggle Google Vision API"
          size="sm"
          isSelected={enableGoogleVision}
          isDisabled={!googleVisionAvailable}
          onChange={(isSelected) => onToggleGoogleVision(Boolean(isSelected))}
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-secondary">
            Enable Location Analysis
          </p>
          <div className="space-y-1 text-xs text-tertiary">
            <p>Use the Gemini API to provide grounded location analysis and map layer suggestions.</p>
            {!geolocationAvailable && (
              <p className="italic">
                Add <code>VITE_GEMINI_API_KEY</code> to use this feature.
              </p>
            )}
          </div>
        </div>
        <Toggle
          aria-label="Toggle Location Analysis"
          size="sm"
          isSelected={enableGeolocation}
          isDisabled={!geolocationAvailable}
          onChange={(isSelected) => onToggleGeolocation(Boolean(isSelected))}
        />
      </div>
    </div>
  </div>
);

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
    <ModalOverlay className="">
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
  googleVisionAvailable: boolean;
  enableGeolocation: boolean;
  geolocationAvailable: boolean;
  onToggleSightengine: (enabled: boolean) => void;
  onToggleGoogleImages: (enabled: boolean) => void;
  onToggleGoogleVision: (enabled: boolean) => void;
  onToggleGeolocation: (enabled: boolean) => void;
}

const ControlsGroup = ({
  className,
  enableSightengine,
  enableGoogleImages,
  enableGoogleVision,
  googleVisionAvailable,
  enableGeolocation,
  geolocationAvailable,
  onToggleSightengine,
  onToggleGoogleImages,
  onToggleGoogleVision,
  onToggleGeolocation,
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
              googleVisionAvailable={googleVisionAvailable}
              enableGeolocation={enableGeolocation}
              geolocationAvailable={geolocationAvailable}
              onToggleSightengine={onToggleSightengine}
              onToggleGoogleImages={onToggleGoogleImages}
              onToggleGoogleVision={onToggleGoogleVision}
              onToggleGeolocation={onToggleGeolocation}
            />
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>

    <ThemeToggle variant="utility" />
  </div>
);

function App() {
  const {
    view,
    selectedFile,
    analysisData,
    enableSightengine,
    enableGoogleImages,
    enableGoogleVision,
    googleVisionAvailable,
    enableGeolocation,
    geolocationAvailable,
    handleContinue,
    handleBack,
    handleLinkSubmit,
    handleToggleSightengine,
    handleToggleGoogleImages,
    handleToggleGoogleVision,
    handleToggleGeolocation,
    requestVisionForFile,
    requestGeolocationForFile,
  } = useVerificationWorkflow();

  return (
    <ThemeProvider>
      {view === "upload" && (
        <div className="relative mx-auto w-full max-w-2xl px-4 sm:px-0">
          <ControlsGroup
            className="absolute right-0 top-0 z-20"
            enableSightengine={enableSightengine}
            enableGoogleImages={enableGoogleImages}
            enableGoogleVision={enableGoogleVision}
            googleVisionAvailable={googleVisionAvailable}
            enableGeolocation={enableGeolocation}
            geolocationAvailable={geolocationAvailable}
            onToggleSightengine={handleToggleSightengine}
            onToggleGoogleImages={handleToggleGoogleImages}
            onToggleGoogleVision={handleToggleGoogleVision}
            onToggleGeolocation={handleToggleGeolocation}
          />

          <Examples />
          <div className="mx-auto w-full max-w-2xl">
            <FileUploader
              onContinue={handleContinue}
              onVisionRequest={requestVisionForFile}
              onGeolocationRequest={requestGeolocationForFile}
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
              visionWebDetection: selectedFile.visionWebDetection,
              geolocationAnalysis: selectedFile.geolocationAnalysis,
              geolocationLoading: selectedFile.geolocationLoading,
              geolocationError: selectedFile.geolocationError,
              geolocationRequested: selectedFile.geolocationRequested,
              geolocationConfidence: selectedFile.geolocationConfidence,
              geolocationCoordinates: selectedFile.geolocationCoordinates,
              geolocationCoordinatesLoading: selectedFile.geolocationCoordinatesLoading,
              geolocationCoordinatesError: selectedFile.geolocationCoordinatesError,
              locationLayerRecommendation: selectedFile.locationLayerRecommendation,
              locationLayerRecommendationLoading: selectedFile.locationLayerRecommendationLoading,
              locationLayerRecommendationError: selectedFile.locationLayerRecommendationError,
            }}
            onBack={handleBack}
            data={analysisData}
            geolocationEnabled={enableGeolocation}
            geolocationAvailable={geolocationAvailable}
            headerActions={
              <ControlsGroup
                enableSightengine={enableSightengine}
                enableGoogleImages={enableGoogleImages}
                enableGoogleVision={enableGoogleVision}
                googleVisionAvailable={googleVisionAvailable}
                enableGeolocation={enableGeolocation}
                geolocationAvailable={geolocationAvailable}
                onToggleSightengine={handleToggleSightengine}
                onToggleGoogleImages={handleToggleGoogleImages}
                onToggleGoogleVision={handleToggleGoogleVision}
                onToggleGeolocation={handleToggleGeolocation}
              />
            }
          />
        </div>
      )}
    </ThemeProvider>
  );
}

export default App;
