import { invoke, convertFileSrc, Channel } from "@tauri-apps/api/core";
import { appLocalDataDir, join } from "@tauri-apps/api/path";
import { open } from "@tauri-apps/plugin-dialog";

/** One layout in the imported library — thumbnail first, JSON on demand. */
export interface LayoutItem {
  id: string;
  /** sub-folder name: cover-25x35, layout-30x30… */
  category: string;
  name: string;
  jsonPath: string;
  thumbPath: string | null;
  bgPath: string | null;
  /** number of photo slots — the picker filters by the spread's photo count */
  slotCount: number;
}

/** One typo in the imported library — preview first, deco on demand. */
export interface TypoItem {
  id: string;
  /** sub-folder name: vn, korea, fashion… */
  category: string;
  rawId: string;
  ratioWH: number;
  texts: unknown[];
  previewPath: string;
  decoPath: string | null;
}

/** File path → URL the webview can render (asset protocol, lazy, no base64). */
export const fileUrl = (path: string): string => convertFileSrc(path);

export function scanLayoutLibrary(root: string): Promise<LayoutItem[]> {
  return invoke<LayoutItem[]>("scan_layout_library", { root });
}

export function readLayoutJson(path: string): Promise<string> {
  return invoke<string>("read_layout_json", { path });
}

export function readLayoutBgPath(path: string): Promise<string | null> {
  return invoke<string | null>("read_layout_bg_path", { path });
}

export function scanTypoLibrary(root: string): Promise<TypoItem[]> {
  return invoke<TypoItem[]>("scan_typo_library", { root });
}

export function readTypoDeco(path: string): Promise<string | null> {
  return invoke<string | null>("read_typo_deco", { path });
}

export async function pickFolder(): Promise<string | null> {
  const p = await open({ multiple: false, directory: true });
  return typeof p === "string" ? p : null;
}

/* ---- remembered library folders ---- */
const LAYOUT_KEY = "albumstudio2.layoutLibrary";
const TYPO_KEY = "albumstudio2.typoLibrary";

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

export const savedLayoutLibrary = () => read(LAYOUT_KEY);
export const saveLayoutLibrary = (p: string) => write(LAYOUT_KEY, p);
export const savedTypoLibrary = () => read(TYPO_KEY);
export const saveTypoLibrary = (p: string) => write(TYPO_KEY, p);
/* ---- pack sync from a GitHub Release ---- */

export type SyncEvent =
  | { kind: "started"; total: number; version: string }
  | { kind: "file"; done: number; total: number; name: string }
  | {
      kind: "done";
      downloaded: number;
      removed: number;
      kept: number;
      version: string;
      packKind: string;
    };

/** Download only what changed from `releaseUrl` into the local pack folder. */
export async function syncPack(
  releaseUrl: string,
  dest: string,
  onEvent: (e: SyncEvent) => void
): Promise<string> {
  const channel = new Channel<SyncEvent>();
  channel.onmessage = onEvent;
  return invoke<string>("sync_pack", { releaseUrl, dest, onEvent: channel });
}

/** Version of the pack already synced into `dest` ("" = never synced). */
export function localPackVersion(dest: string): Promise<string> {
  return invoke<string>("local_pack_version", { dest });
}

/* ---- remembered release URLs ---- */
const LAYOUT_URL_KEY = "albumstudio2.layoutReleaseUrl";
const TYPO_URL_KEY = "albumstudio2.typoReleaseUrl";

export const savedLayoutUrl = () => read(LAYOUT_URL_KEY);
export const saveLayoutUrl = (v: string) => write(LAYOUT_URL_KEY, v);
export const savedTypoUrl = () => read(TYPO_URL_KEY);
export const saveTypoUrl = (v: string) => write(TYPO_URL_KEY, v);

/** Where synced packs live on disk: <appLocalData>/packs/<kind>. */
export async function packDir(kind: "layout" | "typo"): Promise<string> {
  const base = await appLocalDataDir();
  return join(base, "packs", kind);
}
