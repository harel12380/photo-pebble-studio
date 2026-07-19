/**
 * Tiny i18n for Solid: a context exposing a reactive `locale`, a `t(key)`
 * translator with `{name}` interpolation, and the writing `dir`. The chosen
 * locale is persisted and applied to <html lang/dir> so RTL works app-wide.
 */
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  useContext,
  type Accessor,
  type ParentComponent,
} from "solid-js";
import {
  DEFAULT_LOCALE,
  dictionaries,
  localeDir,
  LOCALES,
  type Locale,
} from "./dictionaries";

const STORAGE_KEY = "pebble.locale";

function detectInitialLocale(): Locale {
  if (typeof localStorage !== "undefined") {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LOCALES as readonly string[]).includes(saved)) {
      return saved as Locale;
    }
  }
  if (typeof navigator !== "undefined" && navigator.language?.startsWith("en")) {
    return "en";
  }
  return DEFAULT_LOCALE;
}

export interface I18nContextValue {
  locale: Accessor<Locale>;
  setLocale: (l: Locale) => void;
  /** Translate a key, interpolating `{name}` from `params`. Falls back to key. */
  t: (key: string, params?: Record<string, string | number>) => string;
  dir: Accessor<"rtl" | "ltr">;
}

const I18nContext = createContext<I18nContextValue>();

export const I18nProvider: ParentComponent = (props) => {
  const [locale, setLocaleSignal] = createSignal<Locale>(detectInitialLocale());

  const setLocale = (l: Locale) => {
    setLocaleSignal(l);
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* ignore */
      }
    }
  };

  const dir = createMemo(() => localeDir(locale()));

  createEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = locale();
      document.documentElement.dir = dir();
    }
  });

  const t = (key: string, params?: Record<string, string | number>): string => {
    const dict = dictionaries[locale()];
    let s = dict[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(v));
      }
    }
    return s;
  };

  const value: I18nContextValue = { locale, setLocale, t, dir };
  return (
    <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
  );
};

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within <I18nProvider>");
  return ctx;
}

export { LOCALES, localeLabel } from "./dictionaries";
export type { Locale } from "./dictionaries";
