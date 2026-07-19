import type { ImportedImage } from '../types';

function extFromType(type: string): string {
  const sub = type.split('/')[1] || 'png';
  return sub.replace('jpeg', 'jpg');
}

/** Pull images from a paste (Ctrl/Cmd+V) ClipboardEvent. */
export function pasteEventToImported(e: ClipboardEvent): ImportedImage[] {
  const out: ImportedImage[] = [];
  const items = e.clipboardData?.items;
  if (!items) return out;
  for (const item of items) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        out.push({
          blob: file,
          name: file.name || `pasted-${Date.now()}.${extFromType(item.type)}`,
          sourceKind: 'clipboard',
        });
      }
    }
  }
  return out;
}

/** Read images via the async Clipboard API (for an explicit "Paste" button). */
export async function readClipboardImages(): Promise<ImportedImage[]> {
  if (!navigator.clipboard || !('read' in navigator.clipboard)) {
    throw new Error('Clipboard reading is not supported in this browser.');
  }
  const items = await navigator.clipboard.read();
  const out: ImportedImage[] = [];
  for (const item of items) {
    const type = item.types.find((t) => t.startsWith('image/'));
    if (!type) continue;
    const blob = await item.getType(type);
    out.push({
      blob,
      name: `pasted-${Date.now()}.${extFromType(type)}`,
      sourceKind: 'clipboard',
    });
  }
  if (out.length === 0) {
    throw new Error('No image found on the clipboard.');
  }
  return out;
}
