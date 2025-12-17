
import { useEffect, useRef, useState, useCallback } from "react";
import { cx } from "@/utils/cx";
// @ts-ignore
import { ensureGlobustVPWorker } from "../../utils/pyscript-loader";
import type { MediaVerificationFile } from "./MediaVerificationTool.types";

interface VanishingPointsToolProps {
    file: MediaVerificationFile | null;
    isActive: boolean;
}

interface VPResult {
    status: string;
    lines: number[][]; // [x1, y1, x2, y2]
    vps_3d: number[][]; // [x, y, z]
    vps_2d: (number[] | string)[]; // [x, y] or "infinity"
    associations: number[]; // Index of VP for each line
    error?: string;
    message?: string;
}

export function VanishingPointsTool({ file, isActive }: VanishingPointsToolProps) {
    const [status, setStatus] = useState<"idle" | "loading" | "ready" | "processing" | "success" | "error">("idle");
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const overlayRef = useRef<HTMLCanvasElement>(null);
    const [imgElement, setImgElement] = useState<HTMLImageElement | null>(null);

    // Lazy load worker with bridge check
    useEffect(() => {
        if (isActive && status === "idle") {
            setStatus("loading");

            let cancelled = false;

            const initWorker = async () => {
                console.log("[VP] initWorker started.");
                try {
                    console.log("[VP] Calling ensureGlobustVPWorker...");
                    await ensureGlobustVPWorker();
                    console.log("[VP] ensureGlobustVPWorker completed.");

                    const scriptEl = document.getElementById("globustvp-worker-script") as any;
                    const startTime = Date.now();

                    // Poll for bridge ready
                    let attempts = 0;
                    while (Date.now() - startTime < 30000) {
                        if (cancelled) return;
                        attempts++;

                        const worker = scriptEl?.xworker;
                        // Log every attempt for now since it's hanging
                        console.log(`[VP] Polling (attempt ${attempts}). Keys:`, worker ? Object.keys(worker) : "null");
                        if (worker) {
                            // Check for exports or direct
                            console.log(`[VP] worker.exports:`, worker.exports);
                            console.log(`[VP] worker.process_image_sync:`, typeof worker.process_image_sync);
                            console.log(`[VP] worker.sync:`, typeof worker.sync);
                        }

                        if (worker?.process_image_sync || worker?.sync?.process_image_sync) {
                            console.log("[VP] Bridge ready.");
                            setStatus("ready");
                            return;
                        }

                        // Wait 500ms
                        await new Promise(r => setTimeout(r, 500));
                    }

                    throw new Error("Timeout waiting for Python bridge.");
                } catch (err: any) {
                    if (!cancelled) {
                        setStatus("error");
                        setErrorMessage("Failed to load forensics engine: " + err.message);
                    }
                }
            };

            initWorker();

            return () => { cancelled = true; };
        }
    }, [isActive, status]);

    // Load image
    useEffect(() => {
        if (!file) return;

        const url = file.sourceUrl || file.previewUrl;
        if (!url) return;

        // Create image element to get dims and data
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
            setImgElement(img);
        };
        img.src = url;
    }, [file]);

    // Process logic
    const processImage = useCallback(async () => {
        if (!imgElement || status !== "ready") return;

        setStatus("processing");
        setErrorMessage(null);

        try {
            // 1. Draw to canvas to get data
            const width = imgElement.naturalWidth;
            const height = imgElement.naturalHeight;

            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) throw new Error("Could not get canvas context");

            ctx.drawImage(imgElement, 0, 0);
            console.log("[VP] Processing started. Context created.");
            // Use Base64 to avoid bridge complexity
            const base64Str = canvas.toDataURL("image/jpeg", 0.9);
            console.log("[VP] Image encoded.", base64Str.slice(0, 50) + "...");

            // 2. Call Worker
            const scriptEl = document.getElementById("globustvp-worker-script") as any;
            const worker = scriptEl?.xworker;

            console.log("[VP] Worker found:", worker);
            console.log("[VP] Worker sync:", worker?.sync);

            if (!worker) {
                throw new Error("Worker bridge not found.");
            }

            // 3. Process
            console.log("[VP] Calling process_image_sync...");
            let jsonStr;

            // Prefer direct export access (via __export__)
            if (worker.process_image_sync) {
                console.log("[VP] Using direct worker.process_image_sync");
                jsonStr = await worker.process_image_sync(base64Str);
            } else if (worker.sync && worker.sync.process_image_sync) {
                console.log("[VP] Using worker.sync.process_image_sync");
                jsonStr = await worker.sync.process_image_sync(base64Str);
            } else {
                throw new Error("Worker function not found (neither direct nor sync).");
            }

            console.log("[VP] Result received (len):", jsonStr?.length);
            const result: VPResult = JSON.parse(jsonStr);

            if (result.status === "success") {
                drawResults(result, width, height);
                setStatus("success");
            } else {
                throw new Error(result.error || result.message || "Unknown error");
            }

        } catch (e: any) {
            console.error(e);
            setStatus("error");
            setErrorMessage(e.message);
        }
    }, [imgElement, status]);

    // Trigger processing when ready
    useEffect(() => {
        if (isActive && status === "ready" && imgElement) {
            // Debounce or just run
            // Give UI a moment to show "Processing..." state
            const t = setTimeout(() => {
                processImage();
            }, 100);
            return () => clearTimeout(t);
        }
    }, [isActive, status, imgElement, processImage]);

    const drawResults = (result: VPResult, width: number, height: number) => {
        const canvas = overlayRef.current;
        if (!canvas) return;

        // Fit canvas to container, but coordinate system is image space.
        // We should probably style the canvas to match image aspect ratio.
        // For simplicity, we set canvas resolution to image res, and CSS limits size.
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.clearRect(0, 0, width, height);

        // Colors for 3 VPs
        const colors = ["#ff0000", "#00ff00", "#0000ff"];

        // Draw Lines
        result.lines.forEach((line, idx) => {
            const vpIdx = result.associations[idx];
            if (vpIdx >= 0 && vpIdx < 3) {
                ctx.strokeStyle = colors[vpIdx];
                ctx.lineWidth = 2; // Fixed width in image pixels might be too thin/thick
                // Scale linewidth?
                ctx.lineWidth = Math.max(2, width / 500);

                ctx.beginPath();
                ctx.moveTo(line[0], line[1]);
                ctx.lineTo(line[2], line[3]);
                ctx.stroke();
            }
        });

        // Draw VPs
        result.vps_2d.forEach((vp, idx) => {
            if (Array.isArray(vp)) {
                const [x, y] = vp;
                // Draw X
                ctx.strokeStyle = colors[idx];
                ctx.fillStyle = "white"; // "white" bg for contrast?
                ctx.lineWidth = Math.max(3, width / 300);

                const size = Math.max(10, width / 50);

                ctx.beginPath();
                ctx.arc(x, y, size / 2, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Text?
                // ctx.strokeText(`VP${idx+1}`, x + size, y);
            }
        });
    };

    if (!file) return null;

    return (
        <div className={cx("relative w-full h-full flex flex-col", isActive ? "flex" : "hidden")}>
            {/* Status Bar */}
            <div className="absolute top-4 left-4 z-10 flex gap-2">
                {status === "loading" && <div className="bg-black/70 text-white px-3 py-1 rounded">Loading engine...</div>}
                {status === "processing" && <div className="bg-blue-600/90 text-white px-3 py-1 rounded animate-pulse">Analyzing Lines...</div>}
                {status === "error" && <div className="bg-red-600/90 text-white px-3 py-1 rounded">Error: {errorMessage}</div>}
            </div>

            {/* Main Viewport */}
            <div className="flex-1 relative overflow-auto bg-gray-900 flex items-center justify-center p-4">
                <div className="relative shadow-2xl">
                    {/* Base Image */}
                    {/* We show the original image, and overlay canvas on top */}
                    {imgElement && (
                        <img
                            src={imgElement.src}
                            alt="Analysis Target"
                            className="max-w-full max-h-[80vh] object-contain block"
                        />
                    )}

                    {/* Overlay Canvas */}
                    {/* Position absolute over the img. 
                  We need to match the rendered size of img.
                  Instead of complex resize observers, we can just put canvas INSTEAD of img?
                  No, we want to see original pixels clearly.
                  CSS Grid trick or absolute positioning.
               */}
                    <canvas
                        ref={overlayRef}
                        className="absolute top-0 left-0 w-full h-full pointer-events-none mix-blend-screen"
                    // Note: w-full h-full matches the CONTAINER (the div relative wrapper).
                    // The img defines the container size if we wrap them tight.
                    />
                </div>
            </div>

            {/* Instructions / Legend */}
            {status === "success" && (
                <div className="p-4 bg-gray-800 text-gray-200 text-sm border-t border-gray-700 flex gap-4 justify-center">
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#ff0000]"></span> X-Axis</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#00ff00]"></span> Y-Axis</div>
                    <div className="flex items-center gap-2"><span className="w-3 h-3 rounded-full bg-[#0000ff]"></span> Z-Axis</div>
                </div>
            )}
        </div>
    );
}
