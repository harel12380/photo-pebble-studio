import type { OrderedMatrix } from '../types';

/**
 * Threshold maps for ordered dithering. A map is a tile of values in (0,1); each
 * pixel reads `thresh[(y % size) * size + (x % size)]`, converts it to a signed
 * bias (value − 0.5), and perturbs the color before nearest-palette matching. No
 * error is propagated, so ordered dithering is stateless and stable across pans.
 *
 *  - Bayer 2/4/8: classic recursively-generated dispersed-dot matrices. Cheap,
 *    but the regular cross-hatch is visible.
 *  - Halftone (clustered-dot 4×4): newsprint look.
 *  - Blue noise: a void-and-cluster mask whose spectrum has no low-frequency
 *    energy, so the residual texture reads as fine film grain instead of a grid —
 *    by far the best-looking memoryless option. Generated once and cached.
 */

export interface ThresholdMap {
  size: number;
  /** Values in (0,1), row-major, length size*size. */
  thresh: Float32Array;
}

const cache = new Map<OrderedMatrix, ThresholdMap>();

export function getOrderedMap(m: OrderedMatrix): ThresholdMap {
  let map = cache.get(m);
  if (map) return map;
  switch (m) {
    case 'bayer2':
      map = bayer(2);
      break;
    case 'bayer4':
      map = bayer(4);
      break;
    case 'bayer8':
      map = bayer(8);
      break;
    case 'cluster4':
      map = clustered4();
      break;
    case 'blue-noise':
      map = blueNoise(64);
      break;
  }
  cache.set(m, map);
  return map;
}

/** Recursive Bayer matrix of side n (power of two). */
function bayer(n: number): ThresholdMap {
  let m: number[][] = [[0]];
  let size = 1;
  while (size < n) {
    const ns = size * 2;
    const next: number[][] = Array.from({ length: ns }, () =>
      new Array<number>(ns).fill(0),
    );
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const v = m[y][x];
        next[y][x] = 4 * v;
        next[y][x + size] = 4 * v + 2;
        next[y + size][x] = 4 * v + 3;
        next[y + size][x + size] = 4 * v + 1;
      }
    }
    m = next;
    size = ns;
  }
  const thresh = new Float32Array(n * n);
  const denom = n * n;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) thresh[y * n + x] = (m[y][x] + 0.5) / denom;
  }
  return { size: n, thresh };
}

// Clustered-dot 4×4 ("spiral"): thresholds grow outward from the center.
const CLUSTER4 = [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14];

function clustered4(): ThresholdMap {
  const thresh = new Float32Array(16);
  for (let i = 0; i < 16; i++) thresh[i] = (CLUSTER4[i] + 0.5) / 16;
  return { size: 4, thresh };
}

/* ----------------------------- blue noise ----------------------------- */

// Small deterministic PRNG so the generated mask is identical every run.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Void-and-cluster (Ulichney 1993) blue-noise threshold mask.
 *
 * Maintains a toroidal "energy" field = sum of Gaussian footprints of the set
 * pixels. The tightest cluster is the set pixel of maximum energy; the largest
 * void is the unset pixel of minimum energy. Ranking every pixel by repeatedly
 * removing tight clusters / filling large voids yields a tileable mask with a
 * blue (high-frequency) spectrum. Done once at ~64×64 — a few ms.
 */
function blueNoise(n: number): ThresholdMap {
  const N = n * n;
  const sigma = 1.5;
  const R = 4;
  // Precompute the Gaussian footprint offsets and weights.
  const fdx: number[] = [];
  const fdy: number[] = [];
  const fw: number[] = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) {
      fdx.push(dx);
      fdy.push(dy);
      fw.push(Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma)));
    }
  }
  const fn = fw.length;

  const energy = new Float64Array(N);
  const binary = new Uint8Array(N);

  const splat = (idx: number, sign: number): void => {
    const px = idx % n;
    const py = (idx / n) | 0;
    for (let f = 0; f < fn; f++) {
      const x = (((px + fdx[f]) % n) + n) % n;
      const y = (((py + fdy[f]) % n) + n) % n;
      energy[y * n + x] += sign * fw[f];
    }
  };
  const setOne = (idx: number): void => {
    binary[idx] = 1;
    splat(idx, 1);
  };
  const clearOne = (idx: number): void => {
    binary[idx] = 0;
    splat(idx, -1);
  };
  const tightestCluster = (): number => {
    let best = -1;
    let bestE = -Infinity;
    for (let i = 0; i < N; i++) {
      if (binary[i] === 1 && energy[i] > bestE) {
        bestE = energy[i];
        best = i;
      }
    }
    return best;
  };
  const largestVoid = (): number => {
    let best = -1;
    let bestE = Infinity;
    for (let i = 0; i < N; i++) {
      if (binary[i] === 0 && energy[i] < bestE) {
        bestE = energy[i];
        best = i;
      }
    }
    return best;
  };

  // 1. Seed ~10% ones at distinct random positions.
  const ones = Math.max(1, Math.round(N * 0.1));
  const rnd = mulberry32(0x9e3779b1);
  let placed = 0;
  while (placed < ones) {
    const idx = (rnd() * N) | 0;
    if (binary[idx] === 0) {
      setOne(idx);
      placed++;
    }
  }

  // 2. Stabilize into the "prototype": move tightest cluster -> largest void.
  for (let guard = 0; guard < N * 4; guard++) {
    const c = tightestCluster();
    clearOne(c);
    const v = largestVoid();
    setOne(v);
    if (v === c) break;
  }
  const prototype = binary.slice();

  const rank = new Int32Array(N);

  // Phase 1: rank the prototype ones by removing tightest clusters (ranks ones-1..0).
  for (let rk = ones - 1; rk >= 0; rk--) {
    const c = tightestCluster();
    rank[c] = rk;
    clearOne(c);
  }

  // Restore the prototype and rebuild the energy field.
  binary.set(prototype);
  energy.fill(0);
  for (let i = 0; i < N; i++) if (binary[i] === 1) splat(i, 1);

  // Phase 2+3: fill largest voids one at a time (ranks ones..N-1). The single
  // "min-energy empty pixel" rule covers both <50% and >50% density.
  for (let rk = ones; rk < N; rk++) {
    const v = largestVoid();
    rank[v] = rk;
    setOne(v);
  }

  const thresh = new Float32Array(N);
  for (let i = 0; i < N; i++) thresh[i] = (rank[i] + 0.5) / N;
  return { size: n, thresh };
}
