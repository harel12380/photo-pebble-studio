import type { ImportedImage } from '../types';

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i;

function isImage(file: File): boolean {
  return file.type.startsWith('image/') || IMAGE_EXT_RE.test(file.name);
}

/** Convert a FileList / File[] (drop or file input) into importable images. */
export function filesToImported(files: FileList | File[]): ImportedImage[] {
  return Array.from(files)
    .filter(isImage)
    .map((file) => ({
      blob: file,
      name: file.name || 'image',
      sourceKind: 'file' as const,
      lastModified: file.lastModified,
    }));
}

/** Extract image files from a drag-and-drop DataTransfer. */
export function dataTransferToImported(dt: DataTransfer): ImportedImage[] {
  if (dt.files && dt.files.length > 0) return filesToImported(dt.files);
  return [];
}
