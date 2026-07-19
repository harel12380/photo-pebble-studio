/**
 * The editor pane: edit the selected photo. A live original-vs-on-panel
 * preview (sticky on wide screens) sits beside the photo's controls —
 * crop/zoom/rotate, background fill for fit mode, image adjustments, and
 * per-photo dithering — so tweaking a slider never scrolls the preview away.
 * Selecting a photo builds its dithered frame eagerly (so panning is
 * instant); edits trigger a short debounced re-render.
 */
import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  type Component,
} from "solid-js";
import {
  state,
  updateEdit,
  resetEdit,
  rotatePhoto,
  processPhoto,
  setOrientation,
  setPreviewColors,
} from "../state/store";
import {
  type BackgroundType,
  type DitherResult,
  type Orientation,
  DEFAULT_ADJUSTMENTS,
} from "../types";
import { displaySize } from "../cardFormat";
import { useI18n } from "../i18n";
import { CropEditor } from "./CropEditor";
import { DitherControls } from "./DitherControls";
import { IndexedCanvas } from "./IndexedCanvas";
import { toHex, fromHex } from "./color";
import {
  Button,
  ColorInput,
  IconRotateCcw,
  IconRotateCw,
  Section,
  Segmented,
  Slider,
} from "./ui";

/** Signed readout for a bipolar adjustment (−100..+100, 0 = unchanged). */
const signed = (v: number): string => (v > 0 ? `+${v}` : `${v}`);

export const EditorPanel: Component = () => {
  const { t } = useI18n();
  const photo = createMemo(() => state.photos.find((p) => p.id === state.selectedId));
  const dims = () => displaySize(state.orientation);

  // The dithered frame we currently trust enough to show. On *selection* we drop
  // it so the original shows immediately under the "rendering" overlay (instead
  // of flashing the freshly-selected photo's stale frame from a prior orientation
  // or crop); during *live edits* the id is unchanged so we keep the last frame
  // visible until the new one commits — no mid-edit flicker. We adopt the store
  // result only once the selected photo reaches "ready".
  const [shownResult, setShownResult] = createSignal<DitherResult | undefined>();

  // Build the dithered frame as soon as a photo is selected (enables fast pan),
  // and reset the shown frame to the original while it renders.
  createEffect(
    on(
      () => photo()?.id,
      (id) => {
        setShownResult(undefined);
        if (id) void processPhoto(id);
      },
    ),
  );

  // Adopt the fresh frame once it commits for the current photo. Reading status
  // after the selection effect (which synchronously marks "processing") ran means
  // a stale "ready" can't slip a stale frame through on selection.
  createEffect(() => {
    const p = photo();
    if (p?.status === "ready" && p.result) setShownResult(p.result);
  });

  // Debounced reprocessing while editing the selected photo.
  createEffect(
    on(
      () => [photo()?.id, photo()?.rev, photo()?.dirty] as const,
      ([id, , dirty]) => {
        if (!id || !dirty) return;
        const timer = setTimeout(() => void processPhoto(id), 120);
        onCleanup(() => clearTimeout(timer));
      },
    ),
  );

  return (
    <Show
      when={photo()}
      fallback={
        <div class="flex h-full min-h-64 items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
          {t("editor.empty")}
        </div>
      }
    >
      {(p) => {
        const processing = () => p().status === "processing" || p().dirty;
        const fit = () => p().edit.cropMode === "fit";
        return (
          <div class="flex flex-col items-stretch gap-3 xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:items-start">
            {/* Preview column — sticky on wide screens so it stays in view
                while the controls column beside it scrolls. */}
            <div class="xl:sticky xl:top-0">
            <Section
              title={t("editor.preview")}
              right={
                <span class="text-xs tabular-nums text-slate-400 dark:text-slate-400">
                  {dims().width}×{dims().height}
                </span>
              }
            >
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <CropEditor photo={p()} />
                  <p class="mt-1 text-center text-[11px] text-slate-400 dark:text-slate-400">{t("editor.original")}</p>
                </div>
                <div>
                  <div class="bg-checker relative w-full overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                    <Show
                      when={shownResult()}
                      fallback={
                        // Until a trusted dithered frame is ready, hold an empty
                        // checker placeholder (under the "rendering" overlay) —
                        // NOT the full-colour original. Painting the original here
                        // misreads as "the preview is showing the source, not the
                        // dither"; the dithered result reveals in place when ready.
                        <div
                          style={{ "aspect-ratio": `${dims().width} / ${dims().height}` }}
                          class="block w-full"
                          aria-hidden="true"
                        />
                      }
                    >
                      {(result) => (
                        <IndexedCanvas
                          result={result()}
                          class="block w-full"
                          alt={`${t("editor.preview")} — ${p().name}`}
                        />
                      )}
                    </Show>
                    <Show when={processing()}>
                      <div
                        class="absolute inset-0 flex items-center justify-center bg-white/50 text-xs text-slate-600 dark:bg-slate-900/50 dark:text-slate-300"
                        role="status"
                        aria-live="polite"
                      >
                        {t("status.rendering")}
                      </div>
                    </Show>
                  </div>
                  <p class="mt-1 text-center text-[11px] text-slate-400 dark:text-slate-400">{t("editor.preview")}</p>
                </div>
              </div>
              {/* Frame orientation and preview palette both change what the
                  previews above show, so they live right under them. */}
              <div class="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <Segmented<Orientation>
                  size="sm"
                  options={[
                    { value: "landscape", label: t("orientation.landscape") },
                    { value: "portrait", label: t("orientation.portrait") },
                  ]}
                  value={state.orientation}
                  onChange={setOrientation}
                />
                <Segmented
                  size="sm"
                  options={[
                    { value: "vivid", label: t("preview.vivid"), title: t("preview.vivid.title") },
                    { value: "panel", label: t("preview.panel"), title: t("preview.panel.title") },
                  ]}
                  value={state.previewColors}
                  onChange={setPreviewColors}
                />
              </div>
            </Section>
            </div>

            {/* Controls column: everything about the selected photo. */}
            <div class="flex flex-col gap-3">
            <Section title={t("editor.crop")}>
              <div class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center gap-3">
                  <Segmented
                    options={[
                      { value: "fill", label: t("editor.fill") },
                      { value: "fit", label: t("editor.fit") },
                    ]}
                    value={p().edit.cropMode}
                    onChange={(v) => updateEdit(p().id, { cropMode: v, offsetX: 0, offsetY: 0 })}
                  />
                  <div class="flex items-center gap-1">
                    <Button
                      variant="default"
                      title={t("action.rotateLeft")}
                      aria-label={t("action.rotateLeft")}
                      onClick={() => rotatePhoto(p().id, -90)}
                    >
                      <IconRotateCcw />
                    </Button>
                    <Button
                      variant="default"
                      title={t("action.rotateRight")}
                      aria-label={t("action.rotateRight")}
                      onClick={() => rotatePhoto(p().id, 90)}
                    >
                      <IconRotateCw />
                    </Button>
                  </div>
                  <div class="min-w-[140px] flex-1">
                    <Slider
                      label={t("editor.zoom")}
                      min={1}
                      max={4}
                      step={0.01}
                      value={p().edit.zoom}
                      onChange={(v) => updateEdit(p().id, { zoom: v })}
                      display={(v) => `${v.toFixed(2)}×`}
                      default={1}
                      resetHint={t("editor.resetSlider")}
                    />
                  </div>
                </div>

                <Show when={fit()}>
                  <div class="flex flex-wrap items-center gap-3">
                    <span class="text-xs text-slate-500 dark:text-slate-400">{t("editor.background")}</span>
                    <Segmented
                      size="sm"
                      options={[
                        { value: "blur", label: t("editor.background.blur") },
                        { value: "color", label: t("editor.background.color") },
                      ]}
                      value={p().edit.background.type}
                      onChange={(v: BackgroundType) =>
                        updateEdit(p().id, { background: { ...p().edit.background, type: v } })
                      }
                    />
                    <Show when={p().edit.background.type === "color"}>
                      <ColorInput
                        aria-label={t("editor.background.color")}
                        value={toHex(p().edit.background.color)}
                        onChange={(hex) =>
                          updateEdit(p().id, {
                            background: { ...p().edit.background, color: fromHex(hex) },
                          })
                        }
                      />
                    </Show>
                  </div>
                </Show>
              </div>
            </Section>

            <Section title={t("editor.adjust")}>
              <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Slider
                  label={t("editor.brightness")}
                  min={-100}
                  max={100}
                  value={p().edit.brightness}
                  onChange={(v) => updateEdit(p().id, { brightness: v })}
                  display={signed}
                  origin={0}
                  default={DEFAULT_ADJUSTMENTS.brightness}
                  resetHint={t("editor.resetSlider")}
                />
                <Slider
                  label={t("editor.contrast")}
                  min={-100}
                  max={100}
                  value={p().edit.contrast}
                  onChange={(v) => updateEdit(p().id, { contrast: v })}
                  display={signed}
                  origin={0}
                  default={DEFAULT_ADJUSTMENTS.contrast}
                  resetHint={t("editor.resetSlider")}
                />
                <Slider
                  label={t("editor.saturation")}
                  min={-100}
                  max={100}
                  value={p().edit.saturation}
                  onChange={(v) => updateEdit(p().id, { saturation: v })}
                  display={signed}
                  origin={0}
                  default={DEFAULT_ADJUSTMENTS.saturation}
                  resetHint={t("editor.resetSlider")}
                />
                <Slider
                  label={t("editor.temperature")}
                  min={-100}
                  max={100}
                  value={p().edit.temperature}
                  onChange={(v) => updateEdit(p().id, { temperature: v })}
                  display={signed}
                  origin={0}
                  default={0}
                  resetHint={t("editor.resetSlider")}
                />
                <Slider
                  label={t("editor.tint")}
                  min={-100}
                  max={100}
                  value={p().edit.tint}
                  onChange={(v) => updateEdit(p().id, { tint: v })}
                  display={signed}
                  origin={0}
                  default={0}
                  resetHint={t("editor.resetSlider")}
                />
                <Slider
                  label={t("editor.sharpness")}
                  min={0}
                  max={100}
                  value={p().edit.sharpness}
                  onChange={(v) => updateEdit(p().id, { sharpness: v })}
                  display={(v) => `${v}%`}
                  default={DEFAULT_ADJUSTMENTS.sharpness}
                  resetHint={t("editor.resetSlider")}
                />
              </div>
            </Section>

            <Section title={t("dither.label")}>
              <DitherControls
                algorithm={p().edit.algorithm}
                ditherStrength={p().edit.ditherStrength}
                serpentine={p().edit.serpentine}
                orderedMatrix={p().edit.orderedMatrix}
                onChange={(patch) => updateEdit(p().id, patch)}
              />
            </Section>

            {/* Standalone so it reads as "reset everything about this photo"
                (crop, adjustments, dithering) — not just the section it used
                to sit in. */}
            <Button variant="default" class="w-full" onClick={() => resetEdit(p().id)}>
              <IconRotateCcw class="h-4 w-4" />
              {t("editor.resetPhoto")}
            </Button>
            </div>
          </div>
        );
      }}
    </Show>
  );
};
