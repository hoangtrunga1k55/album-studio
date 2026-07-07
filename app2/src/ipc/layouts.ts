import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

const FOLDER_KEY = "albumstudio.layoutFolder";

export function savedLayoutFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY);
  } catch {
    return null;
  }
}
export function saveLayoutFolder(path: string) {
  try {
    localStorage.setItem(FOLDER_KEY, path);
  } catch {
    /* ignore */
  }
}

/** Read a template's hi-res, text-free background from the layout pack.
 *  Returns a JPEG data URI, or null if the pack has none for `name`. */
export async function readLayoutBg(folder: string, name: string): Promise<string | null> {
  return invoke<string | null>("read_layout_bg", { folder, name });
}

/** Count the hi-res backgrounds in a layout-pack folder (for import status). */
export async function scanLayoutPack(folder: string): Promise<number> {
  return invoke<number>("scan_layout_pack", { folder });
}

/** Open a folder picker for the layout pack; returns the chosen path or null. */
export async function pickLayoutFolder(): Promise<string | null> {
  const p = await open({ multiple: false, directory: true });
  return typeof p === "string" ? p : null;
}