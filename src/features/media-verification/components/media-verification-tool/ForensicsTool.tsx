"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { MediaVerificationFile } from "./MediaVerificationTool.types";
import { ForensicsApp } from "./ForensicsApp";
import { FORENSICS_STATIC_PATH } from "./forensicsPaths";

const SCRIPT_SRC = `${FORENSICS_STATIC_PATH}/index-KedAvUpf.js`;
const STYLE_HREF = `${FORENSICS_STATIC_PATH}/index-CSGd95JJ.css`;
const STYLE_SELECTOR = 'link[data-forensics-style="true"]';
const SCRIPT_SELECTOR = 'script[data-forensics-script="true"]';

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  bmp: "image/bmp",
  tif: "image/tiff",
  tiff: "image/tiff",
  avif: "image/avif",
};

function ensureStylesLoaded() {
  if (typeof document === "undefined") {
    return;
  }

  const existing = document.querySelector(STYLE_SELECTOR) as HTMLLinkElement | null;
  if (existing) {
    return;
  }

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = STYLE_HREF;
  link.crossOrigin = "anonymous";
  link.dataset.forensicsStyle = "true";
  document.head.appendChild(link);
}

function inferMimeType(file?: MediaVerificationFile): string {
  const name = file?.name ?? "";
  const extension = name.split(".").pop()?.toLowerCase();
  if (extension && MIME_BY_EXTENSION[extension]) {
    return MIME_BY_EXTENSION[extension];
  }
  return "image/jpeg";
}

function base64ToBlob(base64: string, mimeType: string): Blob {
  const sliceSize = 512;
  const byteCharacters = atob(base64);
  const byteArrays: Uint8Array[] = [];

  for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
    const slice = byteCharacters.slice(offset, offset + sliceSize);
    const byteNumbers = new Array<number>(slice.length);
    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i);
    }
    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: mimeType });
}

async function buildFileFromMedia(file?: MediaVerificationFile): Promise<File | null> {
  if (!file) {
    return null;
  }

  const mimeType = inferMimeType(file);
  let blob: Blob | null = null;

  if (file.base64Content) {
    blob = base64ToBlob(file.base64Content, mimeType);
  } else if (file.previewUrl) {
    try {
      const response = await fetch(file.previewUrl);
      if (response.ok) {
        blob = await response.blob();
      }
    } catch (error) {
      console.warn("Failed to fetch preview URL for forensic analysis", error);
    }
  } else if (file.sourceUrl) {
    try {
      const response = await fetch(file.sourceUrl, { mode: "cors" });
      if (response.ok) {
        blob = await response.blob();
      }
    } catch (error) {
      console.warn("Failed to fetch source URL for forensic analysis", error);
    }
  }

  if (!blob) {
    return null;
  }

  return new File([blob], file.name || "uploaded-image", {
    type: blob.type || mimeType,
  });
}

async function waitForFileInputs(root: HTMLElement | null, attempts = 20, delayMs = 250) {
  if (!root) {
    return [];
  }

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"][name="file"]'));
    if (inputs.length > 0) {
      return inputs;
    }

    await new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
  }

  return [];
}

export interface ForensicsToolProps {
  file?: MediaVerificationFile;
}

export function ForensicsTool({ file }: ForensicsToolProps) {
  const [scriptReady, setScriptReady] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    ensureStylesLoaded();
  }, []);

  const ensureScriptLoaded = useCallback(() => {
    if (scriptPromiseRef.current) {
      return scriptPromiseRef.current;
    }

    scriptPromiseRef.current = new Promise<void>((resolve, reject) => {
      if (typeof document === "undefined") {
        resolve();
        return;
      }

      const existing = document.querySelector<HTMLScriptElement>(SCRIPT_SELECTOR);
      if (existing) {
        if (existing.dataset.loaded === "true") {
          resolve();
          return;
        }

        const handleLoad = () => {
          existing.dataset.loaded = "true";
          existing.removeEventListener("load", handleLoad);
          existing.removeEventListener("error", handleError);
          resolve();
        };

        const handleError = () => {
          existing.removeEventListener("load", handleLoad);
          existing.removeEventListener("error", handleError);
          reject(new Error("Failed to load photo-forensics script"));
        };

        existing.addEventListener("load", handleLoad);
        existing.addEventListener("error", handleError);
        return;
      }

      const script = document.createElement("script");
      script.type = "module";
      script.src = SCRIPT_SRC;
      script.crossOrigin = "anonymous";
      script.dataset.forensicsScript = "true";

      script.addEventListener(
        "load",
        () => {
          script.dataset.loaded = "true";
          resolve();
        },
        { once: true },
      );

      script.addEventListener(
        "error",
        () => {
          reject(new Error("Failed to load photo-forensics script"));
        },
        { once: true },
      );

      document.body.appendChild(script);
    });

    return scriptPromiseRef.current;
  }, []);

  useEffect(() => {
    let isMounted = true;

    ensureScriptLoaded()
      .then(() => {
        if (isMounted) {
          setScriptReady(true);
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      isMounted = false;
    };
  }, [ensureScriptLoaded]);

  useEffect(() => {
    let cancelled = false;

    const pushFileToTool = async () => {
      if (!file || !scriptReady) {
        return;
      }

      const host = containerRef.current;
      if (!host) {
        return;
      }

      const appRoot = host.querySelector<HTMLElement>('[data-forensics-app="root"]');
      const inputs = await waitForFileInputs(appRoot ?? host);
      if (!inputs.length || cancelled) {
        return;
      }

      if (typeof DataTransfer === "undefined") {
        console.warn("DataTransfer is unavailable; cannot sync image with forensics tool.");
        return;
      }

      const mediaFile = await buildFileFromMedia(file);
      if (!mediaFile || cancelled) {
        return;
      }

      inputs.forEach((input) => {
        const transfer = new DataTransfer();
        transfer.items.add(mediaFile);
        input.files = transfer.files;
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
    };

    pushFileToTool();

    return () => {
      cancelled = true;
    };
  }, [file, scriptReady]);

  return (
    <div className="relative min-h-[600px]">
      <div ref={containerRef} className="forensics-tool">
        <ForensicsApp />
      </div>
    </div>
  );
}
