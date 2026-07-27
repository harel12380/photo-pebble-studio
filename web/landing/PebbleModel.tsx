import { type JSX, Show, createSignal, onCleanup, onMount } from "solid-js";
import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { prefersReducedMotion } from "./motion";
import { Device } from "./Device";

/**
 * Real Photo Pebble geometry (v12, the current enclosure — see
 * enclosure/fusion/DESIGN-NOTES.md §7m). Same STLs the owner actually
 * printed, served from web/public/models/pebble-v12/ so this viewer never
 * drifts from the physical object.
 */
const MODEL_BASE = "../models/pebble-v12/";
const PARTS: Array<{ file: string; material: "wood" | "brass" }> = [
  { file: "front_shell.stl", material: "wood" },
  { file: "back_shell.stl", material: "wood" },
  { file: "plunger_next.stl", material: "brass" },
  { file: "plunger_prev.stl", material: "brass" },
];

// Spectra-6 ink palette — mirrors PALETTE in Landing.tsx / the scenes in Device.tsx.
const INK = {
  black: "#1c1c1c",
  paper: "#f4f1e9",
  yellow: "#d9b53a",
  red: "#b0473d",
  blue: "#3f6098",
  green: "#4b7a52",
};

/** Screen window, in the STL's own mm coordinates (DESIGN-NOTES §7m): 57.4 × 85.6 at (0, +5). */
const SCREEN_W = 57.4;
const SCREEN_H = 85.6;
const SCREEN_POS: [number, number, number] = [0, 5, -14.85];

type SceneId = 0 | 1 | 2;

function drawScreen(ctx: CanvasRenderingContext2D, w: number, h: number, scene: SceneId) {
  ctx.clearRect(0, 0, w, h);
  if (scene === 0) {
    // Landscape — sky, sun, hills, tree (mirrors SceneLandscape in Device.tsx).
    const sky = ctx.createLinearGradient(0, 0, 0, h * 0.58);
    sky.addColorStop(0, INK.blue);
    sky.addColorStop(0.7, "#6f86ab");
    sky.addColorStop(1, INK.yellow);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h * 0.58);
    ctx.fillStyle = INK.yellow;
    ctx.beginPath();
    ctx.arc(w * 0.72, h * 0.24, w * 0.13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = INK.red;
    ctx.fillRect(0, h * 0.46, w, h * 0.16);
    const ground = ctx.createLinearGradient(0, h * 0.58, 0, h);
    ground.addColorStop(0, INK.green);
    ground.addColorStop(1, "#3c6444");
    ctx.fillStyle = ground;
    ctx.fillRect(0, h * 0.58, w, h * 0.42);
    ctx.fillStyle = INK.black;
    ctx.fillRect(w * 0.17, h * 0.6, w * 0.03, h * 0.26);
    ctx.fillStyle = INK.green;
    ctx.beginPath();
    ctx.arc(w * 0.19, h * 0.62, w * 0.11, 0, Math.PI * 2);
    ctx.fill();
  } else if (scene === 1) {
    // Night — moon, stars, hills (mirrors SceneNight).
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, INK.black);
    sky.addColorStop(0.75, "#2d3f66");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = INK.paper;
    ctx.beginPath();
    ctx.arc(w * 0.3, h * 0.2, w * 0.1, 0, Math.PI * 2);
    ctx.fill();
    for (const [ty, tx] of [
      [0.08, 0.12],
      [0.58, 0.3],
      [0.78, 0.18],
      [0.34, 0.42],
      [0.42, 0.08],
    ]) {
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(w * tx, h * ty, w * 0.008, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = "#3c6444";
    ctx.fillRect(0, h * 0.7, w, h * 0.3);
  } else {
    // Portrait — two abstract figures (mirrors ScenePortrait).
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#d9b53a22");
    bg.addColorStop(1, INK.paper);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = INK.yellow;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.32, w * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    for (const [cx, color] of [
      [0.42, INK.red],
      [0.62, INK.blue],
    ] as const) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(w * cx, h * 0.63, w * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(w * cx, h * 0.92, w * 0.15, h * 0.16, 0, Math.PI, 0);
      ctx.fill();
    }
  }
}

export type PebbleModelProps = {
  class?: string;
  /** Initial turntable angle in radians, so different placements can face different sides. */
  initialYaw?: number;
  /** Whether the pebble keeps slowly spinning on its own (still drag-able either way). */
  autoRotate?: boolean;
};

/**
 * A real-time WebGL render of the actual v12 enclosure STLs — not a mockup.
 * Auto-rotates gently and responds to drag; the "screen" is a canvas texture
 * cycling the same three ink scenes as the flat <Device> mockup, with a
 * flash between frames standing in for an e-ink refresh. Falls back to the
 * flat CSS <Device> mockup if WebGL or the model fails to load.
 */
export function PebbleModel(props: PebbleModelProps): JSX.Element {
  let container: HTMLDivElement | undefined;
  const [ready, setReady] = createSignal(false);
  const [failed, setFailed] = createSignal(false);

  onMount(() => {
    if (!container) return;
    let disposed = false;
    let raf = 0;
    let renderer: THREE.WebGLRenderer;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";
    renderer.domElement.style.touchAction = "pan-y";
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 1, 4000);

    scene.add(new THREE.AmbientLight(0xfff2df, 0.7));
    const key = new THREE.DirectionalLight(0xffe3ab, 1.6);
    key.position.set(-90, 140, -160);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x8fb3ff, 0.6);
    rim.position.set(90, 50, 170);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 0.22);
    fill.position.set(140, -60, -40);
    scene.add(fill);

    const pebble = new THREE.Group();
    pebble.rotation.y = props.initialYaw ?? 0.55;
    scene.add(pebble);

    const woodMat = new THREE.MeshPhysicalMaterial({
      color: 0xa9764a,
      roughness: 0.52,
      metalness: 0.04,
      clearcoat: 0.16,
      clearcoatRoughness: 0.45,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd8b46a,
      roughness: 0.28,
      metalness: 0.9,
    });

    // The screen — a canvas texture over the real window cutout, double-sided
    // so it reads correctly regardless of which way the plane's normal ends up.
    const screenCanvas = document.createElement("canvas");
    screenCanvas.width = 512;
    screenCanvas.height = Math.round((512 / SCREEN_W) * SCREEN_H);
    const screenCtx = screenCanvas.getContext("2d");
    const screenTex = new THREE.CanvasTexture(screenCanvas);
    screenTex.colorSpace = THREE.SRGBColorSpace;
    const screenMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(SCREEN_W, SCREEN_H),
      new THREE.MeshBasicMaterial({ map: screenTex, side: THREE.DoubleSide }),
    );
    screenMesh.position.set(...SCREEN_POS);
    if (screenCtx) drawScreen(screenCtx, screenCanvas.width, screenCanvas.height, 0);
    screenTex.needsUpdate = true;

    const loader = new STLLoader();
    Promise.all(
      PARTS.map(({ file, material }) =>
        loader.loadAsync(MODEL_BASE + file).then((geometry) => {
          geometry.computeVertexNormals();
          const mesh = new THREE.Mesh(geometry, material === "wood" ? woodMat : brassMat);
          pebble.add(mesh);
        }),
      ),
    )
      .then(() => {
        if (disposed) return;
        pebble.add(screenMesh);

        // Recentre on the true combined bounding box, then frame the camera
        // to it — robust to the exact mm envelope rather than a hardcoded guess.
        const box = new THREE.Box3().setFromObject(pebble);
        const center = box.getCenter(new THREE.Vector3());
        pebble.children.forEach((child) => {
          child.position.sub(center);
        });
        const size = box.getSize(new THREE.Vector3());
        const radius = size.length() / 2;
        const dist = radius / Math.sin((camera.fov * Math.PI) / 360) * 1.35;
        camera.position.set(0, radius * 0.14, -dist);
        camera.lookAt(0, 0, 0);
        camera.near = dist / 50;
        camera.far = dist * 8;
        camera.updateProjectionMatrix();

        setReady(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    // --- sizing -------------------------------------------------------
    const resize = () => {
      if (!container) return;
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    resize();

    // --- drag-to-rotate -------------------------------------------------
    let dragging = false;
    let lastX = 0;
    const el = renderer.domElement;
    const onDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      pebble.rotation.y += dx * 0.012;
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      el.style.cursor = "grab";
      try {
        el.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
    };
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);

    // --- e-ink screen cycle: draw → flash white → next scene -----------
    let sceneIndex: SceneId = 0;
    const cycleScreen = () => {
      if (!screenCtx) return;
      screenCtx.fillStyle = INK.paper;
      screenCtx.fillRect(0, 0, screenCanvas.width, screenCanvas.height);
      screenTex.needsUpdate = true;
      window.setTimeout(() => {
        sceneIndex = (((sceneIndex + 1) % 3) as SceneId);
        drawScreen(screenCtx, screenCanvas.width, screenCanvas.height, sceneIndex);
        screenTex.needsUpdate = true;
      }, 260);
    };
    const cycleInterval = prefersReducedMotion() ? 0 : window.setInterval(cycleScreen, 4800);

    // --- render loop -----------------------------------------------------
    const reduced = prefersReducedMotion();
    const autoRotate = (props.autoRotate ?? true) && !reduced;
    const loop = () => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      if (autoRotate && !dragging && document.visibilityState === "visible") {
        pebble.rotation.y += 0.0032;
      }
      renderer.render(scene, camera);
    };
    loop();

    onCleanup(() => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (cycleInterval) window.clearInterval(cycleInterval);
      ro.disconnect();
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      pebble.traverse((obj) => {
        if (obj instanceof THREE.Mesh) obj.geometry.dispose();
      });
      woodMat.dispose();
      brassMat.dispose();
      screenTex.dispose();
      renderer.dispose();
      container?.removeChild(renderer.domElement);
    });
  });

  return (
    <div class={`relative mx-auto w-full max-w-sm ${props.class ?? ""}`}>
      <div
        class="absolute -inset-10 -z-10 rounded-full opacity-60 blur-3xl"
        style={{ background: "radial-gradient(circle, rgb(251 191 36 / 0.22), transparent 65%)" }}
        aria-hidden="true"
      />
      <Show when={!failed()} fallback={<Device />}>
        <div
          ref={container}
          class="pebble-canvas"
          style={{ "aspect-ratio": "88 / 126" }}
          role="img"
          aria-label="דמות תלת־ממדית מסתובבת של מסגרת Photo Pebble — אפשר לגרור כדי לסובב"
        />
        <Show when={!ready()}>
          <div class="pebble-loading" aria-hidden="true">
            <span class="pebble-spinner" />
          </div>
        </Show>
      </Show>
    </div>
  );
}
