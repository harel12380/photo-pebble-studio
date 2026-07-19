/** sRGB ↔ "#rrggbb" helpers for the native color inputs. */
import type { RGB } from "../cardFormat";

export function toHex(rgb: RGB): string {
  const h = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return `#${h(rgb[0])}${h(rgb[1])}${h(rgb[2])}`;
}

export function fromHex(hex: string): RGB {
  const v = hex.replace("#", "");
  return [
    parseInt(v.slice(0, 2), 16) || 0,
    parseInt(v.slice(2, 4), 16) || 0,
    parseInt(v.slice(4, 6), 16) || 0,
  ];
}
