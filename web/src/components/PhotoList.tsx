/**
 * The ordered photo list: thumbnail, name, processing status, delete, and
 * drag-to-reorder. Thumbnails show the original photo (the dithered result is
 * hard to recognize at tile size); the tile is dimmed while a photo renders.
 *
 * Reordering uses @thisbeyond/solid-dnd: each row is a sortable whose drag
 * *handle* is the grip/number gutter — not the whole row. The row itself must
 * stay free of touch-none/drag activators so a finger swipe over it scrolls the
 * list (row-wide activators made the list unscrollable on phones). Dropping
 * commits the new order through reorderPhotos (which also switches sortMode to
 * "manual").
 */
import { For, Show, createMemo, createSignal, onCleanup, type Component } from "solid-js";
import {
  DragDropProvider,
  DragDropSensors,
  DragOverlay,
  SortableProvider,
  closestCenter,
  createSortable,
  transformStyle,
  useDragDropContext,
  type DragEvent,
  type Transformer,
} from "@thisbeyond/solid-dnd";
import {
  state,
  selectPhoto,
  selectAdjacent,
  removePhoto,
  reorderPhotos,
  movePhotoStep,
} from "../state/store";
import type { Photo } from "../types";
import { useI18n } from "../i18n";
import { PhotoInfo } from "./PhotoInfo";
import { IconGrip, IconInfo, IconX } from "./ui";

const STATUS_DOT: Record<string, string> = {
  error: "bg-red-500",
  processing: "bg-amber-400 animate-pulse",
  ready: "bg-emerald-500",
  idle: "bg-slate-300 dark:bg-slate-600",
};

const StatusDot: Component<{ photo: Photo }> = (props) => {
  const { t } = useI18n();
  const kind = () =>
    props.photo.status === "error"
      ? "error"
      : props.photo.status === "processing" || props.photo.dirty
        ? "processing"
        : props.photo.status === "ready"
          ? "ready"
          : "idle";
  const label = () =>
    kind() === "error"
      ? t("status.error")
      : kind() === "processing"
        ? t("status.processing")
        : t("status.ready");
  return (
    <span class="inline-flex shrink-0 items-center" title={props.photo.error ?? label()}>
      <span class={`h-2 w-2 rounded-full ${STATUS_DOT[kind()]}`} aria-hidden="true" />
      <span class="sr-only">{label()}</span>
    </span>
  );
};

const Thumb: Component<{ photo: Photo }> = (props) => (
  <img
    src={props.photo.originalUrl}
    alt=""
    class="h-full w-full object-contain"
    classList={{ "opacity-40": !props.photo.result }}
  />
);

/** The floating ghost shown under the pointer while dragging (rendered inside a
 *  DragOverlay). It mirrors a row's content without the interactive controls. */
const OverlayRow: Component<{ photo: Photo }> = (props) => (
  <div class="flex cursor-grabbing items-center gap-2 rounded-lg border border-indigo-400 bg-white p-2 shadow-lg ring-2 ring-indigo-500/40 dark:border-indigo-500 dark:bg-slate-800">
    <span class="flex w-5 shrink-0 justify-center text-slate-400">
      <IconGrip class="h-4 w-4" />
    </span>
    <div class="bg-checker h-11 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-700">
      <Thumb photo={props.photo} />
    </div>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-1.5">
        <StatusDot photo={props.photo} />
        <span class="truncate text-sm text-slate-700 dark:text-slate-200">{props.photo.name}</span>
      </div>
    </div>
  </div>
);

const PhotoRow: Component<{
  photo: Photo;
  index: number;
  registerRef: (id: string, el: HTMLElement | null) => void;
  onNavigate: (id: string | null) => void;
}> = (props) => {
  const { t } = useI18n();
  const sortable = createSortable(props.photo.id);
  const selected = () => props.photo.id === state.selectedId;
  const [infoOpen, setInfoOpen] = createSignal(false);

  onCleanup(() => props.registerRef(props.photo.id, null));

  // Roving-focus keyboard navigation: Arrow keys move the selection (and focus)
  // between rows; Alt+Arrow moves the focused row itself one step (the keyboard
  // equivalent of drag-to-reorder); Enter/Space (re)selects the focused row.
  // Only the selected row is a tab stop (tabindex 0), so Tab enters and leaves
  // the list in one step.
  const onKeyDown = (e: KeyboardEvent) => {
    // Ignore keys bubbling up from the nested action buttons (info/delete)
    // — they own their own activation; only the row itself drives navigation.
    if (e.target !== e.currentTarget) return;
    // Reorder the focused row and keep focus on it (the row keeps its selection,
    // so its tabindex stays 0 and it remains the same DOM node after the move).
    const move = (delta: number) => {
      e.preventDefault();
      if (movePhotoStep(props.photo.id, delta)) props.onNavigate(props.photo.id);
    };
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        if (e.altKey) return move(1);
        e.preventDefault();
        props.onNavigate(selectAdjacent(1));
        break;
      case "ArrowUp":
      case "ArrowLeft":
        if (e.altKey) return move(-1);
        e.preventDefault();
        props.onNavigate(selectAdjacent(-1));
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        selectPhoto(props.photo.id);
        break;
    }
  };

  return (
    <div
      ref={(el) => {
        sortable.ref(el);
        props.registerRef(props.photo.id, el);
      }}
      // The dragged row is drawn by the DragOverlay (a fixed-position ghost that
      // tracks the pointer under scroll); the in-flow row stays put as a faint
      // placeholder, so it must not also carry the pointer-follow transform.
      style={sortable.isActiveDraggable ? undefined : transformStyle(sortable.transform)}
      role="option"
      aria-selected={selected()}
      tabindex={selected() ? 0 : -1}
      onClick={() => selectPhoto(props.photo.id)}
      onKeyDown={onKeyDown}
      class={`group flex cursor-pointer items-center gap-2 rounded-lg border p-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${
        selected()
          ? "border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-500/15"
          : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-slate-600"
      } ${sortable.isActiveDraggable ? "opacity-30" : ""}`}
    >
      {/* Drag handle. touch-none is confined to this gutter so the rest of the
          row still scrolls the list under a finger; on coarse pointers the grip
          is always visible (there is no hover to reveal it). */}
      <span
        {...sortable.dragActivators}
        title={t("photo.dragHint")}
        class="flex w-5 shrink-0 cursor-grab touch-none items-center justify-center self-stretch text-slate-400 active:cursor-grabbing pointer-coarse:w-7 dark:text-slate-400"
      >
        <span class="font-mono text-xs group-hover:hidden pointer-coarse:hidden">
          {String(props.index + 1).padStart(2, "0")}
        </span>
        <span
          class="hidden items-center justify-center group-hover:inline-flex pointer-coarse:inline-flex"
          aria-hidden="true"
        >
          <IconGrip class="h-4 w-4" />
        </span>
      </span>
      <div class="bg-checker h-11 w-14 shrink-0 overflow-hidden rounded-md ring-1 ring-slate-200 dark:ring-slate-700">
        <Thumb photo={props.photo} />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1.5">
          <StatusDot photo={props.photo} />
          <span class="truncate text-sm text-slate-700 dark:text-slate-200" title={props.photo.name}>
            {props.photo.name}
          </span>
        </div>
        <Show when={props.photo.status === "error"}>
          <span class="block truncate text-xs text-red-500">{props.photo.error}</span>
        </Show>
      </div>
      <button
        type="button"
        title={t("action.info")}
        aria-label={`${t("action.info")} ${props.photo.name}`}
        onClick={(e) => {
          e.stopPropagation();
          setInfoOpen(true);
        }}
        class="shrink-0 rounded-md p-1 text-slate-500 opacity-0 transition-opacity hover:bg-indigo-50 hover:text-indigo-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 group-hover:opacity-100 pointer-coarse:p-1.5 pointer-coarse:opacity-100 dark:text-slate-400 dark:hover:bg-indigo-500/15 dark:hover:text-indigo-300"
      >
        <IconInfo class="h-4 w-4" />
      </button>
      <button
        type="button"
        title={t("action.delete")}
        aria-label={`${t("action.delete")} ${props.photo.name}`}
        onClick={(e) => {
          e.stopPropagation();
          removePhoto(props.photo.id);
        }}
        class="shrink-0 rounded-md p-1 text-slate-500 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 group-hover:opacity-100 pointer-coarse:p-1.5 pointer-coarse:opacity-100 dark:text-slate-400 dark:hover:bg-red-500/15 dark:hover:text-red-400"
      >
        <IconX />
      </button>
      <PhotoInfo photo={props.photo} open={infoOpen()} onClose={() => setInfoOpen(false)} />
    </div>
  );
};

/**
 * Drag ergonomics, built on one rule: while a drag is in flight, the ONLY thing
 * on the page allowed to scroll is the list's own scroll container.
 *
 *  - The list always has a dedicated scroll container (its parent element, at
 *    every breakpoint — see App.tsx), so auto-scroll never has to target the
 *    page. Because that container holds nothing but the list, the browser's
 *    native scrollTop clamping bounds the auto-scroll; it cannot overshoot.
 *  - Every scrollable ancestor above it (main, and <html> itself) is frozen
 *    with overflow hidden/clip for the duration of the drag, then restored.
 *    This also hides Chrome's quirk of counting the fixed-position DragOverlay
 *    ghost toward the document's scroll height.
 *  - Dragging is locked to the vertical axis, so a stray sideways drag can't
 *    push the ghost out of its column.
 *  - Any scroll of the container (auto-scroll or wheel) recomputes solid-dnd's
 *    layout snapshot, which is taken in viewport coordinates at drag start, so
 *    drop targets stay aligned with what's on screen.
 * Rendered inside DragDropProvider so it can reach the drag-drop context.
 */
const DragBehavior: Component<{ list: () => HTMLElement | null }> = (props) => {
  const ctx = useDragDropContext();
  if (!ctx) return null;
  const [dnd, { addTransformer, removeTransformer, recomputeLayouts, onDragStart, onDragEnd }] = ctx;

  const lockX: Transformer = { id: "lock-x", order: 100, callback: (t) => ({ x: 0, y: t.y }) };

  const EDGE = 56; // px zone at each edge of the scroller that triggers auto-scroll
  const MAX_SPEED = 14; // px per frame at the very edge
  let scroller: HTMLElement | null = null;
  let lastScrollTop = 0;
  let frozen: { el: HTMLElement; overflow: string }[] = [];
  let raf = 0;

  const freezeAncestors = (el: HTMLElement) => {
    for (let n = el.parentElement; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const root = n === document.documentElement;
      if (root || /auto|scroll/.test(cs.overflowY + cs.overflowX)) {
        frozen.push({ el: n, overflow: n.style.overflow });
        n.style.overflow = root ? "clip" : "hidden";
      }
    }
  };
  const unfreeze = () => {
    for (const { el, overflow } of frozen) el.style.overflow = overflow;
    frozen = [];
  };

  const tick = () => {
    if (scroller) {
      const y = dnd.active.sensor?.coordinates.current.y;
      if (y != null) {
        const r = scroller.getBoundingClientRect();
        let dy = 0;
        if (y < r.top + EDGE) dy = -MAX_SPEED * Math.min(1, (r.top + EDGE - y) / EDGE);
        else if (y > r.bottom - EDGE) dy = MAX_SPEED * Math.min(1, (y - (r.bottom - EDGE)) / EDGE);
        if (dy !== 0) scroller.scrollTop += dy; // natively clamped to the list extent
      }
      if (scroller.scrollTop !== lastScrollTop) {
        lastScrollTop = scroller.scrollTop;
        recomputeLayouts();
      }
    }
    raf = requestAnimationFrame(tick);
  };

  onDragStart(({ draggable }) => {
    addTransformer("draggables", draggable.id, lockX);
    // The list's parent is its dedicated scroll container (App.tsx renders it
    // with overflow-y-auto at every breakpoint).
    scroller = props.list()?.parentElement ?? null;
    lastScrollTop = scroller?.scrollTop ?? 0;
    if (scroller) freezeAncestors(scroller);
    raf = requestAnimationFrame(tick);
  });
  onDragEnd(({ draggable }) => {
    removeTransformer("draggables", draggable.id, "lock-x");
    unfreeze();
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    scroller = null;
  });
  onCleanup(() => {
    if (raf) cancelAnimationFrame(raf);
    unfreeze();
  });
  return null;
};

export const PhotoList: Component = () => {
  const { t } = useI18n();
  const ids = createMemo(() => state.photos.map((p) => p.id));
  let listEl: HTMLDivElement | undefined;

  // id -> row element, so Arrow-key navigation can move DOM focus to follow the
  // selection it just changed (the roving tabindex updates reactively).
  const rowRefs = new Map<string, HTMLElement>();
  const registerRef = (id: string, el: HTMLElement | null) => {
    if (el) rowRefs.set(id, el);
    else rowRefs.delete(id);
  };
  const focusRow = (id: string | null) => {
    if (id) queueMicrotask(() => rowRefs.get(id)?.focus());
  };

  const onDragEnd = ({ draggable, droppable }: DragEvent) => {
    if (draggable && droppable && draggable.id !== droppable.id) {
      reorderPhotos(String(draggable.id), String(droppable.id));
    }
  };

  return (
    <DragDropProvider onDragEnd={onDragEnd} collisionDetector={closestCenter}>
      <DragDropSensors />
      <DragBehavior list={() => listEl ?? null} />
      <SortableProvider ids={ids()}>
        <div
          ref={listEl}
          class="flex flex-col gap-1.5"
          role="listbox"
          aria-label={t("photo.listLabel")}
        >
          <For each={state.photos}>
            {(photo, i) => (
              <PhotoRow
                photo={photo}
                index={i()}
                registerRef={registerRef}
                onNavigate={focusRow}
              />
            )}
          </For>
        </div>
      </SortableProvider>
      <DragOverlay>
        {(draggable) => {
          const photo = draggable ? state.photos.find((p) => p.id === draggable.id) : null;
          return photo ? <OverlayRow photo={photo} /> : null;
        }}
      </DragOverlay>
    </DragDropProvider>
  );
};
