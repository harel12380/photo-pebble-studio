import { type JSX, type ParentProps, For } from "solid-js";

/* The Spectra-6 palette used by all mock scenes: black, white, yellow, red,
 * blue, green — muted to match the real panel's newsprint character. */

/** Stylised landscape built from the panel's six colours (the default scene). */
export function SceneLandscape(): JSX.Element {
  return (
    <>
      {/* Sky */}
      <div
        class="absolute inset-x-0 top-0"
        style={{ height: "58%", background: "linear-gradient(#3f6098, #6f86ab 70%, #d9b53a)" }}
      />
      {/* Sun */}
      <div
        class="absolute rounded-full"
        style={{
          width: "22%",
          "aspect-ratio": "1",
          top: "16%",
          "inset-inline-end": "20%",
          background: "#d9b53a",
          "box-shadow": "0 0 24px 6px rgba(217,181,58,0.6)",
        }}
      />
      {/* Distant hills */}
      <div
        class="absolute inset-x-0"
        style={{ top: "46%", height: "18%", background: "#b0473d", "clip-path": "polygon(0 60%, 25% 20%, 50% 55%, 75% 15%, 100% 50%, 100% 100%, 0 100%)" }}
      />
      {/* Ground */}
      <div
        class="absolute inset-x-0 bottom-0"
        style={{ height: "42%", background: "linear-gradient(#4b7a52, #3c6444)" }}
      />
      {/* Tree */}
      <div
        class="absolute bottom-[10%]"
        style={{ "inset-inline-start": "18%", width: "3%", height: "26%", background: "#1c1c1c" }}
      />
      <div
        class="absolute rounded-full"
        style={{ "inset-inline-start": "10%", bottom: "28%", width: "20%", "aspect-ratio": "1", background: "#4b7a52", border: "2px solid #3c6444" }}
      />
    </>
  );
}

/** Night scene — moon over hills; used by the "quiet hours / battery" story. */
export function SceneNight(): JSX.Element {
  return (
    <>
      <div class="absolute inset-0" style={{ background: "linear-gradient(#1c1c1c, #2d3f66 75%)" }} />
      {/* Moon */}
      <div
        class="absolute rounded-full"
        style={{
          width: "18%",
          "aspect-ratio": "1",
          top: "14%",
          "inset-inline-start": "22%",
          background: "#f4f1e9",
          "box-shadow": "0 0 22px 5px rgba(244,241,233,0.35)",
        }}
      />
      {/* Stars */}
      <For each={[["12%", "8%"], ["30%", "58%"], ["18%", "78%"], ["42%", "34%"], ["8%", "42%"]] as const}>
        {([top, start]) => (
          <div
            class="absolute rounded-full"
            style={{ top, "inset-inline-start": start, width: "1.5%", "aspect-ratio": "1", background: "#f4f1e9", opacity: 0.8 }}
          />
        )}
      </For>
      {/* Hills */}
      <div
        class="absolute inset-x-0 bottom-0"
        style={{ height: "34%", background: "#3c6444", "clip-path": "polygon(0 45%, 30% 10%, 55% 50%, 80% 20%, 100% 55%, 100% 100%, 0 100%)" }}
      />
    </>
  );
}

/** Family-portrait scene — two abstract figures; used by the "privacy" story. */
export function ScenePortrait(): JSX.Element {
  return (
    <>
      <div class="absolute inset-0" style={{ background: "linear-gradient(#d9b53a22, #f4f1e9)" }} />
      {/* Sun-washed backdrop circle */}
      <div
        class="absolute rounded-full"
        style={{ width: "58%", "aspect-ratio": "1", top: "8%", "inset-inline-start": "21%", background: "#d9b53a", opacity: 0.5 }}
      />
      {/* Figure 1 */}
      <div
        class="absolute rounded-full"
        style={{ width: "16%", "aspect-ratio": "1", bottom: "38%", "inset-inline-start": "30%", background: "#b0473d" }}
      />
      <div
        class="absolute"
        style={{ width: "26%", height: "30%", bottom: "0", "inset-inline-start": "25%", background: "#b0473d", "border-radius": "45% 45% 0 0" }}
      />
      {/* Figure 2 */}
      <div
        class="absolute rounded-full"
        style={{ width: "13%", "aspect-ratio": "1", bottom: "34%", "inset-inline-start": "52%", background: "#3f6098" }}
      />
      <div
        class="absolute"
        style={{ width: "22%", height: "26%", bottom: "0", "inset-inline-start": "48%", background: "#3f6098", "border-radius": "45% 45% 0 0" }}
      />
    </>
  );
}

/**
 * A pure-CSS mockup of the Photo Pebble frame: a rounded "pebble" body with a
 * Spectra-6 e-ink screen. Panel content comes from `children` (a Scene* above
 * or any stack of scenes); the dither texture and refresh shimmer are applied
 * on top. No image asset required.
 */
export function Device(
  props: ParentProps<{ class?: string; float?: boolean }>,
): JSX.Element {
  return (
    <div
      class={`${props.float !== false ? "device" : ""} relative mx-auto w-full max-w-sm ${props.class ?? ""}`}
    >
      {/* Warm glow behind the frame — the "stage light" */}
      <div
        class="absolute -inset-10 -z-10 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgb(251 191 36 / 0.22), transparent 65%)" }}
        aria-hidden="true"
      />
      {/* Pebble body — dark graphite with a machined edge highlight */}
      <div class="relative rounded-[2rem] bg-gradient-to-b from-zinc-700 via-zinc-800 to-zinc-900 p-4 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.8)] ring-1 ring-white/15">
        {/* Screen bezel */}
        <div class="relative overflow-hidden rounded-2xl bg-[#1a1a1a] p-2 shadow-inner">
          {/* The e-ink panel (4:3, landscape) */}
          <div
            class="relative overflow-hidden rounded-lg"
            style={{ "aspect-ratio": "4 / 3", background: "#f4f1e9" }}
          >
            {props.children ?? <SceneLandscape />}
            {/* Faint dither texture — tiny dots hint at the e-ink halftone */}
            <div
              class="pointer-events-none absolute inset-0 opacity-25"
              style={{
                "background-image": "radial-gradient(#1c1c1c 0.5px, transparent 0.6px)",
                "background-size": "3px 3px",
              }}
            />
            {/* Refresh sweep */}
            <div class="eink-sweep pointer-events-none absolute inset-0" />
          </div>
        </div>
        {/* Two physical buttons (Prev / Next) */}
        <div class="mt-3 flex items-center justify-center gap-6">
          <For each={["‹", "›"]}>
            {(g) => (
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-600/80 text-xs text-zinc-300 shadow-inner ring-1 ring-white/10">
                {g}
              </span>
            )}
          </For>
        </div>
      </div>
    </div>
  );
}
