import { invoke } from "@tauri-apps/api/core";

const cache = new Map<string, Promise<string>>();

/** Higher-resolution image (data URI) for print export, cached per path. */
export function getExportImage(path: string): Promise<string> {
  let p = cache.get(path);
  if (!p) {
    p = invoke<string>("get_export_image", { path });
    cache.set(path, p);
  }
  return p;
}

export interface ExportFile {
  name: string;
  b64: string; // raw base64, no data: prefix
}

/** Write rendered files to `dir` (created if needed). Returns the dir. */
export function writeExport(dir: string, files: ExportFile[]): Promise<string> {
  return invoke<string>("write_export", { dir, files });
}
