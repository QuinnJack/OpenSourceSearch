import { useEffect, useRef, useState, type ReactNode } from "react";

import { FileUpload } from "./file-upload";
import { ensureHtmlDateBridge } from "@/features/media-verification/utils/htmldate-loader";
import { isApiEnabled } from "@/shared/config/api-toggles";
import type { GoogleVisionWebDetectionResult } from "@/features/media-verification/api/google-vision";
import type {
    GeolocationAnalysis,
    LocationLayerRecommendation,
} from "@/features/media-verification/api/geolocation";
import type { GeocodedLocation } from "@/features/media-verification/api/geocoding";
import type { ExifSummary } from "@/utils/exif";
import { extractExifSummaryFromFile } from "@/utils/exif";
import { stripDataUrlPrefix } from "@/utils/url";
import { extractVideoFrames, isVideoFile } from "@/features/uploads/utils/videoProcessing";
import type { CapturedFrame } from "@/features/uploads/utils/videoProcessing";

export type AnalysisState = "idle" | "loading" | "complete";

const SIGHTENGINE_ENDPOINT = "https://api.sightengine.com/1.0/check.json";
const SIGHTENGINE_API_USER = import.meta.env?.VITE_SIGHTENGINE_API_USER as string | undefined;
const SIGHTENGINE_API_SECRET = import.meta.env?.VITE_SIGHTENGINE_API_SECRET as string | undefined;
const FRAME_NAME_FALLBACK = "video-frame";

const createFrameIdentifier = (parentId: string, frameIndex: number): string => {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
        return `${parentId}-frame-${frameIndex + 1}-${crypto.randomUUID()}`;
    }
    return `${parentId}-frame-${frameIndex + 1}-${Date.now().toString(36)}`;
};

const formatTimestampLabel = (timestampMs?: number): string | undefined => {
    if (typeof timestampMs !== "number" || Number.isNaN(timestampMs)) {
        return undefined;
    }
    const seconds = timestampMs / 1000;
    if (seconds >= 10) {
        return `${Math.round(seconds)}s`;
    }
    if (seconds >= 1) {
        return `${seconds.toFixed(1)}s`;
    }
    return `${seconds.toFixed(2)}s`;
};

const getBaseFileName = (name: string | undefined): string => {
    if (!name) {
        return FRAME_NAME_FALLBACK;
    }
    const base = name.replace(/\\.[^.]+$/, "");
    return base || FRAME_NAME_FALLBACK;
};

const createVideoFrameEntry = ({
    parent,
    frameId,
    capture,
}: {
    parent: UploadedFile;
    frameId: string;
    capture: CapturedFrame;
}): UploadedFile => {
    const baseName = getBaseFileName(parent.name);
    const frameName = `${baseName}-frame-${capture.index + 1}.jpg`;
    const frameFile = new File([capture.blob], frameName, { type: "image/jpeg" });
    const timestampLabel = formatTimestampLabel(capture.timestampMs);
    const frameLabel = timestampLabel ? `Frame ${capture.index + 1} · ${timestampLabel}` : `Frame ${capture.index + 1}`;

    return {
        id: frameId,
        name: frameName,
        type: frameFile.type,
        mimeType: frameFile.type,
        mediaType: "image",
        size: frameFile.size,
        progress: 100,
        failed: false,
        analysisState: "idle",
        previewUrl: capture.previewUrl,
        sourceUrl: parent.sourceUrl,
        fileObject: frameFile,
        base64Content: capture.base64,
        sightengineConfidence: undefined,
        analysisError: undefined,
        exifSummary: undefined,
        exifLoading: false,
        visionRequested: false,
        visionWebDetection: undefined,
        visionLoading: false,
        geolocationRequested: false,
        geolocationAnalysis: undefined,
        geolocationLoading: false,
        geolocationError: undefined,
        geolocationConfidence: null,
        geolocationCoordinates: null,
        geolocationCoordinatesLoading: false,
        geolocationCoordinatesError: undefined,
        locationLayerRecommendation: undefined,
        locationLayerRecommendationLoading: false,
        locationLayerRecommendationError: undefined,
        frameIndex: capture.index,
        frameLabel,
        frameTimestampMs: capture.timestampMs,
        isVideoFrame: true,
        parentVideoId: parent.id,
    };
};

const releaseCapturePreviews = (captures: CapturedFrame[]) => {
    captures.forEach((capture) => {
        if (capture.previewUrl) {
            URL.revokeObjectURL(capture.previewUrl);
        }
    });
};

const analyzeImageWithSightEngine = async (file: File): Promise<number | null> => {
    if (!isApiEnabled("sightengine")) {
        throw new Error("SightEngine API disabled via toggle");
    }

    if (!SIGHTENGINE_API_USER || !SIGHTENGINE_API_SECRET) {
        throw new Error("SightEngine API credentials are not configured");
    }

    const formData = new FormData();
    formData.append("media", file);
    formData.append("models", "genai");
    formData.append("api_user", SIGHTENGINE_API_USER);
    formData.append("api_secret", SIGHTENGINE_API_SECRET);

    const response = await fetch(SIGHTENGINE_ENDPOINT, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        throw new Error(`SightEngine request failed with status ${response.status}`);
    }

    const payload = await response.json();
    const score = payload?.type?.ai_generated;
    return typeof score === "number" ? score : null;
};

export interface UploadedFile {
    id: string;
    name: string;
    type?: string;
    mimeType?: string | null;
    mediaType?: "image" | "video";
    size: number;
    progress: number;
    failed?: boolean;
    analysisState: AnalysisState;
    /** Preview URL for display (created via URL.createObjectURL). */
    previewUrl?: string;
    /** Original video preview URL (object URL) when the upload is a video. */
    videoPreviewUrl?: string;
    /** Duration of the uploaded video in milliseconds. */
    videoDurationMs?: number;
    /** Captured image frames extracted from the uploaded video. */
    videoFrames?: UploadedFile[];
    /** File reference for the uploaded video asset. */
    videoFileObject?: File;
    /** Indicates the frame index when this entry represents a derived video frame. */
    frameIndex?: number;
    /** Human readable label for the derived video frame. */
    frameLabel?: string;
    /** Timestamp (in milliseconds) captured for the derived video frame. */
    frameTimestampMs?: number;
    /** Indicates this entry was generated from a video rather than uploaded directly. */
    isVideoFrame?: boolean;
    /** Identifier for the parent video upload when this entry is a derived frame. */
    parentVideoId?: string;
    /** If available, a public URL for the original media (used for fact-checking). */
    sourceUrl?: string;
    /** The original File object so it can be sent for analysis. */
    fileObject?: File;
    /** Base64-encoded payload without the data URL prefix. */
    base64Content?: string;
    /** Cached SightEngine confidence score (0-100). */
    sightengineConfidence?: number;
    /** Optional error state captured during analysis. */
    analysisError?: string;
    /** Extracted EXIF metadata summary for the file. */
    exifSummary?: ExifSummary;
    /** True while EXIF metadata is being collected. */
    exifLoading?: boolean;
    /** Indicates whether a Google Vision request has been made for this file. */
    visionRequested?: boolean;
    /** Cached Google Vision web detection response for this file. */
    visionWebDetection?: GoogleVisionWebDetectionResult;
    /** True while a Google Vision request is still in-flight. */
    visionLoading?: boolean;
    /** Indicates the Gemini geolocation prompt has been requested for this file. */
    geolocationRequested?: boolean;
    /** Cached geolocation analysis for this file. */
    geolocationAnalysis?: GeolocationAnalysis;
    /** True while the Gemini geolocation request is in-flight. */
    geolocationLoading?: boolean;
    /** Error returned from the geolocation attempt (if any). */
    geolocationError?: string;
    /** Gemini confidence score (0-10) returned with the geolocation answer. */
    geolocationConfidence?: number | null;
    /** Geocoded coordinates for the predicted location. */
    geolocationCoordinates?: GeocodedLocation | null;
    /** Indicates the coordinate lookup is in-flight. */
    geolocationCoordinatesLoading?: boolean;
    /** Coordinate lookup error message. */
    geolocationCoordinatesError?: string;
    /** Gemini location layer recommendation for map overlays. */
    locationLayerRecommendation?: LocationLayerRecommendation;
    /** True while Gemini evaluates relevant layers. */
    locationLayerRecommendationLoading?: boolean;
    /** Error returned from the layer recommendation attempt (if any). */
    locationLayerRecommendationError?: string;
}

interface FileUploaderProps {
    isDisabled?: boolean;
    onContinue?: (file: UploadedFile) => void;
    linkTrigger?: ReactNode;
    onVisionRequest?: (file: UploadedFile) => Promise<void>;
    onGeolocationRequest?: (file: UploadedFile) => Promise<void>;
}

export const FileUploader = ({ isDisabled, onContinue, linkTrigger, onVisionRequest, onGeolocationRequest }: FileUploaderProps) => {
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
    const uploadTimers = useRef<Record<string, ReturnType<typeof setInterval>>>({});
    const analysisFallbackTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const isUnmounted = useRef(false);

    useEffect(() => {
        isUnmounted.current = false;

        return () => {
            isUnmounted.current = true;
            Object.values(uploadTimers.current).forEach(clearInterval);
            uploadTimers.current = {};
            Object.values(analysisFallbackTimers.current).forEach(clearTimeout);
            analysisFallbackTimers.current = {};
        };
    }, []);

    const processVideoUpload = (fileId: string, videoFile: File) => {
        extractVideoFrames(videoFile, 2)
            .then(({ frames, durationMs }) => {
                if (isUnmounted.current) {
                    releaseCapturePreviews(frames);
                    return;
                }
                if (!frames.length) {
                    setUploadedFiles((prev) =>
                        prev.map((uploadedFile) =>
                            uploadedFile.id === fileId
                                ? {
                                    ...uploadedFile,
                                    analysisError: "Unable to capture frames from this video.",
                                }
                                : uploadedFile,
                        ),
                    );
                    return;
                }
                setUploadedFiles((prev) => {
                    const exists = prev.some((uploadedFile) => uploadedFile.id === fileId);
                    if (!exists) {
                        releaseCapturePreviews(frames);
                        return prev;
                    }
                    return prev.map((uploadedFile) => {
                        if (uploadedFile.id !== fileId) {
                            return uploadedFile;
                        }
                        const frameEntries = frames.map((capture) =>
                            createVideoFrameEntry({
                                parent: uploadedFile,
                                frameId: createFrameIdentifier(uploadedFile.id, capture.index),
                                capture,
                            }),
                        );
                        const [primaryFrame] = frameEntries;
                        return {
                            ...uploadedFile,
                            videoFrames: frameEntries,
                            videoDurationMs: durationMs,
                            previewUrl: primaryFrame?.previewUrl ?? uploadedFile.previewUrl,
                            base64Content: primaryFrame?.base64Content ?? uploadedFile.base64Content,
                            fileObject: primaryFrame?.fileObject ?? uploadedFile.fileObject,
                            mimeType: primaryFrame?.mimeType ?? uploadedFile.mimeType,
                            analysisError: undefined,
                        };
                    });
                });
            })
            .catch((error) => {
                if (isUnmounted.current) {
                    return;
                }
                console.error("Video processing failed", error);
                setUploadedFiles((prev) =>
                    prev.map((uploadedFile) =>
                        uploadedFile.id === fileId
                            ? {
                                ...uploadedFile,
                                analysisError:
                                    error instanceof Error ? error.message : "Unable to process video frames.",
                            }
                            : uploadedFile,
                    ),
                );
            });
    };

    const releaseMediaResources = (file: UploadedFile | undefined) => {
        if (!file) {
            return;
        }
        if (file.previewUrl) {
            URL.revokeObjectURL(file.previewUrl);
        }
        if (file.videoPreviewUrl) {
            URL.revokeObjectURL(file.videoPreviewUrl);
        }
        file.videoFrames?.forEach((frame) => {
            if (frame.previewUrl) {
                URL.revokeObjectURL(frame.previewUrl);
            }
        });
    };

    const startSimulatedUpload = (fileId: string) => {
        let progress = 0;

        uploadTimers.current[fileId] = setInterval(() => {
            progress += 1;
            if (progress >= 100) {
                progress = 100;
            }

            setUploadedFiles((prev) =>
                prev.map((uploadedFile) =>
                    uploadedFile.id === fileId ? { ...uploadedFile, progress } : uploadedFile,
                ),
            );

            if (progress === 100 && uploadTimers.current[fileId]) {
                clearInterval(uploadTimers.current[fileId]);
                delete uploadTimers.current[fileId];
            }
        }, 20);
    };

    const clearUploadTimer = (fileId: string) => {
        if (uploadTimers.current[fileId]) {
            clearInterval(uploadTimers.current[fileId]);
            delete uploadTimers.current[fileId];
        }
    };

    const clearAnalysisTimer = (fileId: string) => {
        if (analysisFallbackTimers.current[fileId]) {
            clearTimeout(analysisFallbackTimers.current[fileId]);
            delete analysisFallbackTimers.current[fileId];
        }
    };

    const handleDropFiles = (files: FileList) => {
        const newFiles = Array.from(files);
        const newFilesWithIds: UploadedFile[] = newFiles.map((file): UploadedFile => {
            const video = isVideoFile(file);
            const previewUrl = video ? undefined : URL.createObjectURL(file);
            const videoPreviewUrl = video ? URL.createObjectURL(file) : undefined;
            const sourceUrl = (file as unknown as { sourceUrl?: string })?.sourceUrl;
            return {
                id: Math.random().toString(),
                name: file.name,
                size: file.size,
                type: file.type,
                mimeType: file.type ?? null,
                mediaType: video ? "video" : "image",
                progress: 0,
                analysisState: "idle" as AnalysisState,
                previewUrl,
                videoPreviewUrl,
                sourceUrl,
                fileObject: video ? undefined : file,
                videoFileObject: video ? file : undefined,
                base64Content: undefined,
                sightengineConfidence: undefined,
                analysisError: undefined,
                exifSummary: undefined,
                exifLoading: true,
                visionRequested: false,
                visionWebDetection: undefined,
                visionLoading: false,
                geolocationRequested: false,
                geolocationAnalysis: undefined,
                geolocationLoading: false,
                geolocationError: undefined,
                geolocationConfidence: null,
                geolocationCoordinates: null,
                geolocationCoordinatesLoading: false,
                geolocationCoordinatesError: undefined,
                locationLayerRecommendation: undefined,
                locationLayerRecommendationLoading: false,
                locationLayerRecommendationError: undefined,
            };
        });

        setUploadedFiles((prev) => [
            ...newFilesWithIds,
            ...prev,
        ]);

        newFilesWithIds.forEach(({ id }) => {
            startSimulatedUpload(id);
        });

        newFilesWithIds.forEach(({ id, fileObject, mediaType, videoFileObject }) => {
            if (mediaType === "video") {
                setUploadedFiles((prev) =>
                    prev.map((uploadedFile) =>
                        uploadedFile.id === id
                            ? { ...uploadedFile, exifLoading: false }
                            : uploadedFile,
                    ),
                );
                if (videoFileObject) {
                    processVideoUpload(id, videoFileObject);
                }
                return;
            }

            if (!fileObject) {
                setUploadedFiles((prev) => prev.map((uploadedFile) =>
                    uploadedFile.id === id ? { ...uploadedFile, exifLoading: false } : uploadedFile,
                ));
                return;
            }
            const reader = new FileReader();
            reader.onload = () => {
                if (isUnmounted.current) {
                    return;
                }
                const result = typeof reader.result === "string" ? reader.result : "";
                const { base64, mimeType } = stripDataUrlPrefix(result);
                if (!base64) {
                    return;
                }
                setUploadedFiles((prev) => {
                    const exists = prev.some((uploadedFile) => uploadedFile.id === id);
                    if (!exists) return prev;
                    return prev.map((uploadedFile) =>
                        uploadedFile.id === id
                            ? {
                                ...uploadedFile,
                                base64Content: base64,
                                mimeType: uploadedFile.mimeType ?? mimeType ?? null,
                            }
                            : uploadedFile,
                    );
                });
            };
            reader.onerror = () => undefined;
            reader.readAsDataURL(fileObject);

            extractExifSummaryFromFile(fileObject)
                .then((summary) => {
                    if (isUnmounted.current) return;
                    setUploadedFiles((prev) => {
                        const exists = prev.some((uploadedFile) => uploadedFile.id === id);
                        if (!exists) return prev;
                        return prev.map((uploadedFile) =>
                            uploadedFile.id === id
                                ? {
                                    ...uploadedFile,
                                    exifSummary: summary,
                                    exifLoading: false,
                                }
                                : uploadedFile,
                        );
                    });
                })
                .catch((error) => {
                    if (isUnmounted.current) return;
                    console.error("EXIF extraction failed", error);
                    setUploadedFiles((prev) => prev.map((uploadedFile) =>
                        uploadedFile.id === id
                            ? {
                                ...uploadedFile,
                                exifSummary: undefined,
                                exifLoading: false,
                            }
                            : uploadedFile,
                    ));
                });
        });
    };

    const handleDeleteFile = (id: string) => {
        clearUploadTimer(id);
        clearAnalysisTimer(id);
        setUploadedFiles((prev) => {
            const target = prev.find((file) => file.id === id);
            releaseMediaResources(target);
            return prev.filter((file) => file.id !== id);
        });
    };

    const handleAnalyzeFile = async (id: string) => {
        const file = uploadedFiles.find((uploadedFile) => uploadedFile.id === id);
        if (!file || file.analysisState !== "idle") {
            return;
        }

        void ensureHtmlDateBridge().catch((error) => {
            console.error("Failed to initialize publication date worker", error);
        });

        const hasRequestedVision = Boolean(file.visionRequested);
        const hasRequestedGeolocation = Boolean(file.geolocationRequested);
        const shouldTriggerGeolocation = Boolean(onGeolocationRequest) && !hasRequestedGeolocation;
        const shouldTriggerVision = Boolean(onVisionRequest) && !hasRequestedVision;

        setUploadedFiles((prev) =>
            prev.map((uploadedFile) =>
                uploadedFile.id === id
                    ? {
                        ...uploadedFile,
                        analysisState: "loading",
                        analysisError: undefined,
                        sightengineConfidence: undefined,
                        visionRequested: shouldTriggerVision || hasRequestedVision,
                        visionLoading: shouldTriggerVision || hasRequestedVision ? true : uploadedFile.visionLoading,
                        geolocationRequested: hasRequestedGeolocation || shouldTriggerGeolocation,
                        geolocationLoading: shouldTriggerGeolocation || hasRequestedGeolocation
                            ? true
                            : uploadedFile.geolocationLoading,
                        locationLayerRecommendationLoading:
                            shouldTriggerGeolocation || hasRequestedGeolocation
                                ? true
                                : uploadedFile.locationLayerRecommendationLoading,
                    }
                    : uploadedFile,
            ),
        );

        const fileForRequests: UploadedFile = {
            ...file,
            analysisState: "loading",
            visionRequested: shouldTriggerVision || hasRequestedVision,
            geolocationRequested: hasRequestedGeolocation || shouldTriggerGeolocation,
        };

        const visionPromise = shouldTriggerVision && onVisionRequest
            ? onVisionRequest(fileForRequests) ?? Promise.resolve()
            : Promise.resolve();
        const geolocationPromise = shouldTriggerGeolocation && onGeolocationRequest
            ? onGeolocationRequest({
                ...fileForRequests,
                geolocationRequested: true,
            }) ?? Promise.resolve()
            : Promise.resolve();

        const sightenginePromise = (async () => {
            try {
                const hasVideoFrames = Array.isArray(file.videoFrames) && file.videoFrames.length > 0;
                const targets = hasVideoFrames ? file.videoFrames ?? [] : [file];
                const frameScores: Record<string, number> = {};

                for (const target of targets) {
                    if (!target.fileObject) {
                        throw new Error("No file data available for analysis");
                    }

                    // eslint-disable-next-line no-await-in-loop
                    const score = await analyzeImageWithSightEngine(target.fileObject);
                    const normalizedScore = Math.max(0, Math.min(1, score ?? 0));
                    const confidence = Math.round(normalizedScore * 100);
                    frameScores[target.id] = confidence;
                }

                setUploadedFiles((prev) =>
                    prev.map((uploadedFile) => {
                        if (uploadedFile.id !== id) {
                            return uploadedFile;
                        }

                        const nextFrames = uploadedFile.videoFrames?.map((frame) => {
                            const confidence = frameScores[frame.id];
                            if (typeof confidence !== "number") {
                                return frame;
                            }
                            return { ...frame, sightengineConfidence: confidence };
                        });

                        let parentConfidence: number | undefined;
                        if (nextFrames?.length) {
                            parentConfidence = frameScores[nextFrames[0]?.id ?? ""] ?? nextFrames[0]?.sightengineConfidence;
                        } else if (typeof frameScores[uploadedFile.id] === "number") {
                            parentConfidence = frameScores[uploadedFile.id];
                        }

                        return {
                            ...uploadedFile,
                            sightengineConfidence: parentConfidence ?? uploadedFile.sightengineConfidence,
                            videoFrames: nextFrames,
                        };
                    }),
                );
            } catch (error) {
                const isDisabled = error instanceof Error && error.message.includes("disabled");
                const isMissingCredentials =
                    error instanceof Error && error.message.includes("credentials are not configured");
                if (!isDisabled && !isMissingCredentials) {
                    console.error("SightEngine analysis failed", error);
                }
                if (isDisabled || isMissingCredentials) {
                    analysisFallbackTimers.current[id] = setTimeout(() => {
                        setUploadedFiles((prev) =>
                            prev.map((uploadedFile) =>
                                uploadedFile.id === id
                                    ? {
                                        ...uploadedFile,
                                        analysisState: "complete",
                                        analysisError: undefined,
                                        sightengineConfidence: undefined,
                                    }
                                    : uploadedFile,
                            ),
                        );
                        clearAnalysisTimer(id);
                    }, 2000);
                } else {
                    setUploadedFiles((prev) =>
                        prev.map((uploadedFile) =>
                            uploadedFile.id === id
                                ? {
                                    ...uploadedFile,
                                    analysisState: "idle",
                                    analysisError: error instanceof Error ? error.message : "SightEngine analysis failed",
                                    sightengineConfidence: undefined,
                                }
                                : uploadedFile,
                        ),
                    );
                    throw error;
                }
            }
        })();

        await Promise.allSettled([visionPromise, geolocationPromise, sightenginePromise]);

        setUploadedFiles((prev) =>
            prev.map((uploadedFile) => {
                if (uploadedFile.id !== id) return uploadedFile;
                return {
                    ...uploadedFile,
                    analysisState: "complete",
                    visionLoading: false,
                    geolocationLoading: false,
                    locationLayerRecommendationLoading: false,
                    exifLoading: false,
                };
            }),
        );
    };

    const handleRetryFile = (id: string) => {
        const file = uploadedFiles.find((file) => file.id === id);
        if (!file) return;

        clearUploadTimer(id);
        clearAnalysisTimer(id);

        setUploadedFiles((prev) =>
            prev.map((uploadedFile) =>
                uploadedFile.id === id
                    ? {
                        ...uploadedFile,
                        progress: 0,
                        failed: false,
                        analysisState: "idle",
                        analysisError: undefined,
                        fileObject: file.fileObject ?? uploadedFile.fileObject,
                        visionRequested: false,
                        visionWebDetection: undefined,
                        visionLoading: false,
                        geolocationRequested: false,
                        geolocationAnalysis: undefined,
                        geolocationLoading: false,
                        geolocationError: undefined,
                        geolocationConfidence: null,
                        geolocationCoordinates: null,
                        geolocationCoordinatesLoading: false,
                        geolocationCoordinatesError: undefined,
                        locationLayerRecommendation: undefined,
                        locationLayerRecommendationLoading: false,
                        locationLayerRecommendationError: undefined,
                    }
                    : uploadedFile,
            ),
        );

        startSimulatedUpload(id);
    };

    const handleContinueFile = async (id: string) => {
        const file = uploadedFiles.find((f) => f.id === id);
        if (!file) return;

        let summary = file.exifSummary;
        if (!summary && file.fileObject) {
            try {
                summary = await extractExifSummaryFromFile(file.fileObject);
                if (!isUnmounted.current) {
                    setUploadedFiles((prev) =>
                        prev.map((uploadedFile) =>
                            uploadedFile.id === id
                                ? {
                                    ...uploadedFile,
                                    exifSummary: summary ?? uploadedFile.exifSummary,
                                    exifLoading: false,
                                }
                                : uploadedFile,
                        ),
                    );
                }
            } catch (error) {
                console.error("EXIF extraction failed on continue", error);
            }
        }

        onContinue?.({
            ...file,
            exifSummary: summary ?? file.exifSummary,
            exifLoading: false,
        });
    };

    return (
        <FileUpload.Root>
            <FileUpload.DropZone isDisabled={isDisabled} onDropFiles={handleDropFiles} linkTrigger={linkTrigger} />

            <FileUpload.List>
                {uploadedFiles.map((file) => (
                <FileUpload.ListItemProgressFill
                    key={file.id}
                    {...file}
                    size={file.size}
                    onDelete={() => handleDeleteFile(file.id)}
                    onAnalyze={() => handleAnalyzeFile(file.id)}
                    onContinue={() => void handleContinueFile(file.id)}
                    onRetry={() => handleRetryFile(file.id)}
                    metadataLoading={false}
                />
                ))}
            </FileUpload.List>
        </FileUpload.Root>
    );
};
