import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AppearanceSettings = {
  theme: "dark" | "light";
  uiOpacity: number; // 0..100
  uiBlur: number; // px
  backgroundBlur: number; // px
  backgroundImage: string; // "" or URL/dataURL
};

const STORAGE_KEY = "appearance_settings";

const DEFAULT_APPEARANCE: AppearanceSettings = {
  theme: "dark",
  uiOpacity: 80,
  uiBlur: 12,
  backgroundBlur: 0,
  backgroundImage: "",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function readStoredAppearance(): AppearanceSettings {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_APPEARANCE;
    const parsed = JSON.parse(raw) as Partial<AppearanceSettings> | null;
    if (!parsed || typeof parsed !== "object") return DEFAULT_APPEARANCE;
    const backgroundImage = typeof parsed.backgroundImage === "string" ? parsed.backgroundImage : DEFAULT_APPEARANCE.backgroundImage;
    const safeBackgroundImage = backgroundImage.length > 250_000 ? "" : backgroundImage;
    return {
      theme: parsed.theme === "light" ? "light" : "dark",
      uiOpacity: clamp(Number(parsed.uiOpacity ?? DEFAULT_APPEARANCE.uiOpacity), 0, 100),
      uiBlur: clamp(Number(parsed.uiBlur ?? DEFAULT_APPEARANCE.uiBlur), 0, 50),
      backgroundBlur: clamp(Number(parsed.backgroundBlur ?? DEFAULT_APPEARANCE.backgroundBlur), 0, 50),
      backgroundImage: safeBackgroundImage,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

function writeStoredAppearance(value: AppearanceSettings) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function applyAppearanceToDom(value: AppearanceSettings) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  root.classList.toggle("light", value.theme === "light");

  const alpha = clamp(value.uiOpacity / 100, 0, 1);
  const glassBg = value.theme === "light" ? `0 0% 100% / ${alpha}` : `220 16% 11% / ${alpha}`;
  root.style.setProperty("--glass-bg", glassBg);

  const borderAlpha = clamp(alpha * 0.08, 0.03, 0.12);
  const glassBorder = value.theme === "light" ? `220 16% 12% / ${borderAlpha}` : `220 10% 92% / ${borderAlpha}`;
  root.style.setProperty("--glass-border", glassBorder);

  root.style.setProperty("--glass-blur", `${clamp(value.uiBlur, 0, 50)}px`);
  root.style.setProperty("--app-bg-blur", `${clamp(value.backgroundBlur, 0, 50)}px`);

  const image = value.backgroundImage?.trim?.() ?? "";
  if (!image) {
    root.style.setProperty("--app-bg-image", "none");
  } else {
    const escaped = image.replace(/"/g, '\\"');
    root.style.setProperty("--app-bg-image", `url("${escaped}")`);
  }
}

type AppearanceContextValue = {
  appearance: AppearanceSettings;
  saveAppearance: (next: AppearanceSettings) => void;
  previewAppearance: (next: AppearanceSettings) => void;
  resetPreview: () => void;
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState<AppearanceSettings>(() => readStoredAppearance());

  const saveAppearance = useCallback((next: AppearanceSettings) => {
    setAppearance(next);
    writeStoredAppearance(next);
    applyAppearanceToDom(next);
  }, []);

  const previewAppearance = useCallback((next: AppearanceSettings) => {
    applyAppearanceToDom(next);
  }, []);

  const resetPreview = useCallback(() => {
    applyAppearanceToDom(appearance);
  }, [appearance]);

  useEffect(() => {
    applyAppearanceToDom(appearance);
  }, [appearance]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setAppearance(readStoredAppearance());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const value = useMemo<AppearanceContextValue>(
    () => ({ appearance, saveAppearance, previewAppearance, resetPreview }),
    [appearance, saveAppearance, previewAppearance, resetPreview],
  );

  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}

export function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within an AppearanceProvider");
  return ctx;
}
