import { useEffect, useMemo, useRef, useState } from "react";

import { imageFactCheckSearch, type FactCheckClaim } from "@/features/media-verification/api/fact-check";

export interface FactCheckState {
  claims: FactCheckClaim[];
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
}

const INITIAL_STATE: FactCheckState = {
  claims: [],
  loading: false,
  error: null,
  hasSearched: false,
};

export const useFactCheckSearch = (imageUrl: string, isEnabled: boolean): FactCheckState => {
  const [state, setState] = useState<FactCheckState>(INITIAL_STATE);
  const abortRef = useRef<AbortController | null>(null);
  const trimmedUrl = useMemo(() => imageUrl.trim(), [imageUrl]);

  useEffect(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }

    if (!isEnabled) {
      setState({
        claims: [],
        loading: false,
        error: "Google Images fact check is disabled.",
        hasSearched: true,
      });
      return;
    }

    if (!trimmedUrl) {
      setState({
        claims: [],
        loading: false,
        error: "Enter a publicly accessible image URL to run a fact check.",
        hasSearched: true,
      });
      return;
    }

    if (trimmedUrl.startsWith("blob:")) {
      setState({
        claims: [],
        loading: false,
        error: "The fact check API requires an image URL that is publicly reachable on the internet.",
        hasSearched: true,
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      claims: [],
      loading: true,
      error: null,
      hasSearched: true,
    });

    void imageFactCheckSearch(trimmedUrl, {
      signal: controller.signal,
      languageCode: "en-US",
    })
      .then((response) => {
        if (controller.signal.aborted) {
          return;
        }

        if (!response.claims.length) {
          setState({
            claims: [],
            loading: false,
            error: "No fact check records were found for this image.",
            hasSearched: true,
          });
          return;
        }

        setState({
          claims: response.claims,
          loading: false,
          error: null,
          hasSearched: true,
        });
      })
      .catch((caught) => {
        if (controller.signal.aborted) {
          return;
        }

        const message =
          caught instanceof Error ? caught.message : "An unexpected error occurred while running the fact check.";

        setState({
          claims: [],
          loading: false,
          error: message,
          hasSearched: true,
        });
      })
      .finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
        }
      });

    return () => {
      controller.abort();
    };
  }, [isEnabled, trimmedUrl]);

  return state;
};
