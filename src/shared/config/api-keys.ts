export type ApiKeyId =
  | "sightengine_user"
  | "sightengine_secret"
  | "google_fact_check"
  | "google_vision"
  | "gemini"
  | "google_maps"
  | "first_alerts";

export type ApiKeySource = "override" | "environment" | "none";

const STORAGE_PREFIX = "api-key:";
export const API_KEY_CHANGE_EVENT = "api-key:change";

const ENV_KEY_MAP: Record<ApiKeyId, string> = {
  sightengine_user: "VITE_SIGHTENGINE_API_USER",
  sightengine_secret: "VITE_SIGHTENGINE_API_SECRET",
  google_fact_check: "VITE_GOOGLE_FACT_CHECK_API_KEY",
  google_vision: "VITE_GOOGLE_VISION_API_KEY",
  gemini: "VITE_GEMINI_API_KEY",
  google_maps: "VITE_GOOGLE_MAPS_API_KEY",
  first_alerts: "VITE_FIRST_ALERTS_TOKEN",
};

const readEnvValue = (id: ApiKeyId): string | undefined => {
  if (typeof import.meta === "undefined" || typeof import.meta.env !== "object") {
    return undefined;
  }

  const env = import.meta.env as Record<string, string | undefined>;
  const envKey = ENV_KEY_MAP[id];
  const envValue = env[envKey];
  return typeof envValue === "string" && envValue.trim().length > 0 ? envValue : undefined;
};

const readStoredValue = (id: ApiKeyId): string | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`);
    return typeof stored === "string" && stored.trim().length > 0 ? stored : undefined;
  } catch {
    return undefined;
  }
};

const emitKeyChange = (id: ApiKeyId) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.dispatchEvent(new CustomEvent(API_KEY_CHANGE_EVENT, { detail: { id } }));
  } catch {
    // Ignore cases where CustomEvent is unavailable.
  }
};

export const getApiKey = (id: ApiKeyId): string | undefined => {
  const stored = readStoredValue(id);
  if (stored) {
    return stored;
  }
  return readEnvValue(id);
};

export const getStoredApiKey = (id: ApiKeyId): string | undefined => readStoredValue(id);

export const setApiKeyOverride = (id: ApiKeyId, value: string | undefined) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const trimmed = (value ?? "").trim();
    if (trimmed) {
      window.localStorage.setItem(`${STORAGE_PREFIX}${id}`, trimmed);
    } else {
      window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
    }
    emitKeyChange(id);
  } catch {
    // Silently ignore storage errors to avoid interrupting user flows.
  }
};

export const clearApiKeyOverride = (id: ApiKeyId) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${id}`);
    emitKeyChange(id);
  } catch {
    // Ignore
  }
};

export const getApiKeySource = (id: ApiKeyId): ApiKeySource => {
  if (readStoredValue(id)) {
    return "override";
  }
  if (readEnvValue(id)) {
    return "environment";
  }
  return "none";
};

export const isApiKeyConfigured = (id: ApiKeyId): boolean => typeof getApiKey(id) === "string";
