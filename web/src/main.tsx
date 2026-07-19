import { ErrorBoundary } from "solid-js";
import { render } from "solid-js/web";
import App from "./App";
import { I18nProvider } from "./i18n";
import { installGlobalErrorLogging, log } from "./log";
import "./index.css";

installGlobalErrorLogging();

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

/*
 * Last-resort crash screen. It sits OUTSIDE the I18nProvider so it still
 * renders if the provider itself throws, which is why its two strings are
 * hardcoded bilingually instead of going through the dictionaries.
 */
function CrashFallback(err: unknown, reset: () => void) {
  log.error("render crashed", err);
  return (
    <div class="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <p class="text-lg font-semibold" dir="rtl" lang="he">
        משהו השתבש. הנתונים שלך שמורים במכשיר.
      </p>
      <p class="text-sm opacity-70" dir="ltr" lang="en">
        Something went wrong. Your data is safe on this device.
      </p>
      <button
        type="button"
        class="rounded-lg border px-4 py-2 text-sm"
        onClick={() => {
          reset();
          window.location.reload();
        }}
      >
        רענון · Reload
      </button>
    </div>
  );
}

render(
  () => (
    <ErrorBoundary fallback={CrashFallback}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </ErrorBoundary>
  ),
  root,
);

// Offline support: register the service worker in production builds only.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is best-effort */
    });
  });
}
