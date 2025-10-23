"use client";

import { type ComponentProps, useEffect, useRef } from "react";
import { FileIcon } from "@untitledui/file-icons";
import { motion, useMotionValue, useSpring } from "framer-motion";

interface DraggableProps {
    name: string;
    type: string;
    size: number;
    /** Public path served by the app (e.g. from /public) to build file content. */
    localPath?: string;
    /** Publicly reachable URL for fact checking (persisted onto the File as sourceUrl). */
    sourceUrl?: string;
    fileIconType?: ComponentProps<typeof FileIcon>["type"];
    theme?: ComponentProps<typeof FileIcon>["variant"];
}

export function Draggable({ name, type, size, localPath, sourceUrl, fileIconType, theme }: DraggableProps) {
    const constraintsRef = useRef<HTMLDivElement>(null);
    const ref = useRef<HTMLDivElement | null>(null);
    const dropzoneRef = useRef<HTMLDivElement | null>(null);
    const scaleValue = useMotionValue(1);
    const scale = useSpring(scaleValue, {
        damping: 30,
        bounce: 0.1,
        stiffness: 300,
    });

    useEffect(() => {
        if (!ref.current) return;

        const dropzones = document.querySelectorAll("[data-dropzone]");

        const constraintParent = ref.current.closest("[data-drag-constraint]");

        if (constraintParent) {
            constraintsRef.current = constraintParent as HTMLDivElement;
        }

        // If there are multiple dropzones, use the one inside [data-drag-constraint] parent
        if (dropzones.length > 1 && constraintParent) {
            dropzoneRef.current = constraintParent.querySelector("[data-dropzone]");
        } else {
            dropzoneRef.current = dropzones[0] as HTMLDivElement;
        }
    }, []);

    const checkDropzoneIntersection = (point: { x: number; y: number }) => {
        if (!dropzoneRef.current) return false;
        const rect = dropzoneRef.current.getBoundingClientRect();
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;

        // Adjust point coordinates for scroll position
        const adjustedX = point.x - scrollX;
        const adjustedY = point.y - scrollY;

        return adjustedX >= rect.left && adjustedX <= rect.right && adjustedY >= rect.top && adjustedY <= rect.bottom;
    };

    return (
        <motion.div
            ref={ref}
            drag
            dragMomentum={false}
            dragConstraints={constraintsRef}
            onDrag={(_event, info) => {
                if (dropzoneRef.current) {
                    const isOverDropzone = checkDropzoneIntersection(info.point);

                    // Dispatch dragover/dragleave events
                    if (isOverDropzone) {
                        const dragOverEvent = new DragEvent("dragover", {
                            bubbles: true,
                            cancelable: true,
                        });
                        dropzoneRef.current.dispatchEvent(dragOverEvent);
                    } else {
                        const dragLeaveEvent = new DragEvent("dragleave", {
                            bubbles: true,
                            cancelable: true,
                        });
                        dropzoneRef.current.dispatchEvent(dragLeaveEvent);
                    }
                }
            }}
            onDragEnd={async (_event, info) => {
                // Simulate file drop when dragged over dropzone
                if (dropzoneRef.current) {
                    const isOverDropzone = checkDropzoneIntersection(info.point);
                    if (isOverDropzone) {
                        const fileDate = new Date().toISOString();

                        // Build a File using provided localPath if possible; otherwise fallback to random buffer
                        const buildFile = async (): Promise<File> => {
                            if (localPath) {
                                try {
                                    const resp = await fetch(localPath);
                                    if (resp.ok) {
                                        const blob = await resp.blob();
                                        return new File([blob], name, {
                                            type: blob.type || type,
                                            lastModified: Date.now(),
                                        });
                                    }
                                } catch {
                                    // fall through to random buffer
                                }
                            }

                            const buffer = new ArrayBuffer(size);
                            const view = new Uint8Array(buffer);
                            for (let i = 0; i < size; i++) {
                                view[i] = Math.floor(Math.random() * 256);
                            }
                            return new File([buffer], name, {
                                type,
                                lastModified: Date.now(),
                            });
                        };

                        const file = await buildFile();

                        // Attach provided sourceUrl for downstre am consumers (used for fact-checking)
                        if (sourceUrl) {
                            try {
                                (file as unknown as { sourceUrl?: string }).sourceUrl = sourceUrl;
                            } catch {
                                // non-fatal; continue without sourceUrl
                            }
                        }

                        const fileData = {
                            name: file.name,
                            size: file.size,
                            type: file.type,
                            lastModified: file.lastModified,
                            lastModifiedDate: fileDate,
                            webkitRelativePath: "",
                        };

                        // Create DataTransfer and add the file
                        const dataTransfer = new DataTransfer();
                        dataTransfer.items.add(file);

                        const dropEvent = new DragEvent("drop", {
                            dataTransfer,
                            bubbles: true,
                            cancelable: true,
                        });

                        Object.defineProperty(dropEvent.dataTransfer, "getData", {
                            value: () => JSON.stringify(fileData),
                        });

                        dropzoneRef.current.dispatchEvent(dropEvent);
                        scale.set(0);
                    }
                }
            }}
            style={{
                scale,
            }}
            className="group/drag z-10 flex flex-col items-center gap-1 self-start p-2 outline-none"
            tabIndex={0}
        >
            <div className="rounded-md p-1.5 group-focus/drag:bg-tertiary group-focus/drag:ring-[0.5px] group-focus/drag:ring-black/5 group-focus/drag:ring-inset">
                <FileIcon
                    type={fileIconType || type}
                    variant={theme}
                    className="pointer-events-none size-8 sm:size-10"
                />
            </div>
            <p className="line-clamp-2 block max-w-50 rounded text-center text-sm font-medium text-ellipsis text-primary">
                <span className="rounded box-decoration-clone px-[3.5px] py-[0.5px] group-focus/drag:bg-brand-700 group-focus/drag:text-white group-focus/drag:ring-[0.5px] group-focus/drag:ring-black/10 group-focus/drag:ring-inset">
                    {name}
                </span>
            </p>
        </motion.div>
    );
}
