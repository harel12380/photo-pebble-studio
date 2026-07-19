import * as Comlink from 'comlink';
import { ditherToIndices } from './algorithms';
import type { RGB } from '../cardFormat';
import type { DitherConfig } from '../types';

/** A single dithering job. `pixels` is RGBA bytes, transferred (not copied). */
export interface DitherJob {
  pixels: ArrayBuffer;
  width: number;
  height: number;
  palette: RGB[];
  config: DitherConfig;
}

const api = {
  dither(job: DitherJob): Uint8Array {
    const pixels = new Uint8ClampedArray(job.pixels);
    const indices = ditherToIndices(
      pixels,
      job.width,
      job.height,
      job.palette,
      job.config,
    );
    // Transfer the result buffer back to the main thread (no copy).
    return Comlink.transfer(indices, [indices.buffer]);
  },
};

export type DitherWorkerApi = typeof api;

Comlink.expose(api);
