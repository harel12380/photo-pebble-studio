/**
 * Web-app runtime types.
 *
 * Re-exports everything from @pebble/shared (the persisted/contract model) and
 * adds the types that only exist at runtime in the browser (decoded photos,
 * worker job config, import results). Engine modules import these from
 * '../types'.
 */
export * from "@pebble/shared";

import type {
  DitherAlgorithm,
  EditState,
  ImageFileFormat,
  ImageSourceKind,
  MessageSpec,
  OrderedMatrix,
} from "@pebble/shared";

/** Alias kept for the engine's source modules. */
export type PhotoSourceKind = ImageSourceKind;

/** Everything the dither worker needs besides the pixels + palette. */
export interface DitherConfig {
  algorithm: DitherAlgorithm;
  /** 0..1 — error-diffusion error scale, or ordered-dither amplitude. */
  strength: number;
  serpentine: boolean;
  orderedMatrix: OrderedMatrix;
  /** Unsharp-mask amount 0..1, applied before dithering. */
  sharpness: number;
  /** OKLab chroma emphasis. */
  chromaWeight: number;
}

/** A raw imported image before it becomes a managed Photo. */
export interface ImportedImage {
  blob: Blob;
  name: string;
  sourceKind: PhotoSourceKind;
  /** File last-modified time (ms), when known. */
  lastModified?: number;
  /** EXIF capture time (ms), when already known at import time. */
  takenAt?: number;
  /** Present when this item is a generated message card. */
  message?: MessageSpec;
}

export type PhotoStatus = "idle" | "processing" | "ready" | "error";

/** Result of running a photo through the edit + dither pipeline. */
export interface DitherResult {
  /** One palette index (0..palette.length-1) per pixel, row-major. */
  indices: Uint8Array;
  width: number;
  height: number;
}

export interface Photo {
  id: string;
  /** Original filename (best-effort for clipboard/messages). */
  name: string;
  sourceKind: PhotoSourceKind;
  /** Original image bytes; kept so edits can re-decode from source. For a pure
   *  message card this is the rendered text image. */
  blob: Blob;
  /** Object URL of the original blob; revoked on remove. */
  originalUrl: string;
  status: PhotoStatus;
  error?: string;
  edit: EditState;
  /** Latest dithered result, if processing has run since the last edit. */
  result?: DitherResult;
  /** True when edit changed and `result` is stale / needs reprocessing. */
  dirty: boolean;
  /** Monotonic revision; bumped on any change that invalidates `result`. */
  rev: number;
  /** When this photo was added to the app (ms epoch). */
  addedAt: number;
  /** Source file last-modified time (ms epoch), when known. */
  modifiedAt?: number;
  /** Capture time from EXIF (ms epoch), when available. */
  takenAt?: number;
  /** Message definition, for message cards and photo+text items. */
  message?: MessageSpec;
  /** Original file extension (e.g. "jpg"), used when storing originals on card. */
  originalExt?: string;
}

export interface OutputSettings {
  format: ImageFileFormat;
}

/**
 * How the dithered preview canvas renders palette indices.
 *  - "vivid": the true sRGB palette — shows the dither faithfully (blue sky,
 *    green leaves), so the preview reads like the original photo plus a dither.
 *  - "panel": the muted, measured on-panel colors — an honest simulation of how
 *    the e-ink display actually looks.
 * This is a view-only preference; it never affects the exported card.
 */
export type PreviewColors = "vivid" | "panel";
