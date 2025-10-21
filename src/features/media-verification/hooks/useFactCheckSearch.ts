import { useMemo, useSyncExternalStore } from "react";

import { imageFactCheckSearch, type FactCheckClaim } from "@/features/media-verification/api/fact-check";

interface FactCheckSnapshot {
  claims: FactCheckClaim[];
  loading: boolean;
  error: string | null;
  hasSearched: boolean;
}

const DEFAULT_SNAPSHOT: FactCheckSnapshot = {
  claims: [],
  loading: false,
  error: null,
  hasSearched: false,
};

interface FactCheckEntry {
  state: FactCheckSnapshot;
  subscribers: Set<() => void>;
  initialized: boolean;
  controller: AbortController | null;
}

const entries = new Map<string, FactCheckEntry>();

const ensureEntry = (key: string) => {
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      state: DEFAULT_SNAPSHOT,
      subscribers: new Set(),
      initialized: false,
      controller: null,
    };
    entries.set(key, entry);
  }
  return entry;
};

const notify = (entry: FactCheckEntry, nextState: FactCheckSnapshot) => {
  entry.state = nextState;
  entry.subscribers.forEach((listener) => listener());
};

const queueStateUpdate = (entry: FactCheckEntry, updater: (prev: FactCheckSnapshot) => FactCheckSnapshot) => {
  queueMicrotask(() => {
    const next = updater(entry.state);
    if (next !== entry.state) {
      notify(entry, next);
    }
  });
};

const runFactCheck = (entry: FactCheckEntry, imageUrl: string, languageCode: string) => {
  const controller = new AbortController();
  entry.controller = controller;

  queueStateUpdate(entry, () => ({
    claims: [],
    loading: true,
    error: null,
    hasSearched: true,
  }));

  void imageFactCheckSearch(imageUrl, {
    signal: controller.signal,
    languageCode,
  })
    .then((response) => {
      queueStateUpdate(entry, () => {
        if (!response.claims.length) {
          return {
            claims: [],
            loading: false,
            error: "No fact check records were found for this image.",
            hasSearched: true,
          };
        }

        return {
          claims: response.claims,
          loading: false,
          error: null,
          hasSearched: true,
        };
      });
    })
    .catch((caught) => {
      if (controller.signal.aborted) {
        return;
      }
      const message =
        caught instanceof Error ? caught.message : "An unexpected error occurred while running the fact check.";
      queueStateUpdate(entry, () => ({
        claims: [],
        loading: false,
        error: message,
        hasSearched: true,
      }));
    })
    .finally(() => {
      if (entry.controller === controller) {
        entry.controller = null;
      }
    });
};

const resetEntryState = (entry: FactCheckEntry) => {
  queueStateUpdate(entry, () => DEFAULT_SNAPSHOT);
  if (entry.controller) {
    entry.controller.abort();
    entry.controller = null;
  }
};

export const useFactCheckSearch = (imageUrl: string, isEnabled: boolean) => {
  const normalizedUrl = useMemo(() => imageUrl.trim(), [imageUrl]);
  const key = useMemo(() => `${isEnabled ? "1" : "0"}|${normalizedUrl}`, [isEnabled, normalizedUrl]);
  const entry = ensureEntry(key);

  if (!entry.initialized) {
    entry.initialized = true;

    if (!isEnabled) {
      queueStateUpdate(entry, () => ({
        claims: [],
        loading: false,
        error: "Google Images fact check is disabled.",
        hasSearched: true,
      }));
    } else if (!normalizedUrl) {
      queueStateUpdate(entry, () => ({
        claims: [],
        loading: false,
        error: "Enter a publicly accessible image URL to run a fact check.",
        hasSearched: true,
      }));
    } else if (normalizedUrl.startsWith("blob:")) {
      queueStateUpdate(entry, () => ({
        claims: [],
        loading: false,
        error: "The fact check API requires an image URL that is publicly reachable on the internet.",
        hasSearched: true,
      }));
    } else {
      resetEntryState(entry);
      runFactCheck(entry, normalizedUrl, "en-US");
    }
  }

  return useSyncExternalStore(
    (listener) => {
      entry.subscribers.add(listener);
      return () => {
        entry.subscribers.delete(listener);
        if (!entry.subscribers.size) {
          if (entry.controller) {
            entry.controller.abort();
            entry.controller = null;
          }
          entries.delete(key);
        }
      };
    },
    () => entry.state,
    () => entry.state,
  );
};
