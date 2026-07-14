import {
  packDir,
  pickFolder,
  saveLayoutLibrary,
  savedLayoutLibrary,
  saveLayoutUrl,
  saveTypoLibrary,
  savedTypoLibrary,
  saveTypoUrl,
  scanLayoutLibrary,
  scanTypoLibrary,
  syncPack,
} from "../ipc/library";
import { typoFromItem } from "../engine/typos";
import { loadSystemFonts } from "../engine/fontLibrary";
import { useLibrary } from "../store/library";
import { useTypos } from "../store/typos";
import { useFonts } from "../store/fonts";

/** Index the typo pack (categories = sub-folders) — previews stay on disk. */
export async function loadTypoLibrary(root: string): Promise<number> {
  const items = await scanTypoLibrary(root);
  useLibrary.getState().setTypos(items);
  useTypos.getState().setTypos(items.map(typoFromItem));
  // typo fonts now count as "needed" — re-scan the machine to load them
  const r = await loadSystemFonts();
  useFonts.getState().addFonts(r.loaded);
  useFonts.getState().setIndex(r.entries);
  return items.length;
}

/** Pick the typo pack folder and index it. False when the user cancels. */
export async function importTypoLibrary(): Promise<boolean> {
  const path = await pickFolder();
  if (!path) return false;
  await loadTypoLibrary(path);
  saveTypoLibrary(path);
  return true;
}

/** Index the layout pack (categories = sub-folders: cover-25x35, layout-30x30…). */
export async function loadLayoutLibrary(root: string): Promise<number> {
  const items = await scanLayoutLibrary(root);
  useLibrary.getState().setLayouts(items);
  return items.length;
}

/** Pick the layout pack folder and index it. False when the user cancels. */
export async function importLayoutLibrary(): Promise<boolean> {
  const path = await pickFolder();
  if (!path) return false;
  await loadLayoutLibrary(path);
  saveLayoutLibrary(path);
  return true;
}

/** Re-index both packs at startup (silently ignores missing folders). */
export async function restoreLibraries(): Promise<void> {
  const layout = savedLayoutLibrary();
  if (layout) await loadLayoutLibrary(layout).catch(() => 0);
  const typo = savedTypoLibrary();
  if (typo) await loadTypoLibrary(typo).catch(() => 0);
}
/* ---- online packs (GitHub Release) ---- */

/** Sync a pack from its release URL into the app's local pack folder, then
 *  index it. Returns a short summary for the UI. */
export async function syncPackFromRelease(
  kind: "layout" | "typo",
  url: string,
  onProgress?: (done: number, total: number) => void
): Promise<{ downloaded: number; removed: number; kept: number; version: string }> {
  const dest = await packDir(kind);
  let summary = { downloaded: 0, removed: 0, kept: 0, version: "" };
  await syncPack(url, dest, (e) => {
    if (e.kind === "file") onProgress?.(e.done, e.total);
    else if (e.kind === "done")
      summary = {
        downloaded: e.downloaded,
        removed: e.removed,
        kept: e.kept,
        version: e.version,
      };
  });

  if (kind === "layout") {
    await loadLayoutLibrary(dest);
    saveLayoutLibrary(dest);
    saveLayoutUrl(url);
  } else {
    await loadTypoLibrary(dest);
    saveTypoLibrary(dest);
    saveTypoUrl(url);
  }
  return summary;
}
