/**
 * Message composer — turn text (typically Hebrew) into a frame on the device.
 *
 * Three layouts: a standalone text card, a photo with a solid text band, or
 * text laid over a photo. Everything is chosen from the fixed 6-colour panel
 * palette and previewed live at the current panel resolution. On save the
 * message is rendered to an image and added to the gallery, so it flows through
 * the same dither + export pipeline as a photo; its MessageSpec is stored in the
 * card manifest so it stays editable after a round-trip.
 */
import {
  Show,
  createEffect,
  createSignal,
  splitProps,
  type Component,
  type JSX,
} from "solid-js";
import { state, addMessageImage, updateMessage } from "../../state/store";
import {
  FONT_IDS,
  defaultMessage,
  detectDirection,
  paletteColor,
  type FontId,
  type MessageLayout,
  type MessagePlacement,
  type MessageSpec,
  type PaletteColorId,
  type TextAlign,
  type VerticalAlign,
} from "../../types";
import { displaySize } from "../../cardFormat";
import { useI18n } from "../../i18n";
import { fontFamily } from "../../fonts";
import { drawMessage, renderMessage } from "../../message/render";
import {
  Button,
  IconImage,
  IconMessage,
  Modal,
  Segmented,
  Select,
  Slider,
  SwatchPicker,
  Toggle,
} from "../ui";

const COLOR_IDS: PaletteColorId[] = ["black", "white", "yellow", "red", "blue", "green"];

function swatchOptions(t: (k: string) => string) {
  return COLOR_IDS.map((id) => ({ value: id, rgb: paletteColor(id).rgb, label: t(`color.${id}`) }));
}

const PREVIEW_LONG_EDGE = 360;

export interface MessageEditorProps {
  /** Present when editing an existing message item (vs. creating a new one). */
  editId?: string;
  initial?: MessageSpec;
}

const MessageEditorModal: Component<
  MessageEditorProps & { open: boolean; onClose: () => void }
> = (props) => {
  const { t } = useI18n();
  const [spec, setSpec] = createSignal<MessageSpec>(props.initial ?? defaultMessage());
  const [baseImage, setBaseImage] = createSignal<ImageBitmap | null>(null);
  const [busy, setBusy] = createSignal(false);
  // Once the user touches the RTL toggle we stop auto-steering direction from
  // the text, so an explicit choice is never overridden by later typing.
  const [dirTouched, setDirTouched] = createSignal(false);
  const patch = (p: Partial<MessageSpec>) => setSpec((s) => ({ ...s, ...p }));

  // Editing the text: keep the typed value and, unless the user has manually
  // set direction, follow the first strong character (Hebrew→rtl, Latin→ltr).
  // This is the common case for a Hebrew-first composer — type and it just
  // reads correctly, no hunting for a toggle.
  const editText = (text: string) => {
    if (dirTouched()) {
      patch({ text });
      return;
    }
    const dir = detectDirection(text);
    patch(dir ? { text, direction: dir } : { text });
  };
  let preview: HTMLCanvasElement | undefined;

  createEffect(() => {
    if (props.open) {
      setSpec(props.initial ?? defaultMessage());
      setBaseImage(null);
      setDirTouched(false);
    }
  });

  const needsImage = () => spec().layout !== "card";

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      setBaseImage(await createImageBitmap(file));
    } catch {
      /* ignore unreadable image */
    }
  };

  // Live preview: redraw whenever the spec or chosen image changes.
  createEffect(() => {
    const current = spec();
    const img = baseImage();
    const { width, height } = displaySize(state.orientation);
    const canvas = preview;
    if (!canvas) return;
    const scale = PREVIEW_LONG_EDGE / Math.max(width, height);
    const pw = Math.round(width * scale);
    const ph = Math.round(height * scale);
    canvas.width = pw;
    canvas.height = ph;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Fonts are bundled and generally ready; redraw once more after load to be safe.
    drawMessage(ctx, current, pw, ph, img);
    if ("fonts" in document) {
      void document.fonts.ready.then(() => {
        if (preview === canvas) drawMessage(ctx, current, pw, ph, img);
      });
    }
  });

  const save = async () => {
    setBusy(true);
    try {
      const { width, height } = displaySize(state.orientation);
      const blob = await renderMessage(spec(), { width, height, baseImage: baseImage() });
      if (props.editId) updateMessage(props.editId, spec(), blob);
      else addMessageImage(blob, spec());
      props.onClose();
    } finally {
      setBusy(false);
    }
  };

  const fontOptions = FONT_IDS.map((id) => ({ value: id, label: fontFamily(id) }));
  const layoutOptions: { value: MessageLayout; label: string }[] = [
    { value: "card", label: t("message.layout.card") },
    { value: "band", label: t("message.layout.band") },
    { value: "overlay", label: t("message.layout.overlay") },
  ];
  const alignOptions: { value: TextAlign; label: string }[] = [
    { value: "start", label: t("align.start") },
    { value: "center", label: t("align.center") },
    { value: "end", label: t("align.end") },
  ];
  const vAlignOptions: { value: VerticalAlign; label: string }[] = [
    { value: "top", label: t("pos.top") },
    { value: "middle", label: t("pos.center") },
    { value: "bottom", label: t("pos.bottom") },
  ];

  const canSave = () =>
    spec().text.trim().length > 0 && (!needsImage() || baseImage() !== null) && !busy();

  return (
    <Modal
      open={props.open}
      onClose={props.onClose}
      title={t("message.title")}
      maxWidth="max-w-3xl"
      footer={
        <div class="flex justify-end gap-2">
          <Button variant="ghost" onClick={props.onClose}>
            {t("action.cancel")}
          </Button>
          <Button variant="primary" disabled={!canSave()} onClick={() => void save()}>
            {t("action.save")}
          </Button>
        </div>
      }
    >
      <div class="flex flex-col gap-5 md:flex-row">
        {/* Preview */}
        <div class="md:w-1/2">
          <div class="bg-checker overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
            <canvas ref={preview} class="mx-auto block max-w-full" />
          </div>
          <Show when={needsImage()}>
            <label class="mt-2 flex">
              <input
                type="file"
                accept="image/*"
                class="hidden"
                onChange={(e) => void pickImage(e.currentTarget.files?.[0])}
              />
              <span class="inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700/60">
                <IconImage class="h-4 w-4" />
                {baseImage() ? t("message.changeImage") : t("message.chooseImage")}
              </span>
            </label>
            <Show when={needsImage() && !baseImage()}>
              <p class="mt-1 text-center text-xs text-slate-400 dark:text-slate-400">{t("message.needsImage")}</p>
            </Show>
          </Show>
        </div>

        {/* Controls */}
        <div class="flex flex-col gap-4 md:w-1/2">
          <Segmented<MessageLayout>
            options={layoutOptions}
            value={spec().layout}
            onChange={(v) => patch({ layout: v })}
          />

          <label class="block">
            <span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("message.text")}</span>
            <textarea
              rows={3}
              dir={spec().direction}
              value={spec().text}
              placeholder={t("message.textPlaceholder")}
              onInput={(e) => editText(e.currentTarget.value)}
              class="w-full resize-y rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition-colors focus:border-indigo-500 focus-visible:ring-2 focus-visible:ring-indigo-500/60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </label>

          <div class="grid grid-cols-2 gap-3">
            <label class="block">
              <span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("message.font")}</span>
              <Select<FontId>
                value={spec().fontId}
                onChange={(v) => patch({ fontId: v })}
                options={fontOptions}
                class="w-full"
              />
            </label>
            <div>
              <span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("message.weight")}</span>
              <Segmented<string>
                size="sm"
                options={[
                  { value: "400", label: t("message.weight.regular") },
                  { value: "700", label: t("message.weight.bold") },
                ]}
                value={String(spec().fontWeight)}
                onChange={(v) => patch({ fontWeight: Number(v) })}
              />
            </div>
          </div>

          <Slider
            label={t("message.size")}
            min={4}
            max={40}
            value={Math.round(spec().fontScale * 100)}
            display={(v) => `${v}%`}
            onChange={(v) => patch({ fontScale: v / 100 })}
          />
          <Slider
            label={t("message.lineSpacing")}
            min={90}
            max={200}
            value={Math.round(spec().lineSpacing * 100)}
            display={(v) => `${(v / 100).toFixed(2)}×`}
            onChange={(v) => patch({ lineSpacing: v / 100 })}
          />
          <Slider
            label={t("message.padding")}
            min={0}
            max={25}
            value={Math.round(spec().paddingPct * 100)}
            display={(v) => `${v}%`}
            onChange={(v) => patch({ paddingPct: v / 100 })}
          />

          {/* Vertical position only has an effect on the standalone card: band
              text is centred in its band and overlay text follows the overlay
              position control, so we hide the dead control elsewhere. */}
          <div class={spec().layout === "card" ? "grid grid-cols-2 gap-3" : ""}>
            <div>
              <span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("message.align")}</span>
              <Segmented<TextAlign>
                size="sm"
                options={alignOptions}
                value={spec().align}
                onChange={(v) => patch({ align: v })}
              />
            </div>
            <Show when={spec().layout === "card"}>
              <div>
                <span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("message.valign")}</span>
                <Segmented<VerticalAlign>
                  size="sm"
                  options={vAlignOptions}
                  value={spec().vAlign}
                  onChange={(v) => patch({ vAlign: v })}
                />
              </div>
            </Show>
          </div>

          <div class="grid grid-cols-2 gap-3">
            <SwatchPicker
              label={t("message.textColor")}
              options={swatchOptions(t)}
              value={spec().textColor}
              onChange={(v) => patch({ textColor: v })}
            />
            <Show when={spec().layout !== "overlay"}>
              <SwatchPicker
                label={t("message.bgColor")}
                options={swatchOptions(t)}
                value={spec().backgroundColor}
                onChange={(v) => patch({ backgroundColor: v })}
              />
            </Show>
          </div>

          {/* Band controls */}
          <Show when={spec().layout === "band"}>
            <div class="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <div>
                <span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">{t("message.band.edge")}</span>
                <Segmented<"top" | "bottom" | "left" | "right">
                  size="sm"
                  options={[
                    { value: "top", label: t("pos.top") },
                    { value: "bottom", label: t("pos.bottom") },
                    { value: "left", label: t("pos.left") },
                    { value: "right", label: t("pos.right") },
                  ]}
                  value={spec().band?.edge ?? "bottom"}
                  onChange={(edge) =>
                    patch({ band: { edge, sizePct: spec().band?.sizePct ?? 0.25 } })
                  }
                />
              </div>
              <Slider
                label={t("message.band.size")}
                min={10}
                max={50}
                value={Math.round((spec().band?.sizePct ?? 0.25) * 100)}
                display={(v) => `${v}%`}
                onChange={(v) =>
                  patch({ band: { edge: spec().band?.edge ?? "bottom", sizePct: v / 100 } })
                }
              />
            </div>
          </Show>

          {/* Overlay controls */}
          <Show when={spec().layout === "overlay"}>
            <div class="flex flex-col gap-3 rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
              <div>
                <span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">
                  {t("message.overlay.position")}
                </span>
                <Segmented<"top" | "center" | "bottom">
                  size="sm"
                  options={[
                    { value: "top", label: t("pos.top") },
                    { value: "center", label: t("pos.center") },
                    { value: "bottom", label: t("pos.bottom") },
                  ]}
                  value={spec().overlay?.position ?? "bottom"}
                  onChange={(position) =>
                    patch({ overlay: { position, scrim: spec().overlay?.scrim ?? true } })
                  }
                />
              </div>
              <Toggle
                label={t("message.overlay.scrim")}
                checked={spec().overlay?.scrim ?? true}
                onChange={(scrim) =>
                  patch({
                    overlay: { position: spec().overlay?.position ?? "bottom", scrim },
                  })
                }
              />
            </div>
          </Show>

          <Toggle
            label={t("message.rtl")}
            checked={spec().direction === "rtl"}
            onChange={(on) => {
              setDirTouched(true);
              patch({ direction: on ? "rtl" : "ltr" });
            }}
          />

          {/* When the frame shows this message: normal random rotation, or
              pinned to be the first thing shown after new card data. */}
          <div>
            <span class="mb-1 block text-xs text-slate-500 dark:text-slate-400">
              {t("message.placement")}
            </span>
            <Segmented<MessagePlacement>
              size="sm"
              options={[
                { value: "random", label: t("message.placement.random") },
                { value: "intro", label: t("message.placement.intro") },
              ]}
              value={spec().placement ?? "random"}
              onChange={(v) => patch({ placement: v })}
            />
            <Show when={(spec().placement ?? "random") === "intro"}>
              <p class="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                {t("message.placement.hint")}
              </p>
            </Show>
          </div>
        </div>
      </div>
    </Modal>
  );
};

/**
 * Self-contained "Add message" trigger + dialog for the header. Accepts the
 * usual button attributes so it can be styled inline.
 */
export const MessageEditor: Component<
  { variant?: "default" | "primary" | "ghost" } & JSX.ButtonHTMLAttributes<HTMLButtonElement>
> = (props) => {
  const { t } = useI18n();
  const [local, rest] = splitProps(props, ["variant"]);
  const [open, setOpen] = createSignal(false);
  return (
    <>
      <Button variant={local.variant ?? "default"} onClick={() => setOpen(true)} {...rest}>
        <IconMessage class="h-4 w-4" />
        {t("action.addMessage")}
      </Button>
      <MessageEditorModal open={open()} onClose={() => setOpen(false)} />
    </>
  );
};

/**
 * Controlled variant for editing an existing message item (opened from the
 * photo list / editor). Renders no trigger of its own.
 */
export const MessageEditDialog: Component<{
  editId: string;
  initial: MessageSpec;
  open: boolean;
  onClose: () => void;
}> = (props) => (
  <MessageEditorModal
    open={props.open}
    onClose={props.onClose}
    editId={props.editId}
    initial={props.initial}
  />
);
