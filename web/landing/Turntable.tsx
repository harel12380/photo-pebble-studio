import { type JSX, createSignal, onCleanup, onMount } from "solid-js";
import { prefersReducedMotion } from "./motion";

/**
 * Scroll-scrubbed 360° turntable.
 *
 * The frames are real renders of the current CAD revision (PEBBLE_VERSION in
 * ./pebbleVersion.ts; see ../../../marketing/), exported
 * as 60 WebP stills — the whole sequence is ~420 KB because the studio backdrop
 * compresses extremely well. We scrub a frame sequence rather than seeking a
 * <video>, because `video.currentTime` scrubbing is jittery on Safari/iOS and
 * unreliable while the file is still buffering.
 *
 * Behaviour:
 * - A tall wrapper provides the scroll distance; the canvas is `sticky` inside
 *   it, so the pebble stays pinned and rotates exactly once as you pass through.
 * - Frames are decoded up front; the first frame paints as soon as it lands so
 *   the hero is never empty.
 * - Under `prefers-reduced-motion` (or if the canvas is unavailable) we render a
 *   single static frame and skip all listeners.
 */

const FRAME_COUNT = 60;
const frameUrl = (i: number) =>
  `../landing-media/turntable/f${String(i).padStart(2, "0")}.webp`;

/** Frame shown when we are not animating (a flattering three-quarter angle). */
const STATIC_FRAME = 8;

/**
 * The source frames are 1000×562 landscape plates, but the pebble is a portrait
 * object standing in the middle of a wide studio backdrop: across the whole
 * rotation it only ever occupies x 339–659, y 52–519 (measured over all 60
 * frames). Drawing the full plate therefore spends ~68% of the canvas width on
 * empty backdrop and leaves the product looking tiny.
 *
 * So we draw a crop instead — the swept region plus a little breathing room —
 * expressed in normalised coordinates so it survives a re-render at a different
 * output resolution. The canvas below carries the same aspect ratio, which
 * makes the fit exact.
 */
const CROP = { x: 0.3, y: 0.03, w: 0.4, h: 0.95 };
/** Aspect ratio of the crop, for the canvas box. Portrait, ~3:4. */
const CROP_RATIO = `${CROP.w * 1000} / ${CROP.h * 562}`;
/** How far past 1:1 we are willing to push the source before it goes soft. */
const MAX_UPSCALE = 1.35;

type Props = {
  /** Height of the scroll track, in viewport heights. Default 2.6. */
  track?: number;
  class?: string;
  /** Caption pinned beneath the canvas, inside the sticky stage. */
  caption?: string;
  id?: string;
};

export function Turntable(props: Props): JSX.Element {
  const [ready, setReady] = createSignal(false);
  /** True once the visitor has actually scrubbed — used to retire the hint. */
  const [scrubbed, setScrubbed] = createSignal(false);
  let canvas: HTMLCanvasElement | undefined;
  let wrapper: HTMLDivElement | undefined;
  const images: HTMLImageElement[] = [];
  let raf = 0;
  let current = -1;

  /** Paint frame `i`, sizing the backing store to the device pixel ratio. */
  function draw(i: number) {
    const img = images[i];
    if (!canvas || !img?.complete || img.naturalWidth === 0) return;
    if (i === current) return;
    current = i;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    if (cssW === 0 || cssH === 0) return;

    // The crop is only ~400×522 source pixels, so on a retina display a naive
    // dpr=2 backing store would ask for a ~2× upscale — we would pay for four
    // times the fill rate and get nothing back but a softer image. Cap the
    // backing store at a modest multiple of the source instead and let the
    // browser do the last bit of scaling.
    const srcH = img.naturalHeight * CROP.h;
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      2,
      Math.max(1, (srcH * MAX_UPSCALE) / cssH),
    );
    const w = Math.round(cssW * dpr);
    const h = Math.round(cssH * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingQuality = "high";
    ctx.clearRect(0, 0, w, h);
    // Contain-fit the CROP (not the whole plate) inside the canvas. The canvas
    // carries the crop's aspect ratio, so in practice this fills it exactly.
    const sx = img.naturalWidth * CROP.x;
    const sy = img.naturalHeight * CROP.y;
    const sw = img.naturalWidth * CROP.w;
    const sh = img.naturalHeight * CROP.h;
    const scale = Math.min(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    ctx.drawImage(img, sx, sy, sw, sh, (w - dw) / 2, (h - dh) / 2, dw, dh);
    feather(ctx, w, h);
  }

  /**
   * Erase the outer edges to transparent so the cropped studio backdrop
   * dissolves into the page instead of reading as a pasted rectangle.
   *
   * Done here rather than with a CSS mask because a two-layer mask needs
   * `mask-composite`, whose standard and `-webkit-` forms take different
   * keywords and are not aliases of one another. `destination-out` is
   * universally supported and leaves the result under our control.
   *
   * The fades stay inside the crop's padding — across the whole rotation the
   * pebble never comes closer than ~6% to the top/bottom or ~10% to the sides —
   * so nothing on the object itself is touched.
   */
  function feather(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const fx = w * 0.06;
    const fy = h * 0.04;
    ctx.globalCompositeOperation = "destination-out";

    /** Erase a strip, fading from fully erased at (x0,y0) to nothing at (x1,y1). */
    const strip = (
      x0: number,
      y0: number,
      x1: number,
      y1: number,
      rx: number,
      ry: number,
      rw: number,
      rh: number,
    ) => {
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      g.addColorStop(0, "rgba(0,0,0,1)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(rx, ry, rw, rh);
    };

    strip(0, 0, fx, 0, 0, 0, fx, h); // left
    strip(w, 0, w - fx, 0, w - fx, 0, fx, h); // right
    strip(0, 0, 0, fy, 0, 0, w, fy); // top
    strip(0, h, 0, h - fy, 0, h - fy, w, fy); // bottom

    ctx.globalCompositeOperation = "source-over";
  }

  function frameForScroll(): number {
    if (!wrapper) return STATIC_FRAME;
    const rect = wrapper.getBoundingClientRect();
    const distance = rect.height - window.innerHeight;
    if (distance <= 0) return STATIC_FRAME;
    const progress = Math.min(Math.max(-rect.top / distance, 0), 1);
    // Once the pebble has visibly turned, the "scroll to rotate" hint has done
    // its job and would only sit in the way.
    if (progress > 0.06 && !scrubbed()) setScrubbed(true);
    return Math.min(FRAME_COUNT - 1, Math.round(progress * (FRAME_COUNT - 1)));
  }

  function onScroll() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      draw(frameForScroll());
    });
  }

  /** On resize the CSS box changes but the frame index usually does not, so
   *  `draw` would early-out and leave a stale backing store. Force a repaint. */
  function onResize() {
    current = -1;
    onScroll();
  }

  onMount(() => {
    const reduced = prefersReducedMotion();

    // Kick off decoding. The first frame to arrive paints immediately so the
    // hero shows something well before the whole sequence is in.
    for (let i = 0; i < FRAME_COUNT; i++) {
      const img = new Image();
      img.decoding = "async";
      img.src = frameUrl(i);
      img.onload = () => {
        if (!ready()) {
          setReady(true);
          draw(reduced ? STATIC_FRAME : frameForScroll());
        }
        if (i === STATIC_FRAME && reduced) draw(STATIC_FRAME);
      };
      images[i] = img;
    }

    if (reduced) return;

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    onScroll();
    onCleanup(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (raf) cancelAnimationFrame(raf);
    });
  });

  return (
    <div
      ref={wrapper}
      id={props.id}
      class={`turntable-track relative ${props.class ?? ""}`}
      style={{ height: `${(props.track ?? 2.6) * 100}vh` }}
    >
      <div class="sticky top-0 flex h-screen flex-col items-center justify-center">
        {/* The stage is sized from viewport HEIGHT, not a fixed max-width: the
            subject is portrait and the stage is pinned full-screen, so height
            is the constraint that actually matters. Width follows from the
            crop's aspect ratio. */}
        <div class="turntable-stage relative flex justify-center px-6">
          <canvas
            ref={canvas}
            class="turntable-canvas"
            style={{ "aspect-ratio": CROP_RATIO }}
            aria-hidden="true"
          />
        </div>

        {/* Stage footer. Lives inside the sticky box so it travels with the
            canvas instead of colliding with it at the end of the track. */}
        {/* `min-h` rather than a fixed `h`: the height is reserved so the stage
            does not jump when the hint retires, but the caption wraps to three
            lines on a phone and must be allowed to grow. */}
        <div class="mt-5 flex min-h-10 w-full max-w-[560px] flex-col items-center gap-2 px-6">
          <span
            class="turntable-hint text-xs text-zinc-400"
            classList={{ "is-hidden": !ready() || scrubbed() }}
            aria-hidden="true"
          >
            גללו כדי לסובב ↓
          </span>
          {props.caption && (
            <p class="text-center text-xs leading-relaxed text-zinc-400">
              {props.caption}
            </p>
          )}
        </div>
      </div>

      <span class="sr-only">
        הדמיה מסתובבת של Photo Pebble — מסגרת תמונות מעץ אלון עם מסך דיו
        אלקטרוני בשישה צבעים.
      </span>
    </div>
  );
}
