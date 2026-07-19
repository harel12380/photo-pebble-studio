/**
 * Drag-and-drop / file-picker / clipboard entry point for adding photos.
 *
 * The same component serves the empty-state hero (full) and the sidebar
 * (compact). Drop and the global paste listener (in App) both funnel into
 * addImages; an explicit "paste" button covers browsers/flows where the
 * keyboard shortcut isn't convenient.
 */
import { Show, createSignal, type Component } from "solid-js";
import { addImages } from "../state/store";
import { dataTransferToImported, filesToImported } from "../sources/localFiles";
import { readClipboardImages } from "../sources/clipboard";
import { useI18n } from "../i18n";
import { Alert, Button, IconImage, IconUpload } from "./ui";

export const DropZone: Component<{ compact?: boolean }> = (props) => {
  const { t } = useI18n();
  let input: HTMLInputElement | undefined;
  const [dragOver, setDragOver] = createSignal(false);
  const [pasteError, setPasteError] = createSignal<string | null>(null);

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer) addImages(dataTransferToImported(e.dataTransfer));
  };

  const onPaste = async () => {
    setPasteError(null);
    try {
      addImages(await readClipboardImages());
    } catch (err) {
      setPasteError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      class={`rounded-xl border-2 border-dashed text-center transition-colors ${
        dragOver()
          ? "border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-500/15"
          : "border-slate-300 bg-slate-50/60 hover:border-slate-400 dark:border-slate-600 dark:bg-slate-800/60 dark:hover:border-slate-500"
      } ${props.compact ? "p-4" : "p-10"}`}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        onChange={(e) => {
          if (e.currentTarget.files) addImages(filesToImported(e.currentTarget.files));
          e.currentTarget.value = "";
        }}
      />

      <Show when={!props.compact}>
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
          <IconImage class="h-6 w-6" />
        </div>
        <p class="mb-1 text-base font-medium text-slate-800 dark:text-slate-100">{t("empty.title")}</p>
        <p class="mb-5 text-sm text-slate-500 dark:text-slate-400">{t("empty.subtitle")}</p>
      </Show>

      <div class="flex flex-wrap items-center justify-center gap-2">
        <Button variant="primary" onClick={() => input?.click()}>
          <IconUpload class="h-4 w-4" />
          {props.compact ? t("action.addPhotos") : t("empty.cta")}
        </Button>
        <Button variant="default" onClick={() => void onPaste()}>
          {t("action.paste")}
        </Button>
      </div>

      <Show when={pasteError()}>
        <Alert variant="error" class="mt-3 justify-center text-start">
          {pasteError()}
        </Alert>
      </Show>
    </div>
  );
};
