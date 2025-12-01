export type ApiToggleKey = "sightengine" | "google_images" | "google_vision" | "geolocation";

const DEFAULT_TOGGLES: Record<ApiToggleKey, boolean> = {
  sightengine: false,
  google_images: false,
  google_vision: false,
  geolocation: false,
};

const toBoolean = (value: string | undefined | null): boolean | undefined => {
  if (value == null) {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }

  return undefined;
};

const readEnvToggle = (key: ApiToggleKey): boolean | undefined => {
  const envKey = `VITE_API_ENABLE_${key.toUpperCase()}`;

  if (typeof import.meta === "undefined" || typeof import.meta.env !== "object") {
    return undefined;
  }

  const env = import.meta.env as Record<string, string | undefined>;
  return toBoolean(env[envKey]);
};

const readStorageToggle = (key: ApiToggleKey): boolean | undefined => {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const storedValue = window.localStorage.getItem(`api-toggle:${key}`);
    return toBoolean(storedValue);
  } catch {
    return undefined;
  }
};

export const isApiEnabled = (key: ApiToggleKey): boolean => {
  const storageOverride = readStorageToggle(key);
  if (typeof storageOverride === "boolean") {
    return storageOverride;
  }

  const envOverride = readEnvToggle(key);
  if (typeof envOverride === "boolean") {
    return envOverride;
  }

  return DEFAULT_TOGGLES[key];
};

export const setApiToggleOverride = (key: ApiToggleKey, enabled: boolean) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(`api-toggle:${key}`, String(enabled));
  } catch {
    // Silently ignore storage errors; toggles are a dev convenience.
  }
};

export const clearApiToggleOverride = (key: ApiToggleKey) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.removeItem(`api-toggle:${key}`);
  } catch {
    // Silently ignore storage errors; toggles are a dev convenience.
  }
};
