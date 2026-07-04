import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { Typo, TypoText } from "../engine/typos";

const FOLDER_KEY = "albumstudio.typoFolder";

export function savedTypoFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY);
  } catch {
    return null;
  }
}
export function saveTypoFolder(path: string) {
  try {
    localStorage.setItem(FOLDER_KEY, path);
  } catch {
    /* ignore */
  }
}

interface TypoRaw {
  id: string;
  ratioWH: number;
  texts: TypoText[];
  preview: string;
  deco: string | null;
}

/** Load a user-imported typo folder (typos.json + preview/deco PNGs). */
export async function loadTypoFolder(path: string): Promise<Typo[]> {
  const raw = await invoke<TypoRaw[]>("load_typo_folder", { path });
  return raw.map((r) => ({
    id: r.id,
    ratioWH: r.ratioWH,
    texts: r.texts ?? [],
    preview: r.preview,
    deco: r.deco ?? undefined,
  }));
}

/** Open a folder picker for the typo kho; returns the chosen path or null. */
export async function pickTypoFolder(): Promise<string | null> {
  const p = await open({ multiple: false, directory: true });
  return typeof p === "string" ? p : null;
}