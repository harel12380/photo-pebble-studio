/**
 * WYSIWYG crop canvas. It renders exactly the panel-resolution frame, so the
 * whole canvas IS the crop — drag to pan (zoom lives in the editor panel).
 *
 * The source bitmap is decoded once per photo and pinned so the LRU cache won't
 * close it mid-edit. Panning crops the already-dithered frame (panSelected), so
 * it stays smooth without re-running the ditherer.
 */
import { Show, createEffect, createSignal, onCleanup, type Component } from "solid-js";
import { state, panSelected } from "../state/store";
import type { Photo } from "../types";
import { displaySize } from "../cardFormat";
import {
  computeDrawGeometry,
  decodeBlob,
  pinBlob,
  renderEditedImageData,
  unpinBlob,
} from "../pipeline/imageProcessing";
import { useI18n } from "../i18n";
import { Alert } from "./ui";

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const CropEditor: Component<{ photo: Photo }> = (props) => {
  const { t } = useI18n();
  let canvas: HTMLCanvasElement | undefined;
  const [bitmap, setBitmap] = createSignal<ImageBitmap | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  // Whether the user has panned the current photo yet. Drives a one-shot
  // "drag to reposition" hint: panning is otherwise only signalled by a cursor
  // change, which is invisible on touch and gives no discoverability. The hint
  // shows while a photo can be panned but hasn't been, and dismisses for good as
  // soon as the user drags. Reset when the source photo changes.
  const [hasPanned, setHasPanned] = createSignal(false);
  let drag: { x: number; y: number } | null = null;

  const dims = () => displaySize(state.orientation);

  // Decode (and pin) the source whenever the blob changes.
  createEffect(() => {
    const blob = props.photo.blob;
    let cancelled = false;
    pinBlob(blob);
    setBitmap(null);
    setError(null);
    setHasPanned(false);
    // Clear the canvas immediately so we never show the *previous* photo's
    // pixels behind the "decoding" overlay while the new source decodes (the
    // dithered preview decodes independently and often paints first).
    if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    decodeBlob(blob)
      .then((bm) => {
        if (!cancelled) setBitmap(bm);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    onCleanup(() => {
      cancelled = true;
      unpinBlob(blob);
    });
  });

  // Redraw on any edit / orientation change.
  createEffect(() => {
    const bm = bitmap();
    const { width, height } = dims();
    // Touch the edit fields so the effect re-runs on every adjustment.
    const edit = { ...props.photo.edit };
    if (!canvas || !bm) return;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(renderEditedImageData(bm, edit, width, height), 0, 0);
  });

  const geometry = () => {
    const bm = bitmap();
    if (!bm) return null;
    const { width, height } = dims();
    return computeDrawGeometry(bm.width, bm.height, props.photo.edit, width, height);
  };

  const canPan = () => {
    const g = geometry();
    return !!g && (g.panRangeX > 0 || g.panRangeY > 0);
  };

  const onPointerDown = (e: PointerEvent) => {
    if (!bitmap()) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!drag || !canvas) return;
    const g = geometry();
    if (!g) return;
    const { width, height } = dims();
    const cssW = canvas.clientWidth || width;
    const cssH = canvas.clientHeight || height;
    const dxPanel = ((e.clientX - drag.x) * width) / cssW;
    const dyPanel = ((e.clientY - drag.y) * height) / cssH;
    drag = { x: e.clientX, y: e.clientY };

    let nextX = props.photo.edit.offsetX;
    let nextY = props.photo.edit.offsetY;
    let changed = false;
    if (g.panRangeX > 0) {
      nextX = clamp(props.photo.edit.offsetX + dxPanel / g.panRangeX, -1, 1);
      changed = true;
    }
    if (g.panRangeY > 0) {
      nextY = clamp(props.photo.edit.offsetY + dyPanel / g.panRangeY, -1, 1);
      changed = true;
    }
    if (changed) {
      if (!hasPanned()) setHasPanned(true);
      panSelected(props.photo.id, nextX, nextY);
    }
  };

  const endDrag = () => {
    drag = null;
  };

  return (
    <div class="bg-checker relative w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
      <canvas
        ref={canvas}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{ "aspect-ratio": `${dims().width} / ${dims().height}`, "touch-action": "none" }}
        class={`block w-full ${canPan() ? "cursor-grab active:cursor-grabbing" : ""}`}
        role="img"
        aria-label={`${t("editor.crop")} — ${props.photo.name}`}
      />
      <Show when={bitmap() && !error() && canPan() && !hasPanned()}>
        <div class="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-2">
          <span class="rounded-full bg-slate-900/60 px-2.5 py-1 text-[11px] font-medium text-white shadow-sm backdrop-blur-sm">
            {t("editor.panHint")}
          </span>
        </div>
      </Show>
      <Show when={!bitmap() && !error()}>
        <div
          class="absolute inset-0 flex items-center justify-center text-xs text-slate-500 dark:text-slate-400"
          role="status"
          aria-live="polite"
        >
          {t("status.decoding")}
        </div>
      </Show>
      <Show when={error()}>
        <div class="absolute inset-0 flex items-center justify-center p-3">
          <Alert variant="error">{error()}</Alert>
        </div>
      </Show>
    </div>
  );
};
