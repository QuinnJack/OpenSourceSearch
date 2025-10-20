import { useEffect, useRef, useState, type ReactNode } from "react";

import { FileUpload } from "./file-upload-base";
import { isApiEnabled } from "@/shared/config/api-toggles";
import type { CirculationWebMatch } from "@/shared/types/analysis";
import type { ExifSummary } from "@/utils/exif";
import { extractExifSummaryFromFile } from "@/utils/exif";
import { stripDataUrlPrefix } from "@/utils/url";

export type AnalysisState = "idle" | "loading" | "complete";

const SIGHTENGINE_ENDPOINT = "https://api.sightengine.com/1.0/check.json";
const SIGHTENGINE_API_USER = import.meta.env?.VITE_SIGHTENGINE_API_USER as string | undefined;
const SIGHTENGINE_API_SECRET = import.meta.env?.VITE_SIGHTENGINE_API_SECRET as string | undefined;

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
    size: number;
    progress: number;
    failed?: boolean;
    analysisState: AnalysisState;
    /** Preview URL for display (created via URL.createObjectURL). */
    previewUrl?: string;
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
    /** Cached Google Vision web matches for this file. */
    visionMatches?: CirculationWebMatch[];
    /** True while a Google Vision request is still in-flight. */
    visionLoading?: boolean;
}

interface FileUploaderProps {
    isDisabled?: boolean;
    onContinue?: (file: UploadedFile) => void;
    linkTrigger?: ReactNode;
    onVisionRequest?: (file: UploadedFile) => void;
}

export const FileUploader = ({ isDisabled, onContinue, linkTrigger, onVisionRequest }: FileUploaderProps) => {
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
        const newFilesWithIds = newFiles.map((file) => {
            const previewUrl = URL.createObjectURL(file);
            const sourceUrl = (file as unknown as { sourceUrl?: string })?.sourceUrl;
            return {
                id: Math.random().toString(),
                name: file.name,
                size: file.size,
                type: file.type,
                progress: 0,
                analysisState: "idle" as AnalysisState,
                previewUrl,
                sourceUrl,
                fileObject: file,
                base64Content: undefined,
                sightengineConfidence: undefined,
                analysisError: undefined,
                exifSummary: undefined,
                exifLoading: true,
                visionRequested: false,
                visionMatches: undefined,
                visionLoading: false,
            };
        });

        setUploadedFiles((prev) => [
            ...newFilesWithIds,
            ...prev,
        ]);

        newFilesWithIds.forEach(({ id }) => {
            startSimulatedUpload(id);
        });

        newFilesWithIds.forEach(({ id, fileObject }) => {
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
                const { base64 } = stripDataUrlPrefix(result);
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
            if (target?.previewUrl) {
                URL.revokeObjectURL(target.previewUrl);
            }
            return prev.filter((file) => file.id !== id);
        });
    };

    const handleAnalyzeFile = async (id: string) => {
        const file = uploadedFiles.find((uploadedFile) => uploadedFile.id === id);
        if (!file || file.analysisState !== "idle") {
            return;
        }

        const hasRequestedVision = Boolean(file.visionRequested);

        setUploadedFiles((prev) =>
            prev.map((uploadedFile) =>
                uploadedFile.id === id
                    ? {
                        ...uploadedFile,
                        analysisState: "loading",
                        analysisError: undefined,
                        sightengineConfidence: undefined,
                        visionRequested: true,
                        visionLoading: true,
                    }
                    : uploadedFile,
            ),
        );

        if (!hasRequestedVision) {
            const fileForVision: UploadedFile = {
                ...file,
                analysisState: "loading",
                visionRequested: true,
            };
            onVisionRequest?.(fileForVision);
        }

        try {
            if (!file.fileObject) {
                throw new Error("No file data available for analysis");
            }

            const score = await analyzeImageWithSightEngine(file.fileObject);
            const normalizedScore = Math.max(0, Math.min(1, score ?? 0));
            const confidence = Math.round(normalizedScore * 100);

            setUploadedFiles((prev) =>
                prev.map((uploadedFile) =>
                    uploadedFile.id === id
                        ? { ...uploadedFile, analysisState: "complete", sightengineConfidence: confidence }
                        : uploadedFile,
                ),
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
            }
        }
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
                        visionMatches: undefined,
                        visionLoading: false,
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
                        metadataLoading={Boolean(file.exifLoading)}
                    />
                ))}
            </FileUpload.List>
        </FileUpload.Root>
    );
};
