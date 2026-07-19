/**
 * Read-only metadata for a photo, shown in a modal from the list's info button.
 * Surfaces the dates the studio knows about (EXIF capture time, file
 * last-modified, and when it was added here) plus source/size/type/dimensions.
 *
 * Note: browsers don't expose a file's *creation* time — only last-modified — so
 * that's what "modified" reflects; EXIF "date taken" is the real capture time
 * when the photo carries it.
 */
import { For, Show, createResource, type Component } from "solid-js";
import type { Photo } from "../types";
import { useI18n } from "../i18n";
import { Modal } from "./ui";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export const PhotoInfo: Component<{
  photo: Photo;
  open: boolean;
  onClose: () => void;
}> = (props) => {
  const { t, locale } = useI18n();

  const fmtDate = (ms?: number): string =>
    ms === undefined
      ? t("info.unknown")
      : new Date(ms).toLocaleString(locale() === "he" ? "he-IL" : "en-US", {
          dateStyle: "medium",
          timeStyle: "short",
        });

  // Decode the original lazily (only while the modal is open) for true pixel dims.
  const [dims] = createResource(
    () => (props.open ? props.photo.blob : undefined),
    async (blob) => {
      try {
        const bm = await createImageBitmap(blob);
        const d = `${bm.width} × ${bm.height}`;
        bm.close?.();
        return d;
      } catch {
        return null;
      }
    },
  );

  const rows = (): [string, string][] => [
    [t("info.name"), props.photo.name],
    [t("info.source"), t(`source.${props.photo.sourceKind}`)],
    [t("info.dimensions"), dims() ?? t("info.unknown")],
    [t("info.size"), formatBytes(props.photo.blob.size)],
    [
      t("info.type"),
      props.photo.blob.type ||
        (props.photo.originalExt ? `image/${props.photo.originalExt}` : t("info.unknown")),
    ],
    [t("info.taken"), fmtDate(props.photo.takenAt)],
    [t("info.modified"), fmtDate(props.photo.modifiedAt)],
    [t("info.added"), fmtDate(props.photo.addedAt)],
  ];

  return (
    <Modal open={props.open} onClose={props.onClose} title={t("info.title")}>
      <dl class="flex flex-col divide-y divide-slate-100 text-sm dark:divide-slate-700">
        <For each={rows()}>
          {([label, value]) => (
            <div class="flex items-start justify-between gap-4 py-1.5">
              <dt class="shrink-0 text-slate-500 dark:text-slate-400">{label}</dt>
              <dd class="min-w-0 break-words text-end text-slate-800 dark:text-slate-100" dir="auto">
                <Show
                  when={value}
                  fallback={<span class="text-slate-400 dark:text-slate-400">{t("info.unknown")}</span>}
                >
                  {value}
                </Show>
              </dd>
            </div>
          )}
        </For>
      </dl>
    </Modal>
  );
};
