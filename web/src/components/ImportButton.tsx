/**
 * "Import from card": continue a project from an existing card. When the File
 * System Access API is available we open a directory picker and read the folder
 * in place; otherwise we fall back to picking a previously downloaded .zip.
 * Progress/result is reflected from state.importStatus.
 */
import { Show, type Component } from "solid-js";
import { state, importCard } from "../state/store";
import { useI18n } from "../i18n";
import { Alert, Button, IconUpload } from "./ui";

type DirPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>;
};

function directoryPickerSupported(): boolean {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

export const ImportButton: Component = () => {
  const { t } = useI18n();
  let input: HTMLInputElement | undefined;
  const busy = () => state.importStatus.phase === "processing";

  const pickDirectory = async () => {
    try {
      const handle = await (window as DirPickerWindow).showDirectoryPicker!();
      await importCard(handle);
    } catch (err) {
      // The user dismissing the picker is not an error worth surfacing.
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  };

  const onClick = () => {
    if (directoryPickerSupported()) void pickDirectory();
    else input?.click();
  };

  return (
    <>
      <Button variant="default" onClick={onClick} disabled={busy()} title={t("import.hint")}>
        <IconUpload class="h-4 w-4" />
        {busy() ? t("import.reading") : t("action.import")}
      </Button>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        class="hidden"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void importCard(file);
        }}
      />
      <Show when={state.importStatus.phase === "error"}>
        <Alert variant="error" class="mt-2">
          {state.importStatus.message}
        </Alert>
      </Show>
    </>
  );
};
