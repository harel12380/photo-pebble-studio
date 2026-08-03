import { type JSX, type ParentProps, onCleanup, onMount } from "solid-js";
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
 * A framed render with an optional caption. Every image here is a real render
 * of the CAD at PEBBLE_VERSION, produced by the pipeline documented in `marketing/README.md`
 * and copied into `web/public/landing-media/`.
 */
export function Figure(props: {
  src: string;
  alt: string;
  caption?: string;
  /** Set on above-the-fold images so they are not lazy-loaded. */
  eager?: boolean;
  ratio?: string;
  class?: string;
  imgClass?: string;
}): JSX.Element {
  return (
    <figure class={`group ${props.class ?? ""}`}>
      <div class="media-frame overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
        <img
          src={props.src}
          alt={props.alt}
          loading={props.eager ? "eager" : "lazy"}
          decoding="async"
          class={`block h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.03] ${props.imgClass ?? ""}`}
          style={props.ratio ? { "aspect-ratio": props.ratio } : undefined}
        />
      </div>
      {props.caption && (
        <figcaption class="mt-3 text-center text-sm text-zinc-400">
          {props.caption}
        </figcaption>
      )}
    </figure>
  );
}

/**
 * A muted, looping clip that only plays while it is on screen, so an offscreen
 * video never burns battery. Under reduced motion it never starts and the
 * poster frame stands in.
 */
export function AutoVideo(props: {
  webm: string;
  mp4: string;
  poster: string;
  alt: string;
  class?: string;
}): JSX.Element {
  let el: HTMLVideoElement | undefined;

  onMount(() => {
    if (!el || prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) void el?.play().catch(() => {});
          else el?.pause();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    onCleanup(() => io.disconnect());
  });

  return (
    <video
      ref={el}
      class={`block w-full rounded-2xl border border-white/10 ${props.class ?? ""}`}
      poster={props.poster}
      muted
      loop
      playsinline
      preload="metadata"
      aria-label={props.alt}
    >
      <source src={props.webm} type="video/webm" />
      <source src={props.mp4} type="video/mp4" />
    </video>
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
