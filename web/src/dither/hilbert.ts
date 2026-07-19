/**
 * Hilbert space-filling curve, used by Riemersma dithering. The curve visits
 * every cell of a 2^order × 2^order grid such that consecutive cells are always
 * adjacent — so error carried forward stays spatially local without the
 * directional "worm" artifacts of raster error diffusion.
 */

/** Smallest `order` with 2^order >= max(width, height). */
export function hilbertOrder(width: number, height: number): number {
  return Math.ceil(Math.log2(Math.max(1, width, height)));
}

/** Map a distance `d` along the curve to its (x, y) on a 2^order grid. */
export function hilbertD2XY(order: number, d: number): [number, number] {
  let x = 0;
  let y = 0;
  let t = d;
  const n = 1 << order;
  for (let s = 1; s < n; s <<= 1) {
    const rx = 1 & (t >> 1);
    const ry = 1 & (t ^ rx);
    // Rotate the quadrant so the curve stays continuous.
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      const tmp = x;
      x = y;
      y = tmp;
    }
    x += s * rx;
    y += s * ry;
    t >>= 2;
  }
  return [x, y];
}
