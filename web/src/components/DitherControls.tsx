/**
 * Dithering controls shared by the per-photo editor and the global "all photos"
 * panel. The visible knobs follow the selected algorithm's family: error
 * diffusion shows strength + serpentine, ordered shows a matrix picker + amount,
 * the curve family shows strength, and Yliluoma / nearest show nothing extra.
 *
 * All human-readable labels and blurbs come from i18n, keyed by the algorithm /
 * matrix ids, so the controls are fully Hebrew/English.
 */
import { Show, type Component } from "solid-js";
import {
  DEFAULT_DITHER_STRENGTH,
  DITHER_ALGORITHMS,
  ORDERED_MATRICES,
  ditherFamily,
  type DitherAlgorithm,
  type EditState,
  type OrderedMatrix,
} from "../types";
import { useI18n } from "../i18n";
import { Select, Slider, Toggle } from "./ui";

export const DitherControls: Component<{
  algorithm: DitherAlgorithm;
  ditherStrength: number;
  serpentine: boolean;
  orderedMatrix: OrderedMatrix;
  onChange: (patch: Partial<EditState>) => void;
}> = (props) => {
  const { t } = useI18n();
  const family = () => ditherFamily(props.algorithm);
  const showStrength = () =>
    family() === "diffusion" || family() === "ordered" || family() === "curve";

  return (
    <div class="flex flex-col gap-3">
      <Select<DitherAlgorithm>
        value={props.algorithm}
        aria-label={t("dither.label")}
        onChange={(v) => props.onChange({ algorithm: v })}
        options={DITHER_ALGORITHMS.map((a) => ({
          value: a.id,
          label: t(`dither.algo.${a.id}`),
        }))}
        class="w-full"
      />
      <p class="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{t(`dither.blurb.${props.algorithm}`)}</p>

      <Show when={family() === "ordered"}>
        <Select<OrderedMatrix>
          value={props.orderedMatrix}
          aria-label={t("dither.matrix")}
          onChange={(v) => props.onChange({ orderedMatrix: v })}
          options={ORDERED_MATRICES.map((m) => ({ value: m, label: t(`matrix.${m}`) }))}
          class="w-full"
        />
      </Show>

      <Show when={showStrength()}>
        <Slider
          label={family() === "ordered" ? t("dither.amount") : t("dither.strength")}
          min={0}
          max={100}
          value={props.ditherStrength}
          onChange={(v) => props.onChange({ ditherStrength: v })}
          display={(v) => `${v}%`}
          default={DEFAULT_DITHER_STRENGTH}
          resetHint={t("editor.resetSlider")}
        />
      </Show>

      <Show when={family() === "diffusion"}>
        <Toggle
          label={t("dither.serpentine")}
          checked={props.serpentine}
          onChange={(v) => props.onChange({ serpentine: v })}
        />
      </Show>
    </div>
  );
};
