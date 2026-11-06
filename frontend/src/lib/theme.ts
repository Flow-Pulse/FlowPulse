export type Theme = "light" | "dark" | "system";

const STORAGE_KEY = "flowpulse_theme";

function getStorage(): Storage | null {
  try {
    if (typeof localStorage !== "undefined") return localStorage;
    if (typeof window !== "undefined" && window.localStorage) return window.localStorage;
  } catch {
    // Storage access may throw in restricted iframes
  }
  return null;
}

/**
 * Returns current stored theme preference ("light" | "dark" | "system").
 */
export function getStoredTheme(): Theme {
  const s = getStorage();
  if (!s) return "system";
  const val = s.getItem(STORAGE_KEY);
  if (val === "light" || val === "dark") return val;
  return "system";
}

/**
 * Resolves effective theme ("light" | "dark") based on current preference and system media query.
 */
export function getResolvedTheme(pref: Theme = getStoredTheme()): "light" | "dark" {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  if (typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * Applies the given theme preference to the document element (html) and persists in storage.
 */
export function applyTheme(theme: Theme): void {
  const root = typeof document !== "undefined" ? document.documentElement : null;
  const s = getStorage();

  if (theme === "system") {
    if (s) s.removeItem(STORAGE_KEY);
    if (root) root.classList.remove("dark", "light");
  } else {
    if (s) s.setItem(STORAGE_KEY, theme);
    if (root) {
      if (theme === "dark") {
        root.classList.add("dark");
        root.classList.remove("light");
      } else {
        root.classList.add("light");
        root.classList.remove("dark");
      }
    }
  }
}

/**
 * Initializes theme listener on app startup.
 */
export function initTheme(): () => void {
  const current = getStoredTheme();
  applyTheme(current);

  if (typeof window === "undefined" || !window.matchMedia) return () => {};

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const listener = () => {
    if (getStoredTheme() === "system") {
      applyTheme("system");
    }
  };

  if (media.addEventListener) {
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }
  return () => {};
}
