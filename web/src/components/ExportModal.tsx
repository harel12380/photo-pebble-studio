/**
 * Export dialog: pick the file format, see the card summary, and write the
 * bundle either as a downloadable .zip or straight into a chosen folder (when
 * the File System Access API is available). Surfaces validation issues and the
 * live render progress so nothing is exported half-rendered.
 */
import { For, Show, createMemo, type Component } from "solid-js";
import { state, setOutputFormat, exportBundle, syncClock, validateForExport } from "../state/store";
import { directoryWriteSupported } from "../pipeline/bundle";
import { displaySize, type ImageFileFormat } from "../cardFormat";
import { useI18n } from "../i18n";
import { Alert, Button, IconClock, IconDownload, IconUpload, Modal, Segmented } from "./ui";

const Stat: Component<{ label: string; value: string }> = (props) => (
  <div class="rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-800/60">
    <div class="text-sm font-semibold text-slate-800 dark:text-slate-100">{props.value}</div>
    <div class="text-[11px] uppercase tracking-wide text-slate-400 dark:text-slate-400">{props.label}</div>
  </div>
);

export const ExportModal: Component<{ open: boolean; onClose: () => void }> = (props) => {
  const { t } = useI18n();
  const dims = () => displaySize(state.orientation);
  const fsa = directoryWriteSupported();
  const busy = () =>
    state.batch.active ||
    state.exportStatus.phase === "processing" ||
    state.exportStatus.phase === "building";
  const canExport = () => state.photos.length > 0 && !busy();
  // Surface pre-flight issues live (errored / still-rendering photos).
  const issues = createMemo(() => (props.open ? validateForExport() : []));

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t("export.title")}
      footer={
        <div class="flex flex-col gap-2">
          <Show when={fsa}>
            <Button
              variant="primary"
              disabled={!canExport()}
              onClick={() => void exportBundle("directory")}
            >
              <IconUpload class="h-4 w-4" />
              {t("export.folder")}
            </Button>
          </Show>
          <Button
            variant={fsa ? "default" : "primary"}
            disabled={!canExport()}
            onClick={() => void exportBundle("zip")}
          >
            <IconDownload class="h-4 w-4" />
            {t("export.zip")}
          </Button>
          <Show when={fsa}>
            <Button variant="ghost" disabled={busy()} onClick={() => void syncClock()}>
              <IconClock class="h-4 w-4" />
              {t("export.setClock")}
            </Button>
          </Show>
        </div>
      }
    >
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-3 gap-2 text-center">
          <Stat label={t("export.count")} value={String(state.photos.length)} />
          <Stat label={t("export.resolution")} value={`${dims().width}×${dims().height}`} />
          <Stat
            label={t("export.format")}
            value={state.output.format === "indexed4" ? ".bin" : ".bmp"}
          />
        </div>

        <div class="flex items-center justify-between gap-2">
          <span class="text-sm text-slate-600 dark:text-slate-300">{t("export.format")}</span>
          <Segmented<ImageFileFormat>
            size="sm"
            options={[
              { value: "indexed4", label: t("export.format.bin") },
              { value: "bmp", label: t("export.format.bmp") },
            ]}
            value={state.output.format}
            onChange={setOutputFormat}
          />
        </div>

        <p class="text-xs text-slate-500 dark:text-slate-400">{t("export.copyHint")}</p>
        <Show when={fsa}>
          <p class="text-xs text-slate-500 dark:text-slate-400">{t("export.setClockHint")}</p>
        </Show>

        <Show when={state.batch.active}>
          <div>
            <div class="mb-1 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">
              {t("status.rendering")} {state.batch.done}/{state.batch.total}
            </div>
            <div class="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                class="h-full bg-indigo-500 transition-all"
                style={{
                  width: `${state.batch.total ? (state.batch.done / state.batch.total) * 100 : 0}%`,
                }}
              />
            </div>
          </div>
        </Show>

        <Show when={!busy() && issues().length > 0}>
          <Alert variant="error">
            <div>
              <div class="font-medium">{t("export.issues")}</div>
              <ul class="mt-1 list-disc space-y-0.5 ps-4">
                <For each={issues()}>{(issue) => <li>{issue}</li>}</For>
              </ul>
            </div>
          </Alert>
        </Show>

        <Show when={state.exportStatus.phase === "done"}>
          <Alert variant="success">{state.exportStatus.message}</Alert>
        </Show>
        <Show when={state.exportStatus.phase === "error"}>
          <Alert variant="error">{state.exportStatus.message}</Alert>
        </Show>
        <Show
          when={
            state.exportStatus.phase === "processing" || state.exportStatus.phase === "building"
          }
        >
          <Alert variant="info">{state.exportStatus.message}</Alert>
        </Show>
      </div>
    </Modal>
  );
};
