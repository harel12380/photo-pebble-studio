/**
 * manifest.ts — the studio's re-import sidecar.
 *
 * Everything the firmware needs lives in `config.json` + `photos/*.bin`. The
 * firmware NEVER reads anything under `.pebble/`. The studio writes a rich
 * manifest there (plus, by default, the original photos) so that re-importing a
 * card restores the full editable project: every crop, every dither setting,
 * every message, the capture-date ordering, and the slideshow settings — then
 * new photos merge in "as if they had all been added in one session".
 *
 * On-card layout written by the studio:
 *
 *   <card root>/
 *     config.json              <- firmware reads
 *     photos/000.bin ...       <- firmware reads
 *     .pebble/
 *       manifest.json          <- studio only
 *       originals/<id>.<ext>   <- studio only (omitted in metadata-only mode)
 */

import type {
  CardConfigSlideshow,
  Orientation,
} from "./cardFormat";
import type { EditDefaults, EditState, ImageSourceKind, SortMode } from "./editModel";
import type { MessageSpec } from "./message";

/** Bump when the manifest shape changes incompatibly. Independent of the
 *  firmware-facing CARD_FORMAT_VERSION. */
export const MANIFEST_VERSION = 1 as const;

export const PEBBLE_DIR = ".pebble";
export const MANIFEST_PATH = `${PEBBLE_DIR}/manifest.json`;
export const ORIGINALS_DIR = `${PEBBLE_DIR}/originals`;

/** Card-relative path to a stored original for a given item id + extension. */
export function originalPath(id: string, ext: string): string {
  const clean = ext.replace(/^\./, "").toLowerCase() || "bin";
  return `${ORIGINALS_DIR}/${id}.${clean}`;
}

export interface ManifestPhoto {
  /** Stable id that survives round-trips (used for the originals filename). */
  id: string;
  /** Firmware-facing image path for THIS export, e.g. "photos/000.bin". */
  binFile: string;
  /** Stored original path under .pebble/originals, or null (message card /
   *  metadata-only export) — when null, the item can be reordered/retimed but
   *  not re-dithered on re-import. */
  originalFile: string | null;
  /** Display / original filename. */
  name: string;
  sourceKind: ImageSourceKind;
  /** EXIF capture time (ms epoch) — the default sort key. */
  takenAt?: number;
  /** Source file last-modified (ms epoch). */
  modifiedAt?: number;
  /** When first added to the project (ms epoch). */
  addedAt: number;
  /** Non-destructive edit applied to the image part. */
  edit: EditState;
  /** Present for message cards and photo+text items. */
  message?: MessageSpec;
  /** SHA-256 of the exported .bin, hex — lets the studio skip re-encoding
   *  unchanged items and detect external edits. */
  binSha256?: string;
}

export interface ManifestSettings {
  orientation: Orientation;
  sortMode: SortMode;
  slideshow: CardConfigSlideshow;
  editDefaults: EditDefaults;
  chromaWeight: number;
  /** UI language the project was last saved with. */
  locale?: string;
  /** Whether originals were written to the card on the last export. */
  storeOriginals: boolean;
}

export interface PebbleManifest {
  manifestVersion: typeof MANIFEST_VERSION;
  /** The card-format version of the .bin/config.json written alongside. */
  cardFormatVersion: number;
  /** Incremented on every export; lets the studio tell generations apart. */
  generation: number;
  createdAt: number;
  updatedAt: number;
  app: { name: string; version: string };
  settings: ManifestSettings;
  /** Photos + messages, in final display order (matches photos/NNN.bin order). */
  photos: ManifestPhoto[];
}
