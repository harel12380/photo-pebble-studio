/**
 * Component kit for the studio — buttons, inputs, layout, and a few inline
 * icons. Light, clean photo-studio aesthetic; RTL-correct (logical spacing).
 *
 * Idiomatic SolidJS: props are read in JSX so they stay reactive; lists use
 * <For>; conditional UI uses <Show>. The API mirrors the reference kit where it
 * makes sense so the rest of the app reads naturally.
 */
import {
  For,
  Show,
  createEffect,
  createSignal,
  createUniqueId,
  onCleanup,
  onMount,
  splitProps,
  type Component,
  type JSX,
  type ParentComponent,
} from "solid-js";
import { Portal } from "solid-js/web";

/** Shared focus ring tuned for a light background (dark-aware offset). */
const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-900";

/* -------------------------------------------------------------------------- */
/* Icons                                                                       */
/* -------------------------------------------------------------------------- */

type IconProps = { class?: string };

// `paths` MUST be a factory, not a pre-built element: a Solid JSX element is a
// concrete DOM node created once, and a node can only live in one place — so if
// the same icon is rendered in two spots at once, the later render steals the
// shapes and the earlier svg goes blank (the classic "invisible icon"). Calling
// `paths()` per render gives every instance its own fresh shapes.
const strokeIcon = (paths: () => JSX.Element) => (p: IconProps) =>
  (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width={2}
      stroke-linecap="round"
      stroke-linejoin="round"
      class={p.class ?? "h-4 w-4"}
      aria-hidden="true"
    >
      {paths()}
    </svg>
  );

export const IconX = strokeIcon(() => 
  <>
    <path d="M18 6 6 18" />
    <path d="M6 6l12 12" />
  </>,
);

export const IconChevronDown = strokeIcon(() => <path d="m6 9 6 6 6-6" />);

export const IconGrip: Component<IconProps> = (p) => (
  <svg viewBox="0 0 24 24" fill="currentColor" class={p.class ?? "h-4 w-4"} aria-hidden="true">
    <circle cx="9" cy="6" r="1.5" />
    <circle cx="15" cy="6" r="1.5" />
    <circle cx="9" cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9" cy="18" r="1.5" />
    <circle cx="15" cy="18" r="1.5" />
  </svg>
);

export const IconRotateCcw = strokeIcon(() => 
  <>
    <path d="M3 12a9 9 0 1 0 2.6-6.36L3 8" />
    <path d="M3 3v5h5" />
  </>,
);

export const IconRotateCw = strokeIcon(() => 
  <>
    <path d="M21 12a9 9 0 1 1-2.6-6.36L21 8" />
    <path d="M21 3v5h-5" />
  </>,
);

export const IconInfo = strokeIcon(() => 
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8h.01" />
    <path d="M11 12h1v4h1" />
  </>,
);

export const IconCheckCircle = strokeIcon(() =>
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </>,
);

export const IconCheck = strokeIcon(() => <path d="m5 12.5 4.5 4.5L19 6.5" />);

export const IconAlertTriangle = strokeIcon(() => 
  <>
    <path d="M10.3 3.86 1.82 18a1 1 0 0 0 .86 1.5h18.64a1 1 0 0 0 .86-1.5L13.7 3.86a1 1 0 0 0-1.72 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </>,
);

export const IconUpload = strokeIcon(() => 
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M17 8l-5-5-5 5" />
    <path d="M12 3v12" />
  </>,
);

export const IconDownload = strokeIcon(() => 
  <>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5" />
    <path d="M12 15V3" />
  </>,
);

export const IconImage = strokeIcon(() => 
  <>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="9" cy="9" r="2" />
    <path d="m21 15-4.5-4.5L5 21" />
  </>,
);

export const IconMessage = strokeIcon(() => 
  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />,
);

export const IconSun = strokeIcon(() => 
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </>,
);

export const IconMoon = strokeIcon(() =>
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />,
);

export const IconSettings = strokeIcon(() =>
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </>,
);

export const IconClock = strokeIcon(() =>
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Layout                                                                      */
/* -------------------------------------------------------------------------- */

/** Titled card section used throughout the panels. */
export const Section: ParentComponent<{ title: string; right?: JSX.Element }> = (props) => (
  <section class="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {props.title}
      </h2>
      {props.right}
    </div>
    {props.children}
  </section>
);

/* -------------------------------------------------------------------------- */
/* Button                                                                      */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = "default" | "primary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  default:
    "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60",
  primary: "bg-indigo-600 text-white shadow-sm hover:bg-indigo-500",
  ghost:
    "bg-transparent text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700",
  danger:
    "bg-transparent text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15",
};

export const Button: Component<
  {
    variant?: ButtonVariant;
    children: JSX.Element;
  } & JSX.ButtonHTMLAttributes<HTMLButtonElement>
> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "children", "class", "type"]);
  return (
    <button
      type={local.type ?? "button"}
      class={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING} ${
        BUTTON_VARIANTS[local.variant ?? "default"]
      } ${local.class ?? ""}`}
      {...rest}
    >
      {local.children}
    </button>
  );
};

/** Compact square icon button. */
export const IconButton: Component<
  {
    children: JSX.Element;
    variant?: ButtonVariant;
  } & JSX.ButtonHTMLAttributes<HTMLButtonElement>
> = (props) => {
  const [local, rest] = splitProps(props, ["variant", "children", "class", "type"]);
  return (
    <button
      type={local.type ?? "button"}
      class={`inline-flex items-center justify-center rounded-lg p-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS_RING} ${
        BUTTON_VARIANTS[local.variant ?? "ghost"]
      } ${local.class ?? ""}`}
      {...rest}
    >
      {local.children}
    </button>
  );
};

/* -------------------------------------------------------------------------- */
/* Segmented / Chips                                                           */
/* -------------------------------------------------------------------------- */

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  title?: string;
}

export function Segmented<T extends string>(props: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
}): JSX.Element {
  const pad = () => (props.size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm");
  return (
    <div class="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-700">
      <For each={props.options}>
        {(o) => (
          <button
            type="button"
            title={o.title}
            aria-pressed={props.value === o.value}
            onClick={() => props.onChange(o.value)}
            class={`rounded-md font-medium transition-colors ${pad()} ${FOCUS_RING} ${
              props.value === o.value
                ? "bg-white text-indigo-700 shadow-sm dark:bg-slate-900 dark:text-indigo-300"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

/** Preset chips, styled consistently with Segmented. */
export function ChipGroup<T extends string | number>(props: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}): JSX.Element {
  return (
    <div class="flex flex-wrap gap-1.5">
      <For each={props.options}>
        {(o) => (
          <button
            type="button"
            aria-pressed={props.value === o.value}
            onClick={() => props.onChange(o.value)}
            class={`rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${FOCUS_RING} ${
              props.value === o.value
                ? "border-indigo-600 bg-indigo-600 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700/60"
            }`}
          >
            {o.label}
          </button>
        )}
      </For>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                      */
/* -------------------------------------------------------------------------- */

export const Slider: Component<{
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  display?: (v: number) => string;
  /** Tuned default. When set and the value has been moved off it, a small
   *  reset button appears beside the readout (and double-clicking the track
   *  also snaps back) — useful when the neutral value isn't an edge (the image
   *  adjustments default to a non-zero auto-enhance baseline). */
  default?: number;
  /** Tooltip / accessible label for the reset affordance (i18n'd by the caller). */
  resetHint?: string;
  /** Anchor the progress fill grows *from* (defaults to `min`, the track edge).
   *  Set to a neutral mid-value — e.g. 0 for a bipolar ±100 adjustment — so the
   *  fill spans from neutral to the thumb instead of misreading as half-on at
   *  rest. */
  origin?: number;
}> = (props) => {
  const hasDefault = () => props.default !== undefined;
  const reset = () => {
    if (props.default !== undefined) props.onChange(props.default);
  };
  // The native range thumb is 1rem wide, so its *centre* travels in the inset
  // band [0.5rem, 100% − 0.5rem], not the full track. Positioning the fill end
  // in raw full-track percentages leaves it up to half a thumb (≈8px) adrift of
  // the handle — worst at the extremes (a 100% fill overshoots the thumb out to
  // the track edge). Map a value's fraction through that same inset band so the
  // fill's leading edge lands under the thumb.
  const THUMB = "1rem";
  const thumbPos = (pct: number) => `calc(0.5 * ${THUMB} + ${pct / 100} * (100% - ${THUMB}))`;
  // The fill's anchor (origin) end, by contrast, should reach the *real* track
  // edge when the origin sits at min/max (the usual unipolar fill) so a full/empty
  // slider isn't left with a stub of bare track; an interior origin (a bipolar 0)
  // rides the thumb band so it meets the handle when the value rests there.
  const anchorPos = (pct: number) => (pct <= 0 ? "0%" : pct >= 100 ? "100%" : thumbPos(pct));
  // Show the reset button only once the value has actually moved off the tuned
  // default (compared with a half-step tolerance so float steps don't leave it
  // stuck on). Works for edge defaults too, unlike an on-track marker would.
  const isTweaked = () =>
    props.default !== undefined &&
    Math.abs(props.value - props.default) > (props.step ?? 1) / 2;
  // How far along the track a value sits, as a clamped percentage. Drives the
  // indigo progress fill: with appearance-none the native `accent-color` fill is
  // gone, so without this the track is a flat gray bar and the only cue to the
  // value is the thumb's position. inset-inline-start keeps the fill RTL-correct
  // — it counts from the same edge the native range thumb does (right in RTL).
  const pctOf = (v: number) => {
    const p = ((v - props.min) / (props.max - props.min)) * 100;
    return p < 0 ? 0 : p > 100 ? 100 : p;
  };
  // The fill spans from `origin` (the track edge by default) to the thumb, so a
  // bipolar slider anchored at 0 fills outward from neutral rather than always
  // from the start — at rest it shows empty, not half-full.
  const originPct = () => pctOf(props.origin ?? props.min);
  // Lower edge of the fill comes first (inset-inline-start); the span is the gap
  // up to the higher edge. The value end always rides the thumb centre; the origin
  // end uses the edge-snapping anchor.
  const originLeads = () => originPct() <= pctOf(props.value);
  const fillFrom = () => (originLeads() ? anchorPos(originPct()) : thumbPos(pctOf(props.value)));
  const fillTo = () => (originLeads() ? thumbPos(pctOf(props.value)) : anchorPos(originPct()));
  return (
    <label class="block">
      <div class="mb-1 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>{props.label}</span>
        <span dir="ltr" class="flex items-center gap-1.5 tabular-nums text-slate-700 dark:text-slate-200">
          {/* Reset affordance: a subtle rotate-back icon that surfaces only when
              the slider sits off its tuned default, so a nudged control is
              obviously undoable (the old hidden double-click still works too). */}
          <Show when={isTweaked()}>
            <button
              type="button"
              // preventDefault stops the wrapping <label> from forwarding the
              // click on to focus the range input.
              onClick={(e) => {
                e.preventDefault();
                reset();
              }}
              title={props.resetHint}
              aria-label={props.resetHint}
              class={`flex h-4 w-4 items-center justify-center rounded text-slate-400 transition-colors hover:text-indigo-600 dark:text-slate-500 dark:hover:text-indigo-400 ${FOCUS_RING}`}
            >
              <IconRotateCcw class="h-3 w-3" />
            </button>
          </Show>
          <span>{props.display ? props.display(props.value) : props.value}</span>
        </span>
      </div>
      <div class="relative">
        <span
          aria-hidden="true"
          class="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700"
        />
        <span
          aria-hidden="true"
          class="pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-indigo-600 dark:bg-indigo-500"
          style={{ "inset-inline-start": fillFrom(), width: `calc(${fillTo()} - ${fillFrom()})` }}
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={props.step ?? 1}
          value={props.value}
          onInput={(e) => props.onChange(Number(e.currentTarget.value))}
          onDblClick={hasDefault() ? reset : undefined}
          title={hasDefault() ? props.resetHint : undefined}
          // Stable accessible name (the wrapping <label> would otherwise fold the
          // live value span into the name, so screen readers re-announce the label
          // on every drag). aria-valuetext makes the slider speak the *formatted*
          // value the user sees ("100%", "+8", "×1.00") instead of the raw number.
          aria-label={props.label}
          aria-valuetext={props.display ? props.display(props.value) : undefined}
          // Track stays transparent so the indigo fill (and slate track underneath
          // it) show through; the native element only paints the thumb.
          class={`relative h-1.5 w-full cursor-pointer appearance-none rounded-full bg-transparent ${FOCUS_RING}`}
        />
      </div>
    </label>
  );
};

export const Toggle: Component<{
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}> = (props) => (
  <label class="flex cursor-pointer items-center justify-between gap-3 text-sm text-slate-700 dark:text-slate-200">
    <span>{props.label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      class={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${FOCUS_RING} ${
        props.checked ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"
      }`}
    >
      <span
        class="absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all"
        style={{ "inset-inline-start": props.checked ? "1.125rem" : "0.125rem" }}
      />
    </button>
  </label>
);

/**
 * Custom dropdown — replaces the native <select>. A native select's popup
 * renders blank/unreadable in RTL (Hebrew) on some Linux/Chromium setups, so we
 * own the rendering: a button trigger + an absolutely-positioned listbox. Same
 * generic API as before, so every call site is unchanged. Keyboard-accessible
 * (Enter/Space/↓ open; ↑/↓ move; Enter pick; Esc close) and closes on outside
 * click. Logical CSS (`inset-x-0`, `truncate`) keeps it correct in both writing
 * directions.
 */
export function Select<T extends string>(props: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  class?: string;
  "aria-label"?: string;
}): JSX.Element {
  const [open, setOpen] = createSignal(false);
  const [active, setActive] = createSignal(0);
  let root: HTMLDivElement | undefined;
  // Stable ids so the trigger can point aria-activedescendant at the active
  // <li>: focus never leaves the button (the options aren't focusable), so
  // without this a screen reader announces nothing as the user arrows through —
  // the visual indigo highlight is silent. Each option gets `${baseId}-N`.
  const baseId = createUniqueId();
  const optId = (i: number) => `${baseId}-opt-${i}`;
  // Element refs for the active-option scroll-into-view (see effect below).
  const optEls: (HTMLLIElement | undefined)[] = [];

  // Keep the keyboard-active option within the scroll viewport. The listbox is
  // height-capped (max-h-64) and scrolls, so on a long list arrowing past the
  // visible window would otherwise strand the highlight off-screen.
  createEffect(() => {
    if (open()) optEls[active()]?.scrollIntoView?.({ block: "nearest" });
  });

  const current = () => props.options.find((o) => o.value === props.value);
  const valueIndex = () => {
    const i = props.options.findIndex((o) => o.value === props.value);
    return i < 0 ? 0 : i;
  };
  const openMenu = () => {
    setActive(valueIndex());
    setOpen(true);
  };
  const choose = (v: T) => {
    props.onChange(v);
    setOpen(false);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!open()) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(props.options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const o = props.options[active()];
      if (o) choose(o.value);
    }
  };

  onMount(() => {
    const onDoc = (e: MouseEvent) => {
      if (root && !root.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    onCleanup(() => document.removeEventListener("mousedown", onDoc));
  });

  return (
    <div ref={root} class={`relative ${props.class ?? ""}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open()}
        aria-controls={open() ? `${baseId}-list` : undefined}
        aria-activedescendant={open() ? optId(active()) : undefined}
        aria-label={props["aria-label"]}
        onClick={() => (open() ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        class={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60 ${
          open()
            ? "border-indigo-500 dark:border-indigo-500"
            : "border-slate-300 dark:border-slate-600"
        } ${FOCUS_RING}`}
      >
        <span class="truncate">{current()?.label ?? ""}</span>
        <IconChevronDown
          class={`h-4 w-4 shrink-0 text-slate-400 transition-transform dark:text-slate-500 ${open() ? "rotate-180" : ""}`}
        />
      </button>
      <Show when={open()}>
        <ul
          id={`${baseId}-list`}
          role="listbox"
          aria-label={props["aria-label"]}
          class="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800"
        >
          <For each={props.options}>
            {(o, i) => (
              <li
                id={optId(i())}
                ref={(el) => (optEls[i()] = el)}
                role="option"
                data-value={o.value}
                aria-selected={o.value === props.value}
                onMouseEnter={() => setActive(i())}
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o.value);
                }}
                class={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-sm ${
                  i() === active() ? "bg-indigo-50 dark:bg-indigo-500/15" : ""
                } ${
                  o.value === props.value
                    ? "font-medium text-indigo-700 dark:text-indigo-300"
                    : "text-slate-700 dark:text-slate-200"
                }`}
              >
                {/* Fixed-width check gutter so labels stay aligned whether or not
                    the row is selected; the mark disambiguates the *selected*
                    option from the merely *hovered/active* one (both tint indigo). */}
                <span class="flex h-4 w-4 shrink-0 items-center justify-center">
                  <Show when={o.value === props.value}>
                    <IconCheck class="h-4 w-4" />
                  </Show>
                </span>
                <span class="truncate">{o.label}</span>
              </li>
            )}
          </For>
        </ul>
      </Show>
    </div>
  );
}

/** Native hex color input, styled for the light theme. */
export const ColorInput: Component<{
  value: string;
  onChange: (hex: string) => void;
  "aria-label"?: string;
}> = (props) => (
  <input
    type="color"
    aria-label={props["aria-label"]}
    value={props.value}
    onInput={(e) => props.onChange(e.currentTarget.value)}
    class={`h-8 w-10 cursor-pointer rounded-md border border-slate-300 bg-white p-0.5 transition-colors dark:border-slate-600 dark:bg-slate-800 ${FOCUS_RING}`}
  />
);

/** Compact number field used for slideshow interval / quiet-hours minutes. */
export const NumberField: Component<{
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  class?: string;
  "aria-label"?: string;
}> = (props) => (
  <input
    type="number"
    aria-label={props["aria-label"]}
    min={props.min}
    max={props.max}
    step={props.step}
    value={props.value}
    onChange={(e) => {
      let v = Number(e.currentTarget.value);
      if (Number.isNaN(v)) v = props.min ?? 0;
      if (props.min !== undefined) v = Math.max(props.min, v);
      if (props.max !== undefined) v = Math.min(props.max, v);
      props.onChange(v);
    }}
    class={`rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums text-slate-700 outline-none transition-colors focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 ${FOCUS_RING} ${
      props.class ?? ""
    }`}
  />
);

/** Plain "HH:MM" time input, styled to match the kit. */
export const TimeInput: Component<{
  value: string;
  onChange: (v: string) => void;
  "aria-label"?: string;
}> = (props) => (
  <input
    type="time"
    aria-label={props["aria-label"]}
    value={props.value}
    onChange={(e) => props.onChange(e.currentTarget.value)}
    class={`rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm tabular-nums text-slate-700 outline-none transition-colors focus:border-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 ${FOCUS_RING}`}
  />
);

/** Pick one color from a fixed swatch set (used by the message composer). */
export function SwatchPicker<T extends string>(props: {
  options: { value: T; rgb: readonly [number, number, number]; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}): JSX.Element {
  return (
    <div>
      <Show when={props.label}>
        <div class="mb-1 text-xs text-slate-500 dark:text-slate-400">{props.label}</div>
      </Show>
      <div class="flex flex-wrap gap-1.5">
        <For each={props.options}>
          {(o) => (
            <button
              type="button"
              title={o.label}
              aria-label={o.label}
              aria-pressed={props.value === o.value}
              onClick={() => props.onChange(o.value)}
              class={`h-7 w-7 rounded-full border transition-transform ${FOCUS_RING} ${
                props.value === o.value
                  ? "border-indigo-600 ring-2 ring-indigo-500/40 dark:border-indigo-500"
                  : "border-slate-300 hover:scale-105 dark:border-slate-600"
              }`}
              style={{ "background-color": `rgb(${o.rgb[0]}, ${o.rgb[1]}, ${o.rgb[2]})` }}
            />
          )}
        </For>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Alert                                                                       */
/* -------------------------------------------------------------------------- */

export type AlertVariant = "info" | "success" | "error";

const ALERT_STYLES: Record<AlertVariant, { container: string; icon: JSX.Element }> = {
  info: {
    container:
      "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300",
    icon: <IconInfo class="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />,
  },
  success: {
    container:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300",
    icon: <IconCheckCircle class="h-4 w-4 shrink-0 text-emerald-500" />,
  },
  error: {
    container:
      "border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300",
    icon: <IconAlertTriangle class="h-4 w-4 shrink-0 text-red-500" />,
  },
};

export const Alert: ParentComponent<{
  variant?: AlertVariant;
  class?: string;
  live?: boolean;
}> = (props) => {
  const style = () => ALERT_STYLES[props.variant ?? "info"];
  return (
    <div
      role={props.variant === "error" ? "alert" : "status"}
      aria-live={props.live === false ? undefined : "polite"}
      class={`flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs ${style().container} ${
        props.class ?? ""
      }`}
    >
      {style().icon}
      <span class="leading-snug">{props.children}</span>
    </div>
  );
};

/* -------------------------------------------------------------------------- */
/* Modal                                                                       */
/* -------------------------------------------------------------------------- */

export const Modal: ParentComponent<{
  open: boolean;
  onClose: () => void;
  title: string;
  footer?: JSX.Element;
  /** Tailwind max-width class; defaults to a comfortable dialog width. */
  maxWidth?: string;
}> = (props) => {
  const titleId = createUniqueId();
  let dialogRef: HTMLDivElement | undefined;
  // The control that had focus when the dialog opened, so we can hand focus back
  // there on close — otherwise a keyboard/screen-reader user is dumped at the top
  // of the document the moment the dialog goes away.
  let restoreFocusTo: HTMLElement | null = null;

  // Everything the Tab loop is allowed to land on inside the dialog (skips
  // disabled controls and anything explicitly removed from the tab order).
  const focusable = (): HTMLElement[] =>
    dialogRef
      ? Array.from(
          dialogRef.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        )
      : [];

  // Move focus into the dialog when it opens and restore it when it closes. A
  // dialog that leaves focus on the (now visually-hidden) trigger behind the
  // backdrop is a well-known a11y trap: screen readers keep reading the page
  // underneath and keyboard users tab through controls they can't see.
  createEffect(() => {
    if (props.open) {
      restoreFocusTo = document.activeElement as HTMLElement | null;
      // The dialog node is mounted synchronously by <Show> before effects flush.
      // Focus the container itself (tabindex=-1) rather than its first control:
      // the first focusable is the × Close button, and landing there invites an
      // accidental dismiss on Enter/Space. Focusing the dialog lets a screen
      // reader announce the title (aria-labelledby) and leaves Tab to reach the
      // real controls. (WAI-ARIA APG sanctions focusing the dialog element.)
      dialogRef?.focus();
    } else if (restoreFocusTo) {
      restoreFocusTo.focus();
      restoreFocusTo = null;
    }
  });

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && props.open) props.onClose();
    };
    window.addEventListener("keydown", onKey);
    onCleanup(() => window.removeEventListener("keydown", onKey));
  });

  // Keep Tab/Shift+Tab cycling within the dialog so focus can't escape to the
  // inert page behind the backdrop.
  const trapTab = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const items = focusable();
    if (items.length === 0) {
      // Nothing tabbable — pin focus on the container rather than letting it leave.
      e.preventDefault();
      dialogRef?.focus();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialogRef)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <Show when={props.open}>
      {/* Portal to <body>: a modal can be rendered inside a transformed ancestor
          (e.g. a drag-sortable photo row), and a CSS transform becomes the
          containing block for position:fixed — which would clip/mis-position the
          dialog and shrink the click-out overlay to that ancestor. */}
      <Portal>
      <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          class="absolute inset-0 animate-[fadeIn_150ms_ease-out] bg-slate-900/40 backdrop-blur-sm"
          onClick={props.onClose}
          aria-hidden="true"
        />
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          tabindex="-1"
          onKeyDown={trapTab}
          // 90dvh, not 90vh: on mobile browsers vh includes the space behind the
          // collapsing URL bar, which pushes the footer (with the primary action)
          // off-screen; dvh tracks the *visible* viewport.
          class={`relative z-10 flex max-h-[90dvh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl outline-none dark:border-slate-700 dark:bg-slate-800 ${
            props.maxWidth ?? "max-w-md"
          }`}
        >
          <div class="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <h2 id={titleId} class="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {props.title}
            </h2>
            <IconButton onClick={props.onClose} aria-label="Close">
              <IconX />
            </IconButton>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto px-4 py-4">{props.children}</div>
          <Show when={props.footer}>
            <div class="shrink-0 border-t border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/60">
              {props.footer}
            </div>
          </Show>
        </div>
      </div>
      </Portal>
    </Show>
  );
};
