/**
 * Card-wide settings, shown inside the settings dialog — global dithering
 * defaults, colorfulness, background, the slideshow schedule, and whether
 * original files are kept on the card for full re-editing after import.
 *
 * Changing a "all photos" control re-renders every photo through the store;
 * slideshow/output settings are written into config.json on export.
 */
import { Show, createSignal, type Component } from "solid-js";
import {
  state,
  applyToAll,
  setChromaWeight,
  autoEnhance,
  setSlideshow,
  setStoreOriginals,
} from "../state/store";
import { DEFAULT_CHROMA_WEIGHT, type BackgroundType, type CropMode } from "../types";
import {
  INTERVAL_PRESETS,
  AUTO_ADVANCE_OFF,
  DEFAULT_QUIET_HOURS,
} from "../cardFormat";
import { useI18n } from "../i18n";
import { toHex, fromHex } from "./color";
import {
  Button,
  ChipGroup,
  ColorInput,
  NumberField,
  Section,
  Segmented,
  Slider,
  TimeInput,
  Toggle,
} from "./ui";
import { DitherControls } from "./DitherControls";

// "Colorfulness" 0..100 maps to OKLab chroma weight 6.0 (cleanest) .. 2.1 (most
// colorful). Higher chroma weight = duller but less speckle; default 4.5 ≈ 38%.
// The clean end runs to 6.0 because mid-grays only stop casting green above ~4.2.
const CW_MAX = 6.0;
const CW_SPAN = 3.9;
const toColorfulness = (cw: number) => Math.round(((CW_MAX - cw) / CW_SPAN) * 100);
const fromColorfulness = (v: number) => CW_MAX - (v / 100) * CW_SPAN;

/**
 * A rough, friendly battery hint. The dominant power cost is the ~30 s e-ink
 * refresh, so a longer interval is what stretches battery life from weeks to
 * months. "Off" (button-only) refreshes least of all.
 */
function batteryHint(t: (k: string) => string, seconds: number): string {
  if (seconds === AUTO_ADVANCE_OFF) return t("battery.longest");
  if (seconds >= 43200) return t("battery.months");
  if (seconds >= 3600) return t("battery.weeks");
  return t("battery.days");
}

export const GlobalSettings: Component = () => {
  const { t } = useI18n();
  const hasPhotos = () => state.photos.length > 0;
  const bg = () => state.editDefaults.background;
  const slideshow = () => state.slideshow;
  const quiet = () => slideshow().quiet_hours ?? null;

  const isPreset = () => INTERVAL_PRESETS.includes(slideshow().interval_seconds);
  const [customMinutes, setCustomMinutes] = createSignal(
    Math.max(1, Math.round(slideshow().interval_seconds / 60)),
  );
  const [customOpen, setCustomOpen] = createSignal(!isPreset());

  const setQuietEnabled = (on: boolean) =>
    setSlideshow({ quiet_hours: on ? (quiet() ?? { ...DEFAULT_QUIET_HOURS }) : null });

  return (
    <>
      <Section title={t("settings.dither.all")}>
        <DitherControls
          algorithm={state.editDefaults.algorithm}
          ditherStrength={state.editDefaults.ditherStrength}
          serpentine={state.editDefaults.serpentine}
          orderedMatrix={state.editDefaults.orderedMatrix}
          onChange={applyToAll}
        />
      </Section>

      <Section title={t("settings.color")}>
        <div class="flex flex-col gap-3">
          <Slider
            label={t("dither.colorfulness")}
            min={0}
            max={100}
            value={toColorfulness(state.chromaWeight)}
            onChange={(v) => setChromaWeight(fromColorfulness(v))}
            display={(v) => `${v}%`}
            default={toColorfulness(DEFAULT_CHROMA_WEIGHT)}
            resetHint={t("editor.resetSlider")}
          />
          <p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{t("settings.colorfulness.hint")}</p>
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xs text-slate-500 dark:text-slate-400">{t("settings.cropMode")}</span>
            <Segmented<CropMode>
              size="sm"
              options={[
                { value: "fill", label: t("editor.fill") },
                { value: "fit", label: t("editor.fit") },
              ]}
              value={state.editDefaults.cropMode}
              onChange={(v) => applyToAll({ cropMode: v, offsetX: 0, offsetY: 0 })}
            />
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <span class="text-xs text-slate-500 dark:text-slate-400">{t("editor.background")}</span>
            <Segmented
              size="sm"
              options={[
                { value: "blur", label: t("editor.background.blur") },
                { value: "color", label: t("editor.background.color") },
              ]}
              value={bg().type}
              onChange={(v: BackgroundType) => applyToAll({ background: { ...bg(), type: v } })}
            />
            <Show when={bg().type === "color"}>
              <ColorInput
                aria-label={t("editor.background.color")}
                value={toHex(bg().color)}
                onChange={(hex) => applyToAll({ background: { ...bg(), color: fromHex(hex) } })}
              />
            </Show>
          </div>
          <Button variant="default" onClick={() => void autoEnhance()} disabled={!hasPhotos()} class="self-start">
            {t("action.autoEnhance")}
          </Button>
        </div>
      </Section>

      <Section title={t("settings.slideshow")}>
        <div class="flex flex-col gap-3">
          <div>
            <div class="mb-1.5 text-xs text-slate-500 dark:text-slate-400">{t("settings.interval")}</div>
            <ChipGroup
              options={[
                ...INTERVAL_PRESETS.map((s) => ({ value: String(s), label: t(`interval.${s}`) })),
                { value: "custom", label: t("interval.custom") },
              ]}
              value={customOpen() && !isPreset() ? "custom" : String(slideshow().interval_seconds)}
              onChange={(v) => {
                if (v === "custom") {
                  setCustomOpen(true);
                  setSlideshow({ interval_seconds: customMinutes() * 60 });
                } else {
                  setCustomOpen(false);
                  setSlideshow({ interval_seconds: Number(v) });
                }
              }}
            />
            <Show when={customOpen()}>
              <div class="mt-2 flex items-center gap-2">
                <NumberField
                  aria-label={t("interval.custom")}
                  min={1}
                  max={1440}
                  value={customMinutes()}
                  onChange={(m) => {
                    setCustomMinutes(m);
                    setSlideshow({ interval_seconds: m * 60 });
                  }}
                  class="w-24"
                />
                <span class="text-xs text-slate-500 dark:text-slate-400">{t("interval.minutes")}</span>
              </div>
            </Show>
            <p class="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
              {t("interval.battery", { value: batteryHint(t, slideshow().interval_seconds) })}
            </p>
          </div>

          <p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            {t("settings.orderNote")}
          </p>

          <Toggle
            label={t("settings.loop")}
            checked={slideshow().loop}
            onChange={(v) => setSlideshow({ loop: v })}
          />

          <Toggle
            label={t("settings.quietHours")}
            checked={!!quiet()}
            onChange={setQuietEnabled}
          />
          <Show when={quiet()}>
            {(q) => (
              <div class="flex flex-wrap items-center gap-x-3 gap-y-2 ps-0.5">
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-500 dark:text-slate-400">{t("settings.quietStart")}</span>
                  <TimeInput
                    aria-label={t("settings.quietStart")}
                    value={q().start}
                    onChange={(v) => setSlideshow({ quiet_hours: { ...q(), start: v } })}
                  />
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-slate-500 dark:text-slate-400">{t("settings.quietEnd")}</span>
                  <TimeInput
                    aria-label={t("settings.quietEnd")}
                    value={q().end}
                    onChange={(v) => setSlideshow({ quiet_hours: { ...q(), end: v } })}
                  />
                </div>
              </div>
            )}
          </Show>
        </div>
      </Section>

      <Section title={t("settings.card")}>
        <div class="flex flex-col gap-1.5">
          <Toggle
            label={t("settings.storeOriginals")}
            checked={state.storeOriginals}
            onChange={setStoreOriginals}
          />
          <p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{t("settings.storeOriginals.hint")}</p>
        </div>
      </Section>
    </>
  );
};
