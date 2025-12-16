import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type BadgeStyle = "color" | "modern";

interface AppearanceContextValue {
  badgeStyle: BadgeStyle;
  setBadgeStyle: (style: BadgeStyle) => void;
}

const DEFAULT_BADGE_STYLE: BadgeStyle = "color";
const STORAGE_KEY = "ui-badge-style";

const AppearanceContext = createContext<AppearanceContextValue | undefined>(undefined);

const readStoredBadgeStyle = (): BadgeStyle => {
  if (typeof window === "undefined") {
    return DEFAULT_BADGE_STYLE;
  }

  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "modern" ? "modern" : DEFAULT_BADGE_STYLE;
};

export const AppearanceProvider = ({ children }: { children: ReactNode }) => {
  const [badgeStyle, setBadgeStyleState] = useState<BadgeStyle>(() => readStoredBadgeStyle());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY && event.newValue) {
        setBadgeStyleState(event.newValue === "modern" ? "modern" : DEFAULT_BADGE_STYLE);
      }
      if (event.key === STORAGE_KEY && event.newValue === null) {
        setBadgeStyleState(DEFAULT_BADGE_STYLE);
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const setBadgeStyle = (style: BadgeStyle) => {
    setBadgeStyleState(style);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, style);
    }
  };

  return (
    <AppearanceContext.Provider
      value={{
        badgeStyle,
        setBadgeStyle,
      }}
    >
      {children}
    </AppearanceContext.Provider>
  );
};

export const useOptionalAppearance = (): AppearanceContextValue | undefined => {
  return useContext(AppearanceContext);
};

export const useAppearance = (): AppearanceContextValue => {
  const context = useOptionalAppearance();
  if (!context) {
    throw new Error("useAppearance must be used within an AppearanceProvider");
  }
  return context;
};
