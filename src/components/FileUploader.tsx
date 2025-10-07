import { useEffect, useRef, useState } from "react";
import { FileUpload } from "@/components/application/file-upload/file-upload-base";

const uploadFile = (file: File, onProgress: (progress: number) => void) => {
    // Add your upload logic here...

    // This is dummy upload logic
    let progress = 0;
    const interval = setInterval(() => {
        onProgress(++progress);
        if (progress === 100) {
            clearInterval(interval);
        }
    }, 100);
};

type AnalysisState = "idle" | "loading" | "complete";

interface UploadedFile {
    id: string;
    name: string;
    type?: string;
    size: number;
    progress: number;
    failed?: boolean;
    analysisState: AnalysisState;
}

const placeholderFiles: UploadedFile[] = [
    {
        id: "file-01",
        name: "Example dashboard screenshot.jpg",
        type: "jpg",
        size: 720 * 1024,
        progress: 50,
        analysisState: "idle",
    },
    {
        id: "file-02",
        name: "Tech design requirements_2.pdf",
        type: "pdf",
        size: 720 * 1024,
        progress: 100,
        analysisState: "idle",
    },
    {
        id: "file-03",
        name: "Tech design requirements.pdf",
        type: "pdf",
        failed: true,
        size: 1024 * 1024 * 1,
        progress: 0,
        analysisState: "idle",
    },
];

export const FileUploader = (props: { isDisabled?: boolean }) => {
    const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>(placeholderFiles);
    const analysisTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    useEffect(() => {
        return () => {
            Object.values(analysisTimers.current).forEach(clearTimeout);
        };
    }, []);

    const handleDropFiles = (files: FileList) => {
        const newFiles = Array.from(files);
        const newFilesWithIds = newFiles.map((file) => ({
            id: Math.random().toString(),
            name: file.name,
            size: file.size,
            type: file.type,
            progress: 0,
            analysisState: "idle" as AnalysisState,
            fileObject: file,
        }));

        setUploadedFiles((prev) => [...newFilesWithIds.map(({ fileObject: _, ...file }) => file), ...prev]);

        newFilesWithIds.forEach(({ id, fileObject }) => {
            uploadFile(fileObject, (progress) => {
                setUploadedFiles((prev) => prev.map((uploadedFile) => (uploadedFile.id === id ? { ...uploadedFile, progress } : uploadedFile)));
            });
        });
    };

    const handleDeleteFile = (id: string) => {
        if (analysisTimers.current[id]) {
            clearTimeout(analysisTimers.current[id]);
            delete analysisTimers.current[id];
        }
        setUploadedFiles((prev) => prev.filter((file) => file.id !== id));
    };

    const handleAnalyzeFile = (id: string) => {
        const file = uploadedFiles.find((uploadedFile) => uploadedFile.id === id);
        if (!file || file.analysisState !== "idle") {
            return;
        }

        setUploadedFiles((prev) => prev.map((uploadedFile) => (uploadedFile.id === id ? { ...uploadedFile, analysisState: "loading" } : uploadedFile)));

        analysisTimers.current[id] = setTimeout(() => {
            setUploadedFiles((prev) =>
                prev.map((uploadedFile) =>
                    uploadedFile.id === id ? { ...uploadedFile, analysisState: "complete" } : uploadedFile,
                ),
            );
            delete analysisTimers.current[id];
        }, 5000);
    };

    const handleRetryFile = (id: string) => {
        const file = uploadedFiles.find((file) => file.id === id);
        if (!file) return;

        uploadFile(new File([], file.name, { type: file.type }), (progress) => {
            setUploadedFiles((prev) =>
                prev.map((uploadedFile) =>
                    uploadedFile.id === id ? { ...uploadedFile, progress, failed: false, analysisState: "idle" } : uploadedFile,
                ),
            );
        });
    };

    const handleContinueFile = (_id: string) => {
        // Placeholder for future continue action.
    };

    return (
        <FileUpload.Root>
            <FileUpload.DropZone isDisabled={props.isDisabled} onDropFiles={handleDropFiles} />

            <FileUpload.List>
                {uploadedFiles.map((file) => (
                    <FileUpload.ListItemProgressFill
                        key={file.id}
                        {...file}
                        size={file.size}
                        onDelete={() => handleDeleteFile(file.id)}
                        onAnalyze={() => handleAnalyzeFile(file.id)}
                        onContinue={() => handleContinueFile(file.id)}
                        onRetry={() => handleRetryFile(file.id)}
                    />
                ))}
            </FileUpload.List>
        </FileUpload.Root>
    );
};
