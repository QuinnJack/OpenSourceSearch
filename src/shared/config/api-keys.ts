export type ApiKeyId =
  | "sightengine_user"
  | "sightengine_secret"
  | "google_fact_check"
  | "google_vision"
  | "gemini"
  | "google_maps"
  | "first_alerts"
  | "imgbb";

export type ApiKeySource = "override" | "environment" | "none";

import { CORS_PROXY_ORIGIN } from "@/shared/constants/network";

const STORAGE_PREFIX = "api-key:";
export const API_KEY_CHANGE_EVENT = "api-key:change";

const REMOTE_KEYS_URL_ENCODED = "aHR0cHM6Ly9jdXRlLXZhY2hlcmluLWIzZDZmNS5uZXRsaWZ5LmFwcC8ubmV0bGlmeS9mdW5jdGlvbnMva2V5cw==";

const getProxyPrefix = () => CORS_PROXY_ORIGIN.replace(/\/+$/, "") + "/";

const decodeBase64Url = (value: string): string => {
  if (typeof atob === "function") {
    return atob(value);
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(value, "base64").toString("utf-8");
  }
  return value;
};

const REMOTE_KEYS_URL = decodeBase64Url(REMOTE_KEYS_URL_ENCODED);
const REMOTE_KEYS_PROXY_URL = `${getProxyPrefix()}${REMOTE_KEYS_URL}`;

const ENV_KEY_MAP: Record<ApiKeyId, string> = {
  sightengine_user: "VITE_SIGHTENGINE_API_USER",
  sightengine_secret: "VITE_SIGHTENGINE_API_SECRET",
  google_fact_check: "VITE_GOOGLE_FACT_CHECK_API_KEY",
  google_vision: "VITE_GOOGLE_VISION_API_KEY",
  gemini: "VITE_GEMINI_API_KEY",
  google_maps: "VITE_GOOGLE_MAPS_API_KEY",
  first_alerts: "VITE_FIRST_ALERTS_TOKEN",
  imgbb: "VITE_IMGBB_API_KEY",
};

type RemoteKeyResponse = Record<string, string | undefined>;

const remoteKeyMap: Partial<Record<ApiKeyId, string>> = {};
let remoteKeyPromise: Promise<void> | null = null;

const applyRemoteKeys = (payload: RemoteKeyResponse) => {
  const imgbbKey = payload.VITE_IMGBB_API_KEY || payload.VITE_IMAGE_API_KEY;
  const mappings: Array<[ApiKeyId, string | undefined]> = [
    ["sightengine_user", payload.VITE_SIGHTENGINE_API_USER],
    ["sightengine_secret", payload.VITE_SIGHTENGINE_API_SECRET],
    ["google_fact_check", payload.VITE_GOOGLE_FACT_CHECK_API_KEY],
    ["google_vision", payload.VITE_GOOGLE_VISION_API_KEY],
    ["gemini", payload.VITE_GEMINI_API_KEY],
    ["google_maps", payload.VITE_GOOGLE_MAPS_API_KEY],
    ["first_alerts", payload.VITE_FIRST_ALERTS_TOKEN],
    ["imgbb", imgbbKey],
  ];

  mappings.forEach(([id, value]) => {
    if (typeof value === "string" && value.trim()) {
      remoteKeyMap[id] = value.trim();
    }
  });
};

const fetchRemoteKeys = async (): Promise<void> => {
  if (remoteKeyPromise) {
    return remoteKeyPromise;
  }
  remoteKeyPromise = (async () => {
    try {
      if (typeof fetch !== "function") {
        return;
      }
      const response = await fetch(REMOTE_KEYS_PROXY_URL, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Failed to fetch remote API keys: ${response.status}`);
      }
      const json = (await response.json()) as RemoteKeyResponse;
      applyRemoteKeys(json);
    } catch {
      // Swallow errors; callers can still fall back to env/local overrides.
    }
  })();
  return remoteKeyPromise;
};

export const ensureApiKeysLoaded = async (): Promise<void> => {
  await fetchRemoteKeys();
};

const readEnvValue = (id: ApiKeyId): string | undefined => {
  if (typeof import.meta === "undefined" || typeof import.meta.env !== "object") {
    return undefined;
  }

  const env = import.meta.env as Record<string, string | undefined>;
  const envKey = ENV_KEY_MAP[id];
  let envValue = env[envKey];
  if (!envValue && id === "imgbb") {
    envValue = env.VITE_IMAGE_API_KEY;
  }
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
  const remote = remoteKeyMap[id];
  if (remote) {
    return remote;
  }

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

void fetchRemoteKeys();
