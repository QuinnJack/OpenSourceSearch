import { type FormEvent, useEffect, useState } from "react";

import { ThemeProvider } from "@/app/providers/theme-provider";
import { MediaVerificationTool } from "@/features/media-verification/components/media-verification-tool/MediaVerificationTool";
import { FileUploader } from "@/features/uploads/components/file-upload/file-uploader";
import Examples from "@/features/uploads/components/Examples";
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
import {
  API_KEY_CHANGE_EVENT,
  type ApiKeyId,
  type ApiKeySource,
  getApiKeySource,
  getStoredApiKey,
  setApiKeyOverride,
} from "@/shared/config/api-keys";
import { Tabs, TabList, Tab, TabPanel } from "@/components/ui/tabs/tabs";
import { ButtonGroup, ButtonGroupItem } from "@/components/ui/button-group/button-group";
import { useTheme } from "@/app/providers/theme-context";
import { AppearanceProvider, useAppearance } from "@/shared/contexts/appearance-context";

interface ApiKeyFieldConfig {
  id: ApiKeyId;
  label: string;
  placeholder?: string;
  type?: "text" | "password";
}

interface ApiKeySectionConfig {
  id: string;
  title: string;
  description: string;
  fields: ApiKeyFieldConfig[];
}

const API_KEY_SECTIONS: ApiKeySectionConfig[] = [
  {
    id: "sightengine",
    title: "SightEngine AI detection",
    description: "Used to score how likely an image is to be AI-generated.",
    fields: [
      {
        id: "sightengine_user",
        label: "API user",
        placeholder: "000000",
        type: "text",
      },
      {
        id: "sightengine_secret",
        label: "API secret",
        placeholder: "se-xxxxxxxx",
        type: "password",
      },
    ],
  },
  {
    id: "fact-check",
    title: "Google Fact Check",
    description: "Enables the Google Images fact-check searches in Context.",
    fields: [
      {
        id: "google_fact_check",
        label: "API key",
        placeholder: "AIza...",
        type: "password",
      },
    ],
  },
  {
    id: "vision",
    title: "Google Vision Web Detection",
    description: "Fetches visually similar images and circulation matches.",
    fields: [
      {
        id: "google_vision",
        label: "API key",
        placeholder: "AIza...",
        type: "password",
      },
    ],
  },
  {
    id: "gemini",
    title: "Gemini (Geolocation + Layers)",
    description: "Generates grounded location answers and map layer recommendations.",
    fields: [
      {
        id: "gemini",
        label: "API key",
        placeholder: "AIza...",
        type: "password",
      },
    ],
  },
  {
    id: "maps",
    title: "Google Maps Geocoding",
    description: "Helps place Gemini answers on the map.",
    fields: [
      {
        id: "google_maps",
        label: "API key",
        placeholder: "AIza...",
        type: "password",
      },
    ],
  },
  {
    id: "first-alerts",
    title: "First Alerts",
    description: "ArcGIS token for the First Alerts situational layer.",
    fields: [
      {
        id: "first_alerts",
        label: "Access token",
        placeholder: "Paste your token…",
        type: "password",
      },
    ],
  },
];

const SETTINGS_TABS = [
  { id: "integrations", label: "Integrations" },
  { id: "appearance", label: "Appearance" },
  { id: "api-keys", label: "API keys" },
];

type ApiKeyInputState = Partial<Record<ApiKeyId, string>>;
type ApiKeySourceMap = Partial<Record<ApiKeyId, ApiKeySource>>;

const readStoredKeyInputs = (): ApiKeyInputState => {
  const values: ApiKeyInputState = {};
  for (const section of API_KEY_SECTIONS) {
    for (const field of section.fields) {
      values[field.id] = getStoredApiKey(field.id) ?? "";
    }
  }
  return values;
};

const readKeySources = (): ApiKeySourceMap => {
  const sources: ApiKeySourceMap = {};
  for (const section of API_KEY_SECTIONS) {
    for (const field of section.fields) {
      sources[field.id] = getApiKeySource(field.id);
    }
  }
  return sources;
};
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
  enableHtmldate: boolean;
  onToggleHtmldate: (isEnabled: boolean) => void;
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
  enableHtmldate,
  onToggleHtmldate,
}: SettingsContentProps) => {
  const [keyInputs, setKeyInputs] = useState<ApiKeyInputState>(() => readStoredKeyInputs());
  const [keySources, setKeySources] = useState<ApiKeySourceMap>(() => readKeySources());
  const { theme, setTheme } = useTheme();
  const { badgeStyle, setBadgeStyle } = useAppearance();

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncKeys = () => {
      setKeyInputs(readStoredKeyInputs());
      setKeySources(readKeySources());
    };
    const listener = syncKeys as EventListener;

    window.addEventListener(API_KEY_CHANGE_EVENT, listener);
    window.addEventListener("storage", listener);

    return () => {
      window.removeEventListener(API_KEY_CHANGE_EVENT, listener);
      window.removeEventListener("storage", listener);
    };
  }, []);

  const persistKeyValue = (id: ApiKeyId, value: string) => {
    const trimmed = value.trim();
    setKeyInputs((prev) => ({ ...prev, [id]: trimmed }));
    setApiKeyOverride(id, trimmed);
    setKeySources(readKeySources());
  };

  const describeSource = (source: ApiKeySource | undefined): string => {
    switch (source) {
      case "override":
        return "Using a key stored in this browser.";
      case "environment":
        return "Provided via environment configuration.";
      default:
        return "Not configured yet.";
    }
  };

  return (
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

      <Tabs defaultSelectedKey="integrations">
        <TabList
          aria-label="Settings sections"
          items={SETTINGS_TABS}
          type="button-border"
          size="sm"
          className="mt-1"
        >
          {(item) => (
            <Tab key={item.id} id={item.id}>
              {item.label}
            </Tab>
          )}
        </TabList>

        <TabPanel id="integrations" className="mt-4">
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
                      Add <code>VITE_GOOGLE_VISION_API_KEY</code> to your environment configuration or store a key in the API Keys tab to enable this integration.
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
                      Add <code>VITE_GEMINI_API_KEY</code> or save a key inside the API Keys tab to use this feature.
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

            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium text-secondary">
                  Enable PyScript Date Analysis
                </p>
                <div className="space-y-1 text-xs text-tertiary">
                  <p>Use PyScript to extract publication dates from web pages.</p>
                </div>
              </div>
              <Toggle
                aria-label="Toggle PyScript Date Analysis"
                size="sm"
                isSelected={enableHtmldate}
                onChange={(isSelected) => onToggleHtmldate(Boolean(isSelected))}
              />
            </div>
          </div>
        </TabPanel>

        <TabPanel id="appearance" className="mt-4 space-y-4">
          <div className="space-y-2 rounded-lg border border-secondary/30 p-4">
            <div>
              <p className="text-sm font-medium text-secondary">Theme</p>
              <p className="text-xs text-tertiary">
                Choose between light, dark, or follow your device setting.
              </p>
            </div>
            <ButtonGroup aria-label="Theme selection" size="sm" className="mt-2">
              <ButtonGroupItem
                isSelected={theme === "system"}
                onPress={() => setTheme("system")}
              >
                System
              </ButtonGroupItem>
              <ButtonGroupItem
                isSelected={theme === "light"}
                onPress={() => setTheme("light")}
              >
                Light
              </ButtonGroupItem>
              <ButtonGroupItem
                isSelected={theme === "dark"}
                onPress={() => setTheme("dark")}
              >
                Dark
              </ButtonGroupItem>
            </ButtonGroup>
          </div>

          <div className="space-y-2 rounded-lg border border-secondary/30 p-4">
            <div>
              <p className="text-sm font-medium text-secondary">Badge style</p>
              <p className="text-xs text-tertiary">
                Toggle between vibrant color chips and muted monochrome badges.
              </p>
            </div>
            <ButtonGroup aria-label="Badge style selection" size="sm" className="mt-2">
              <ButtonGroupItem
                isSelected={badgeStyle === "color"}
                onPress={() => setBadgeStyle("color")}
              >
                Colorful
              </ButtonGroupItem>
              <ButtonGroupItem
                isSelected={badgeStyle === "modern"}
                onPress={() => setBadgeStyle("modern")}
              >
                Muted
              </ButtonGroupItem>
            </ButtonGroup>
          </div>
        </TabPanel>

        <TabPanel id="api-keys" className="mt-4 space-y-3">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-secondary">
              Bring your own keys
            </p>
            <p className="text-xs text-tertiary">
              Keys are stored locally in this browser and override the default environment configuration.
            </p>
          </div>

          <div className="space-y-3">
            {API_KEY_SECTIONS.map((section) => (
              <div key={section.id} className="rounded-lg border border-secondary/30 p-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-secondary">{section.title}</p>
                  <p className="text-xs text-tertiary">{section.description}</p>
                </div>
                <div className="mt-3 space-y-3">
                  {section.fields.map((field) => {
                    const inputId = `${section.id}-${field.id}`;
                    const value = keyInputs[field.id] ?? "";
                    const source = keySources[field.id] ?? "none";

                    return (
                      <TextField key={field.id} className="space-y-1">
                        <Label
                          className="text-xs font-medium text-secondary"
                          htmlFor={inputId}
                        >
                          {field.label}
                        </Label>
                        <AriaInput
                          id={inputId}
                          type={field.type ?? "text"}
                          value={value}
                          onChange={(event) => {
                            const nextValue = event.target.value;
                            setKeyInputs((prev) => ({ ...prev, [field.id]: nextValue }));
                          }}
                          onBlur={() => persistKeyValue(field.id, value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              persistKeyValue(field.id, value);
                            }
                          }}
                          placeholder={field.placeholder}
                          className="w-full rounded-lg border border-secondary bg-primary px-3 py-2 text-sm text-secondary outline-none transition duration-150 ease-linear focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
                        />
                        <AriaText slot="description" className="text-xs text-tertiary">
                          {describeSource(source)}
                        </AriaText>
                      </TextField>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabPanel>
      </Tabs>
    </div >
  );
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
  enableHtmldate: boolean;
  onToggleHtmldate: (enabled: boolean) => void;
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
  enableHtmldate,
  onToggleHtmldate,
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
              enableHtmldate={enableHtmldate}
              onToggleHtmldate={onToggleHtmldate}
            />
          </Dialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  </div>
);

function App() {
  const {
    view,
    selectedFile,
    analysisData,
    videoContext,
    enableSightengine,
    enableGoogleImages,
    enableGoogleVision,
    googleVisionAvailable,
    enableGeolocation,
    geolocationAvailable,
    enableHtmldate,
    handleContinue,
    handleBack,
    handleLinkSubmit,
    handleToggleSightengine,
    handleToggleGoogleImages,
    handleToggleGoogleVision,
    handleToggleGeolocation,
    handleToggleHtmldate,
    requestVisionForFile,
    requestGeolocationForFile,
    handleFrameSelection,
  } = useVerificationWorkflow();

  const isUploadView = view === "upload";
  const frameSummaries = videoContext
    ? videoContext.frames.map((frame, index) => ({
      id: frame.id,
      label: frame.frameLabel ?? `Frame ${index + 1}`,
      timestampMs: frame.frameTimestampMs,
      previewUrl: frame.previewUrl,
    }))
    : undefined;

  return (
    <ThemeProvider>
      <AppearanceProvider>
        <div
          className={`relative mx-auto w-full max-w-2xl px-4 sm:px-0 ${isUploadView ? "" : "hidden"}`}
        >
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
            enableHtmldate={enableHtmldate}
            onToggleHtmldate={handleToggleHtmldate}
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

        {view === "analyze" && selectedFile && (
          <div className="relative mx-auto w-full max-w-6xl">
            <MediaVerificationTool
              file={{
                name: selectedFile.name,
                size: selectedFile.size,
                previewUrl: selectedFile.previewUrl,
                mediaType: selectedFile.mediaType,
                sourceUrl: selectedFile.sourceUrl,
                base64Content: selectedFile.base64Content,
                frameIndex: selectedFile.frameIndex,
                frameLabel: selectedFile.frameLabel,
                frameTimestampMs: selectedFile.frameTimestampMs,
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
              frames={frameSummaries}
              activeFrameIndex={videoContext?.activeIndex}
              onFrameChange={videoContext ? handleFrameSelection : undefined}
              videoPreviewUrl={videoContext?.videoPreviewUrl}
              videoDurationMs={videoContext?.videoDurationMs}
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
                  enableHtmldate={enableHtmldate}
                  onToggleHtmldate={handleToggleHtmldate}
                />
              }
            />
          </div>
        )}
      </AppearanceProvider>
    </ThemeProvider>
  );
}

export default App;
