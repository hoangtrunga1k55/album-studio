import { Channel, invoke } from "@tauri-apps/api/core";

/** One imported image, mirrors the Rust `ImageMeta` (camelCase). */
export interface ImageMeta {
  id: string;
  path: string;
  name: string;
  width: number;
  height: number;
  ratio: number;
  /** "YYYY-MM-DD HH:MM:SS" — sortable. EXIF capture time, else file mtime. */
  capturedAt: string;
  /** Base64 data URI (image/jpeg) thumbnail. */
  thumb: string;
}

/** Streamed events from `import_folder`, mirrors the Rust `ImportEvent`. */
export type ImportEvent =
  | { kind: "started"; total: number }
  | ({ kind: "image" } & ImageMeta)
  | { kind: "failed"; path: string; error: string }
  | { kind: "done"; ok: number; failed: number };

/**
 * Scan a folder and stream back each image as its thumbnail is ready.
 * Resolves once the backend has finished (after the `done` event).
 */
export async function importFolder(
  path: string,
  onEvent: (event: ImportEvent) => void
): Promise<void> {
  const channel = new Channel<ImportEvent>();
  channel.onmessage = onEvent;
  await invoke("import_folder", { path, onEvent: channel });
}

/** Import a user-selected list of image files (multi-select picker). */
export async function importFiles(
  paths: string[],
  onEvent: (event: ImportEvent) => void
): Promise<void> {
  const channel = new Channel<ImportEvent>();
  channel.onmessage = onEvent;
  await invoke("import_files", { paths, onEvent: channel });
}

const displayCache = new Map<string, Promise<string>>();

/** Decode an image at display resolution (~1600px) for sharp canvas rendering.
 *  Cached per path so re-renders / re-mounts never re-decode. */
export function getDisplayImage(path: string): Promise<string> {
  let p = displayCache.get(path);
  if (!p) {
    p = invoke<string>("get_display_image", { path });
    displayCache.set(path, p);
  }
  return p;
}