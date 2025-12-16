import { useEffect, useMemo, useRef, useState } from "react";

interface PublicationDateResult {
  url: string;
  originalDate: string | null;
  lastUpdate: string | null;
  status: "idle" | "loading" | "success" | "error";
  error?: string | null;
}

const REQUEST_EVENT = "htmldate:request";
const RESPONSE_EVENT = "htmldate:response";
const BRIDGE_EVENT = "htmldate:bridge-ready";

const generateRequestId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const toValidUrl = (candidate: string | undefined | null) => {
  if (!candidate) {
    return null;
  }
  try {
    const parsed = new URL(candidate.trim());
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

export const usePublicationDates = (inputs: string[]) => {
  const [bridgeReady, setBridgeReady] = useState<boolean>(() => typeof window !== "undefined" && Boolean(window.__htmldateBridgeReady));
  const [results, setResults] = useState<Record<string, PublicationDateResult>>({});

  const requestIdToUrl = useRef<Map<string, string>>(new Map());
  const requestedUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handleBridgeReady = () => setBridgeReady(true);
    window.addEventListener(BRIDGE_EVENT, handleBridgeReady as EventListener);
    if (window.__htmldateBridgeReady) {
      setBridgeReady(true);
    }
    return () => window.removeEventListener(BRIDGE_EVENT, handleBridgeReady as EventListener);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }
    const handleResponse = (event: Event) => {
      const detail = (event as CustomEvent<HtmlDateWorkerResponseDetail>).detail || {};
      const targetUrl = detail.url ?? requestIdToUrl.current.get(detail.id ?? "");
      if (!targetUrl) {
        return;
      }
      if (detail.id) {
        requestIdToUrl.current.delete(detail.id);
      }

      setResults((prev) => ({
        ...prev,
        [targetUrl]: {
          url: targetUrl,
          originalDate: detail.originalDate ?? null,
          lastUpdate: detail.lastUpdate ?? null,
          status: detail.error ? "error" : "success",
          error: detail.error ?? null,
        },
      }));
    };

    window.addEventListener(RESPONSE_EVENT, handleResponse as EventListener);
    return () => window.removeEventListener(RESPONSE_EVENT, handleResponse as EventListener);
  }, []);

  useEffect(() => {
    if (!bridgeReady || typeof window === "undefined") {
      return;
    }

    const uniqueUrls = Array.from(
      new Set(
        inputs
          .map((value) => toValidUrl(value))
          .filter((value): value is string => Boolean(value)),
      ),
    );

    uniqueUrls.forEach((url) => {
      if (requestedUrls.current.has(url)) {
        return;
      }

      requestedUrls.current.add(url);
      const requestId = generateRequestId();
      requestIdToUrl.current.set(requestId, url);

      setResults((prev) => ({
        ...prev,
        [url]: {
          url,
          originalDate: prev[url]?.originalDate ?? null,
          lastUpdate: prev[url]?.lastUpdate ?? null,
          status: "loading",
          error: null,
        },
      }));

      window.dispatchEvent(new CustomEvent(REQUEST_EVENT, { detail: { id: requestId, url } }));
    });
  }, [inputs, bridgeReady]);

  const stableResults = useMemo(() => results, [results]);

  return {
    ready: bridgeReady,
    results: stableResults,
  };
};
