import type { DitherJob } from './dither.worker';
import { run } from './pool';
import type { RGB } from '../cardFormat';
import type { DitherConfig } from '../types';

/**
 * Main-thread handle to dithering. Jobs are dispatched to a pool of Web Workers
 * (see ./pool) so that DISTINCT concurrent {@link ditherImage} calls run in
 * parallel on different cores — the batch export no longer serializes one photo
 * at a time. The pool keeps the heavy pixel loop off the UI thread while bounding
 * the number of workers and queueing excess work FIFO.
 *
 * Earlier this module ran a single worker and coalesced requests latest-wins to
 * stop a dragged edit slider from flooding the queue with multi-megabyte frames.
 * That global coalescing also cancelled concurrent batch jobs, which is exactly
 * what we want to avoid here. Correctness no longer depends on superseding: the
 * store discards stale results via a per-photo rev guard, so we prioritize
 * parallel throughput and simply let the pool's FIFO queue absorb bursts.
 */

/**
 * Thrown to a caller whose dither request was replaced by a newer one. Retained
 * for API compatibility (store.ts imports it and treats it as a no-op); the
 * pool-based client does not currently produce it, but callers must still handle
 * it gracefully.
 */
export class DitherSupersededError extends Error {
  constructor() {
    super('dither request superseded by a newer one');
    this.name = 'DitherSupersededError';
  }
}

/**
 * Dither one already-edited image (panel-resolution RGBA) into palette indices.
 * Resolves with the palette indices. Distinct concurrent calls run in parallel
 * across the worker pool.
 */
export async function ditherImage(
  image: ImageData | { data: Uint8ClampedArray; width: number; height: number },
  palette: readonly RGB[],
  config: DitherConfig,
): Promise<Uint8Array> {
  // Copy before transfer so the caller's ImageData buffer stays usable. Canvas
  // ImageData (and our edited frames) are always ArrayBuffer-backed, never
  // SharedArrayBuffer, so narrowing the slice to ArrayBuffer is safe here.
  const buf = image.data.buffer.slice(0) as ArrayBuffer;
  const job: DitherJob = {
    pixels: buf,
    width: image.width,
    height: image.height,
    palette: palette.map((c) => [c[0], c[1], c[2]] as RGB),
    config,
  };
  return run(job, [buf]);
}
