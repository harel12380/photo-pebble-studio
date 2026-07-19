import type { DitherAlgorithm } from '../types';

/**
 * Error-diffusion kernels. Each cell is (dx, dy, weight): dx = horizontal offset
 * from the current pixel in the direction of travel (positive = ahead), dy = rows
 * below (0 = current row). Weights are already divided by the kernel's divisor, so
 * they sum to 1 — except Atkinson, which intentionally diffuses only 6/8 of the
 * error (the rest is dropped, giving its crisp high-contrast look).
 *
 * Coefficients verified against Tanner Helland's "Image Dithering: Eleven
 * Algorithms" and the hitherdither reference; the Shiau–Fan / Fan / Stevenson–Arce
 * weights against DitherPunk.jl and the original papers.
 */

export interface KernelEntry {
  dx: number;
  dy: number;
  w: number;
}

function k(divisor: number, cells: [number, number, number][]): KernelEntry[] {
  return cells.map(([dx, dy, wi]) => ({ dx, dy, w: wi / divisor }));
}

export const DIFFUSION_KERNELS: Partial<Record<DitherAlgorithm, KernelEntry[]>> = {
  // X 7 / 3 5 1  (÷16)
  'floyd-steinberg': k(16, [
    [1, 0, 7],
    [-1, 1, 3],
    [0, 1, 5],
    [1, 1, 1],
  ]),
  // X 1 1 / 1 1 1 / . 1 .  (÷8, only 6/8 diffused)
  atkinson: k(8, [
    [1, 0, 1],
    [2, 0, 1],
    [-1, 1, 1],
    [0, 1, 1],
    [1, 1, 1],
    [0, 2, 1],
  ]),
  'jarvis-judice-ninke': k(48, [
    [1, 0, 7],
    [2, 0, 5],
    [-2, 1, 3],
    [-1, 1, 5],
    [0, 1, 7],
    [1, 1, 5],
    [2, 1, 3],
    [-2, 2, 1],
    [-1, 2, 3],
    [0, 2, 5],
    [1, 2, 3],
    [2, 2, 1],
  ]),
  stucki: k(42, [
    [1, 0, 8],
    [2, 0, 4],
    [-2, 1, 2],
    [-1, 1, 4],
    [0, 1, 8],
    [1, 1, 4],
    [2, 1, 2],
    [-2, 2, 1],
    [-1, 2, 2],
    [0, 2, 4],
    [1, 2, 2],
    [2, 2, 1],
  ]),
  burkes: k(32, [
    [1, 0, 8],
    [2, 0, 4],
    [-2, 1, 2],
    [-1, 1, 4],
    [0, 1, 8],
    [1, 1, 4],
    [2, 1, 2],
  ]),
  sierra: k(32, [
    [1, 0, 5],
    [2, 0, 3],
    [-2, 1, 2],
    [-1, 1, 4],
    [0, 1, 5],
    [1, 1, 4],
    [2, 1, 2],
    [-1, 2, 2],
    [0, 2, 3],
    [1, 2, 2],
  ]),
  'sierra-two-row': k(16, [
    [1, 0, 4],
    [2, 0, 3],
    [-2, 1, 1],
    [-1, 1, 2],
    [0, 1, 3],
    [1, 1, 2],
    [2, 1, 1],
  ]),
  'sierra-lite': k(4, [
    [1, 0, 2],
    [-1, 1, 1],
    [0, 1, 1],
  ]),
  fan: k(16, [
    [1, 0, 7],
    [-2, 1, 1],
    [-1, 1, 3],
    [0, 1, 5],
  ]),
  'shiau-fan': k(8, [
    [1, 0, 4],
    [-2, 1, 1],
    [-1, 1, 1],
    [0, 1, 2],
  ]),
  'shiau-fan-2': k(16, [
    [1, 0, 8],
    [-3, 1, 1],
    [-2, 1, 1],
    [-1, 1, 2],
    [0, 1, 4],
  ]),
  // Hexagonally-sampled (alternate dx parity per row); ÷200.
  'stevenson-arce': k(200, [
    [2, 0, 32],
    [-3, 1, 12],
    [-1, 1, 26],
    [1, 1, 30],
    [3, 1, 16],
    [-2, 2, 12],
    [0, 2, 26],
    [2, 2, 12],
    [-3, 3, 5],
    [-1, 3, 12],
    [1, 3, 12],
    [3, 3, 5],
  ]),
};
