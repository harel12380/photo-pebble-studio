/**
 * Theme store — a reactive light/dark mode for the studio. Mirrors the i18n
 * module's shape (a signal + setters + persistence), but the theme is global
 * (not context-scoped) since it lives on <html> and is read by Tailwind's
 * `dark:` utilities via the `dark` class.
 *
 * Applied by toggling `document.documentElement.classList`'s `dark` class and
 * setting `style.colorScheme`. The chosen theme persists to localStorage and is
 * applied once at module init, so there's no flash on subsequent loads.
 */
import { createSignal, type Accessor } from "solid-js";

export type Theme = "light" | "dark";

const STORAGE_KEY = "pebble.theme";

function detectInitialTheme(): Theme {
  // An explicit choice (the user toggled before) always wins.
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "light" || saved === "dark") return saved;
  }
  // Otherwise default to dark — only fall back to light if the OS explicitly
  // prefers light.
  if (
    typeof matchMedia !== "undefined" &&
    matchMedia("(prefers-color-scheme: light)").matches
  ) {
    return "light";
  }
  return "dark";
}

function applyTheme(t: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", t === "dark");
  document.documentElement.style.colorScheme = t;
}

const [theme, setThemeSignal] = createSignal<Theme>(detectInitialTheme());

export const setTheme = (t: Theme): void => {
  setThemeSignal(t);
  applyTheme(t);
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* ignore */
    }
  }
};

export const toggleTheme = (): void => {
  setTheme(theme() === "dark" ? "light" : "dark");
};

// Apply once at module init so the class is on <html> before first paint.
applyTheme(theme());

export { theme };
export type { Accessor };
