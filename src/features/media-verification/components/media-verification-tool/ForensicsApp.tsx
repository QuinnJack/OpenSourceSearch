"use client";

import { useEffect, useRef } from "react";

import { FORENSICS_BASE_PATH, FORENSICS_STATIC_PATH } from "./forensicsPaths";

interface ForensicsAppProps {
  onMarkupReady?: () => void;
  onContainerReady?: (element: HTMLDivElement | null) => void;
}

let cachedMarkup: string | null = null;

async function fetchAppMarkup() {
  if (cachedMarkup || typeof window === "undefined") {
    return cachedMarkup;
  }

  try {
    const response = await fetch(`${FORENSICS_BASE_PATH}/index.html`);
    if (!response.ok) {
      return null;
    }

    const html = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const app = doc.querySelector(".app");

    if (!app) {
      return null;
    }

    rewriteAssetPaths(app);

    const wrapper = document.createElement("div");
    wrapper.appendChild(app);
    cachedMarkup = wrapper.innerHTML;
    return cachedMarkup;
  } catch (error) {
    console.error("Failed to fetch Forensics markup", error);
    return null;
  }
}

function rewriteAssetPaths(root: Element) {
  root.querySelectorAll<HTMLElement>("*").forEach((element) => {
    ["src", "href"].forEach((attr) => {
      const value = element.getAttribute(attr);
      if (value) {
        element.setAttribute(attr, transformUrl(value));
      }
    });

    const srcset = element.getAttribute("srcset");
    if (srcset) {
      element.setAttribute(
        "srcset",
        srcset
          .split(",")
          .map((entry) => {
            const [url, descriptor] = entry.trim().split(/\s+/, 2);
            const absoluteUrl = transformUrl(url);
            return descriptor ? `${absoluteUrl} ${descriptor}` : absoluteUrl;
          })
          .join(", "),
      );
    }
  });
}

function transformUrl(value: string) {
  if (value.startsWith("static/")) {
    return `${FORENSICS_STATIC_PATH}/${value.slice("static/".length)}`;
  }

  if (value.startsWith("/photo-forensics/static/")) {
    return value.replace("/photo-forensics/static", FORENSICS_STATIC_PATH);
  }

  if (value === "index.html") {
    return `${FORENSICS_BASE_PATH}/index.html`;
  }

  if (value === "manifest.json" || value === "manifest.webmanifest") {
    return `${FORENSICS_BASE_PATH}/${value}`;
  }

  return value;
}

export function ForensicsApp({ onMarkupReady, onContainerReady }: ForensicsAppProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let isMounted = true;
    const containerElement = containerRef.current;
    onContainerReady?.(containerElement);

    const loadMarkup = async () => {
      if (!isMounted || !containerElement) {
        return;
      }

      if (cachedMarkup) {
        containerElement.innerHTML = cachedMarkup;
        onMarkupReady?.();
        return;
      }

      const markup = await fetchAppMarkup();
      if (!isMounted || !markup || !containerElement) {
        return;
      }

      containerElement.innerHTML = markup;
      onMarkupReady?.();
    };

    loadMarkup();

    return () => {
      isMounted = false;
      if (containerElement) {
        containerElement.innerHTML = "";
      }
      onContainerReady?.(null);
    };
  }, [onContainerReady, onMarkupReady]);

  return <div ref={containerRef} data-forensics-app-container="true" suppressHydrationWarning />;
}
