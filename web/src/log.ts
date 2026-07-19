/**
 * Tiny logging seam. The studio is fully client-side, so "logging" means the
 * browser console — but going through one module gives us a consistent prefix,
 * silences debug chatter in production builds, and leaves one place to hook a
 * reporting backend later if we ever want one.
 */

const PREFIX = "Photo Pebble:";

export const log = {
  /** Verbose diagnostics — emitted in dev builds only. */
  debug(...args: unknown[]): void {
    if (import.meta.env.DEV) console.debug(PREFIX, ...args);
  },
  /** Recoverable problems the user may notice (skipped file, bad manifest…). */
  warn(...args: unknown[]): void {
    console.warn(PREFIX, ...args);
  },
  /** Failures — always emitted, including production. */
  error(...args: unknown[]): void {
    console.error(PREFIX, ...args);
  },
} as const;

/**
 * Install last-resort handlers for errors nothing else caught, so production
 * failures at least leave a consistent trace instead of vanishing.
 */
export function installGlobalErrorLogging(): void {
  window.addEventListener("error", (event) => {
    log.error("uncaught error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    log.error("unhandled promise rejection", event.reason);
  });
}
