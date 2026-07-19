/**
 * App shell for the Photo Pebble studio.
 *
 * Header: brand + import/message/export + settings. Below it, either the
 * empty-state hero (drop zone + privacy note) or the working two-pane layout —
 * sources & photo list on one side, the editor (preview beside its per-photo
 * controls) filling the rest. Card-wide settings, language, and theme live in
 * the settings dialog behind the gear button. Everything is RTL-correct
 * (logical spacing) and localized from the start.
 */
import { Show, createSignal, onCleanup, onMount } from "solid-js";
import { useI18n } from "./i18n";
import { state, hydrate, addImages, clearAll, setSortMode, saveStatus } from "./state/store";
import { pasteEventToImported } from "./sources/clipboard";
import { SORT_MODES, type SortMode } from "./types";
import { DropZone } from "./components/DropZone";
import { PhotoList } from "./components/PhotoList";
import { EditorPanel } from "./components/EditorPanel";
import { SettingsModal } from "./components/SettingsModal";
import { ExportModal } from "./components/ExportModal";
import { ImportButton } from "./components/ImportButton";
import { MessageEditor } from "./components/message/MessageEditor";
import { Button, IconButton, IconDownload, IconSettings, Modal, Select } from "./components/ui";

export default function App() {
  const { t } = useI18n();
  const [exportOpen, setExportOpen] = createSignal(false);
  const [settingsOpen, setSettingsOpen] = createSignal(false);
  const [clearConfirmOpen, setClearConfirmOpen] = createSignal(false);
  const hasPhotos = () => state.photos.length > 0;

  // Rendered twice in the header: beside the title on phones (where the action
  // row wraps to its own line and a lone gear would waste a third line) and at
  // the end of the action row on wider screens.
  const SettingsButton = () => (
    <IconButton
      onClick={() => setSettingsOpen(true)}
      aria-label={t("settings.title")}
      title={t("settings.title")}
    >
      <IconSettings class="h-4 w-4" />
    </IconButton>
  );

  onMount(() => {
    void hydrate();
  });

  // Paste anywhere (outside text fields) adds images from the clipboard.
  onMount(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      const imgs = pasteEventToImported(e);
      if (imgs.length > 0) {
        e.preventDefault();
        addImages(imgs);
      }
    };
    window.addEventListener("paste", onPaste);
    onCleanup(() => window.removeEventListener("paste", onPaste));
  });

  return (
    <div class="flex h-full flex-col overflow-hidden">
      <header class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-800 sm:px-5">
        <div class="flex w-full items-center justify-between gap-2 sm:w-auto">
        <div class="flex items-baseline gap-2">
          <h1 class="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            {t("app.name")}
          </h1>
          <span class="hidden text-xs text-slate-500 dark:text-slate-400 sm:inline">
            {t("app.tagline")}
          </span>
          <Show when={hasPhotos()}>
            <span
              class="inline-flex items-center gap-1 text-xs text-slate-400 dark:text-slate-400"
              aria-live="polite"
            >
              <span
                class="h-1.5 w-1.5 rounded-full"
                classList={{
                  "bg-amber-400": saveStatus() === "saving",
                  "bg-red-500": saveStatus() === "error",
                  "bg-emerald-500": saveStatus() === "saved" || saveStatus() === "idle",
                }}
              />
              {saveStatus() === "saving"
                ? t("save.saving")
                : saveStatus() === "error"
                  ? t("save.error")
                  : t("save.saved")}
            </span>
          </Show>
        </div>
        <span class="sm:hidden">
          <SettingsButton />
        </span>
        </div>

        <div class="flex flex-wrap items-center gap-2 sm:gap-3">
          <ImportButton />
          <MessageEditor variant="default" />
          <Button variant="primary" onClick={() => setExportOpen(true)} disabled={!hasPhotos()}>
            <IconDownload class="h-4 w-4" />
            {t("action.export")}
          </Button>
          <span class="hidden sm:contents">
            <SettingsButton />
          </span>
        </div>
      </header>

      <Show
        when={hasPhotos()}
        fallback={
          <main class="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 p-6">
            <DropZone />
            <p class="text-center text-xs text-slate-400 dark:text-slate-400">{t("empty.privacy")}</p>
          </main>
        }
      >
        <main class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4 lg:flex-row lg:overflow-hidden">
          {/* Sidebar: sources + photo list */}
          <aside class="flex w-full flex-col gap-3 lg:h-full lg:min-h-0 lg:w-72">
            <DropZone compact />
            <div class="flex shrink-0 items-center gap-2">
              <Select<SortMode>
                value={state.sortMode}
                aria-label={t("sort.label")}
                onChange={setSortMode}
                options={SORT_MODES.map((m) => ({ value: m, label: t(`sort.${m}`) }))}
                class="min-w-0 flex-1"
              />
              <Button variant="danger" onClick={() => setClearConfirmOpen(true)}>
                {t("action.clear")}
              </Button>
            </div>
            {/* The list's dedicated scroll container — PhotoList's drag logic
                relies on this being scrollable at every breakpoint (below lg it
                is height-capped so it scrolls internally instead of growing
                the page). */}
            <div class="-me-1 max-h-[45vh] overflow-y-auto overscroll-contain pe-1 lg:max-h-none lg:min-h-0 lg:flex-1">
              <PhotoList />
            </div>
          </aside>

          {/* Editor: preview beside the selected photo's controls */}
          <section class="min-w-0 flex-1 lg:h-full lg:overflow-y-auto">
            <EditorPanel />
          </section>
        </main>
      </Show>

      <SettingsModal open={settingsOpen()} onClose={() => setSettingsOpen(false)} />
      <ExportModal open={exportOpen()} onClose={() => setExportOpen(false)} />

      <Modal
        open={clearConfirmOpen()}
        onClose={() => setClearConfirmOpen(false)}
        title={t("clear.confirm.title")}
        maxWidth="max-w-sm"
        footer={
          <div class="flex justify-end gap-2">
            <Button variant="default" onClick={() => setClearConfirmOpen(false)}>
              {t("action.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearAll();
                setClearConfirmOpen(false);
              }}
            >
              {t("clear.confirm.ok")}
            </Button>
          </div>
        }
      >
        <p class="text-sm text-slate-600 dark:text-slate-300">{t("clear.confirm.body")}</p>
      </Modal>
    </div>
  );
}
