/**
 * Pure selection-movement math for the photo list, isolated from the store so it
 * is unit-testable without the IndexedDB/worker machinery the store pulls in.
 */

/**
 * Pick the id `delta` steps from `current` within `ids`, clamped to the ends (no
 * wrap-around). With no current selection, a forward step (delta ≥ 0) lands on
 * the first item and a backward step on the last — matching how a roving-focus
 * listbox responds to its very first Arrow key. Returns null only for an empty
 * list.
 */
export function adjacentId(
  ids: readonly string[],
  current: string | null,
  delta: number,
): string | null {
  if (ids.length === 0) return null;
  const cur = current == null ? -1 : ids.indexOf(current);
  if (cur < 0) return delta >= 0 ? ids[0] : ids[ids.length - 1];
  const next = Math.min(ids.length - 1, Math.max(0, cur + delta));
  return ids[next];
}
