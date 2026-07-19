import { type JSX, type ParentProps, mergeProps } from "solid-js";
import { prefersReducedMotion } from "./motion";

/**
 * A card with a Linear-style pointer spotlight: a soft radial highlight that
 * follows the cursor. The gradient lives in CSS (`.spot-card::after`,
 * landing.css); we only write --mx/--my custom properties, throttled to one
 * write per animation frame. Degrades to nothing on touch / reduced-motion.
 */
export function SpotlightCard(
  props: ParentProps<{ class?: string }>,
): JSX.Element {
  let el: HTMLDivElement | undefined;
  let raf = 0;

  function onMove(e: PointerEvent) {
    if (!el || prefersReducedMotion()) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${clientX - r.left}px`);
      el.style.setProperty("--my", `${clientY - r.top}px`);
    });
  }

  return (
    <div ref={el} onPointerMove={onMove} class={`spot-card ${props.class ?? ""}`}>
      {props.children}
    </div>
  );
}

/**
 * A captioned placeholder for a real photo/render the owner drops in later.
 * SWAP POINT: replace this with `<img src="..." />` once assets live in
 * `web/landing/assets/` (or `web/public/landing/`).
 */
export function Placeholder(
  props: { caption: string; ratio?: string; class?: string },
): JSX.Element {
  const merged = mergeProps({ ratio: "4 / 3" }, props);
  return (
    <div
      class={`flex items-center justify-center rounded-2xl border border-dashed border-white/15 bg-white/[0.03] text-center ${props.class ?? ""}`}
      style={{ "aspect-ratio": merged.ratio }}
    >
      <div class="flex flex-col items-center gap-2 p-6 text-zinc-500">
        <svg
          class="h-8 w-8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <circle cx="8.5" cy="9.5" r="1.5" />
          <path d="m4 18 5-5 4 4 3-3 4 4" />
        </svg>
        <span class="text-sm font-medium">{props.caption}</span>
      </div>
    </div>
  );
}

/** A rounded spec chip with an emoji glyph, styled for the dark theme. */
export function SpecChip(props: { icon: string; label: string }): JSX.Element {
  return (
    <span class="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-zinc-300 backdrop-blur">
      <span aria-hidden="true" class="text-base">
        {props.icon}
      </span>
      {props.label}
    </span>
  );
}
