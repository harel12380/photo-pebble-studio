import * as Comlink from 'comlink';
import type { DitherWorkerApi, DitherJob } from './dither.worker';

/**
 * A small fixed-size pool of dithering Web Workers. Distinct jobs are dispatched
 * to whatever worker is free so they run in parallel across cores; when every
 * worker is busy, jobs queue FIFO and drain as workers free up.
 *
 * The single-worker client serialized everything, so a batch of N photos
 * dithered one after another. Spreading them over `poolSize()` workers lets the
 * heavy per-pixel loop use multiple cores at once, roughly dividing wall-clock
 * batch time by the number of workers.
 *
 * Workers are created lazily on first use (and only as many as the queue
 * actually needs), so importing this module costs nothing until a job runs.
 */

/** Pool size: one worker per logical core, clamped to a sane [1, 8] range. */
export function poolSize(): number {
  const cores =
    typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 4 : 4;
  return Math.min(8, Math.max(1, cores));
}

interface PoolWorker {
  worker: Worker;
  api: Comlink.Remote<DitherWorkerApi>;
  busy: boolean;
}

const MAX_WORKERS = poolSize();
const workers: PoolWorker[] = [];

interface Waiter {
  job: DitherJob;
  transfer: Transferable[];
  resolve: (indices: Uint8Array) => void;
  reject: (err: unknown) => void;
}

const queue: Waiter[] = [];

function spawnWorker(): PoolWorker {
  const worker = new Worker(new URL('./dither.worker.ts', import.meta.url), {
    type: 'module',
  });
  const w: PoolWorker = {
    worker,
    api: Comlink.wrap<DitherWorkerApi>(worker),
    busy: false,
  };
  workers.push(w);
  return w;
}

/** Find a free worker, lazily spawning one if we're below the cap. */
function freeWorker(): PoolWorker | null {
  for (const w of workers) {
    if (!w.busy) return w;
  }
  if (workers.length < MAX_WORKERS) return spawnWorker();
  return null;
}

function dispatch(w: PoolWorker, task: Waiter): void {
  w.busy = true;
  w.api
    .dither(Comlink.transfer(task.job, task.transfer))
    .then(task.resolve, task.reject)
    .finally(() => {
      w.busy = false;
      pump();
    });
}

/** Hand any queued jobs to whatever workers are free. */
function pump(): void {
  while (queue.length > 0) {
    const w = freeWorker();
    if (!w) break; // all workers busy — wait for one to free up
    dispatch(w, queue.shift()!);
  }
}

/**
 * Run one dither job on the next free worker, queueing FIFO when the pool is
 * saturated. `transfer` lists buffers to hand to the worker (zero-copy).
 */
export function run(
  job: DitherJob,
  transfer: Transferable[],
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    queue.push({ job, transfer, resolve, reject });
    pump();
  });
}
