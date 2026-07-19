/**
 * Bundled fonts for message cards. Hebrew-first families, self-hosted via
 * @fontsource so the studio works offline and renders text identically on any
 * machine (no dependency on the user's installed fonts).
 */
import "@fontsource/heebo/400.css";
import "@fontsource/heebo/700.css";
import "@fontsource/rubik/400.css";
import "@fontsource/rubik/700.css";
import "@fontsource/assistant/400.css";
import "@fontsource/assistant/700.css";
import "@fontsource/frank-ruhl-libre/400.css";
import "@fontsource/frank-ruhl-libre/700.css";
import "@fontsource/secular-one/400.css";
import "@fontsource/suez-one/400.css";

import type { FontId } from "./types";

const FAMILY: Record<FontId, string> = {
  heebo: "Heebo",
  rubik: "Rubik",
  assistant: "Assistant",
  "frank-ruhl-libre": "Frank Ruhl Libre",
  "secular-one": "Secular One",
  "suez-one": "Suez One",
};

/** Single-weight display fonts — weight is ignored for these. */
const SINGLE_WEIGHT: ReadonlySet<FontId> = new Set(["secular-one", "suez-one"]);

export function fontFamily(id: FontId): string {
  return FAMILY[id];
}

/** A canvas `font` shorthand for the given face. */
export function fontCss(id: FontId, weightPx: number, sizePx: number): string {
  const weight = SINGLE_WEIGHT.has(id) ? 400 : weightPx;
  return `${weight} ${Math.round(sizePx)}px "${fontFamily(id)}", system-ui, sans-serif`;
}

/**
 * Ensure a face is loaded before drawing it to a canvas (canvas text otherwise
 * silently falls back to a system font on first paint). Best-effort.
 */
export async function ensureFont(
  id: FontId,
  weightPx: number,
  sizePx = 64,
): Promise<void> {
  if (typeof document === "undefined" || !("fonts" in document)) return;
  const weight = SINGLE_WEIGHT.has(id) ? 400 : weightPx;
  try {
    await document.fonts.load(`${weight} ${Math.round(sizePx)}px "${fontFamily(id)}"`);
  } catch {
    /* fall back to system font */
  }
}
