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
  /** near-grayscale photo (Auto Design "Black & White" grouping). */
  isBw: boolean;
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

/** Read a dropped File as base64 (no data-uri prefix). */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      const comma = s.indexOf(",");
      resolve(comma >= 0 ? s.slice(comma + 1) : s);
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

/** Stage OS-dropped image Files into app data, then import them like picked
 *  files (stable paths → survive project reload). Non-image files are ignored. */
export async function importDroppedFiles(
  files: File[],
  onEvent: (event: ImportEvent) => void
): Promise<void> {
  const images = files.filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return;
  const payload = await Promise.all(
    images.map(async (f) => ({ name: f.name, data: await fileToBase64(f) }))
  );
  const paths = await invoke<string[]>("stage_dropped", { files: payload });
  if (paths.length) await importFiles(paths, onEvent);
}

const displayCache = new Map<string, Promise<string>>();
/** Resolved data URLs — lets a mounting component pick the image up
 *  SYNCHRONOUSLY (no async frame) when it was already decoded. */
const displayReady = new Map<string, string>();

/** Decode an image at display resolution (~1600px) for sharp canvas rendering.
 *  Cached per path so re-renders / re-mounts never re-decode. */
export function getDisplayImage(path: string): Promise<string> {
  let p = displayCache.get(path);
  if (!p) {
    p = invoke<string>("get_display_image", { path }).then((u) => {
      displayReady.set(path, u);
      return u;
    });
    displayCache.set(path, p);
  }
  return p;
}

/** Already-decoded display image, if any — for instant mounts. */
export function getDisplayImageSync(path: string): string | undefined {
  return displayReady.get(path);
}

/** Drop the cached decode for a path so the next getDisplayImage re-reads the
 *  file from disk (used after an external Photoshop edit changes the bytes). */
export function invalidateDisplayImage(path: string): void {
  displayCache.delete(path);
  displayReady.delete(path);
}

/** Re-read an image from disk and rebuild its metadata (thumbnail, size, B&W). */
export function reloadImage(path: string): Promise<ImageMeta> {
  return invoke<ImageMeta>("reload_image", { path });
}

/** File modification time (epoch ms) — polled to detect an external save. */
export function fileMtimeMs(path: string): Promise<number> {
  return invoke<number>("file_mtime_ms", { path });
}

/** Open an image in an external editor (Photoshop, else the default app). */
export function openInEditor(path: string): Promise<void> {
  return invoke<void>("open_in_editor", { path });
}

/** Warm the cache for a set of photos (e.g. the neighbouring spreads) so
 *  switching spreads shows sharp images immediately. Fire-and-forget. */
export function prefetchDisplayImages(paths: string[]): void {
  for (const p of paths) void getDisplayImage(p).catch(() => {});
}