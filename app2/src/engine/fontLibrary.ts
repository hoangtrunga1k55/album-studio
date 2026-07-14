import { homeDir, join, localDataDir } from "@tauri-apps/api/path";
import { loadedLibraryTemplates } from "./templates";
import { typoFontNames } from "./typos";
import { loadFontFiles, scanFontFolder, type LoadedFont, type ScannedFont } from "../ipc/fonts";

/** OS font directories — the app indexes these automatically, so a font pack
 *  INSTALLED on the machine (mac/Windows/Linux) works with zero setup. */
export async function systemFontDirs(): Promise<string[]> {
  const plat = navigator.platform.toLowerCase();
  if (plat.includes("mac")) {
    const home = await homeDir();
    return [await join(home, "Library", "Fonts"), "/Library/Fonts", "/System/Library/Fonts"];
  }
  if (plat.startsWith("win")) {
    const local = await localDataDir(); // C:\Users\<user>\AppData\Local
    return ["C:\\Windows\\Fonts", await join(local, "Microsoft", "Windows", "Fonts")];
  }
  const home = await homeDir(); // linux
  return [await join(home, ".local", "share", "fonts"), "/usr/share/fonts"];
}

const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, "");

/** Font names referenced by templates + the typo library (PostScript names). */
export function neededFontNames(): Set<string> {
  const names = new Set<string>();
  for (const t of loadedLibraryTemplates())
    for (const tx of t.texts) if (tx.font) names.add(tx.font);
  for (const n of typoFontNames()) names.add(n);
  return names;
}

/** Template/typo fonts that are NOT installed on the machine — the user must
 *  add these to their OS font folder for the designs to render correctly. */
export function missingFontNames(entries: ScannedFont[]): string[] {
  const have = new Set<string>();
  for (const e of entries) {
    if (e.family) have.add(normalize(e.family));
    if (e.postscript) have.add(normalize(e.postscript));
  }
  const missing = new Set<string>();
  for (const n of neededFontNames()) {
    if (n && !have.has(normalize(n))) missing.add(n);
  }
  return [...missing].sort((a, b) => a.localeCompare(b));
}

async function registerAliases(dataUri: string, names: Iterable<string>) {
  for (const n of names) {
    if (!n) continue;
    try {
      const face = new FontFace(n, `url("${dataUri}")`);
      await face.load();
      (document.fonts as FontFaceSet).add(face);
    } catch {
      /* skip */
    }
  }
}

export interface FolderResult {
  total: number;
  loaded: LoadedFont[];
  entries: ScannedFont[];
}

/**
 * Index the OS font folders and load whatever the templates/typos need —
 * matching by exact name and a normalized form (ignoring spaces/hyphens/case),
 * registering each under family, PostScript name AND the requested name so
 * canvas text renders correctly regardless of naming differences.
 */
export async function loadSystemFonts(): Promise<FolderResult> {
  const dirs = await systemFontDirs();
  const all: ScannedFont[] = [];
  for (const d of dirs) {
    try {
      all.push(...(await scanFontFolder(d)));
    } catch {
      /* directory absent on this machine — skip */
    }
  }
  const seen = new Set<string>();
  const entries = all.filter((e) => {
    if (seen.has(e.path)) return false;
    seen.add(e.path);
    return true;
  });
  return loadNeededFromEntries(entries);
}

/** Load the fonts templates + typos need from an already-scanned index. */
async function loadNeededFromEntries(entries: ScannedFont[]): Promise<FolderResult> {
  const byExact = new Map<string, string>();
  const byNorm = new Map<string, string>();
  for (const e of entries) {
    for (const n of [e.postscript, e.family]) {
      if (n && !byExact.has(n)) byExact.set(n, e.path);
      const nn = n && normalize(n);
      if (nn && !byNorm.has(nn)) byNorm.set(nn, e.path);
    }
  }

  // requested-name(s) grouped by the font file that satisfies them
  const requestedByPath = new Map<string, Set<string>>();
  for (const name of neededFontNames()) {
    const path = byExact.get(name) ?? byNorm.get(normalize(name));
    if (!path) continue;
    if (!requestedByPath.has(path)) requestedByPath.set(path, new Set());
    requestedByPath.get(path)!.add(name);
  }

  const paths = [...requestedByPath.keys()];
  if (paths.length === 0) return { total: entries.length, loaded: [], entries };

  const loaded = await loadFontFiles(paths); // returned in the same order as paths
  const out: LoadedFont[] = [];
  for (let i = 0; i < paths.length; i++) {
    const f = loaded[i];
    if (!f) continue;
    const names = new Set<string>([f.family, f.postscript ?? "", ...requestedByPath.get(paths[i])!]);
    await registerAliases(f.dataUri, names);
    out.push(f);
  }
  return { total: entries.length, loaded: out, entries };
}

/** Load + register specific fonts from the already-scanned machine index.
 *  Called when a pack layout/typo is used for the first time — its fonts only
 *  become "needed" at that moment, long after the startup scan. */
export async function ensureFonts(names: string[], entries: ScannedFont[]): Promise<LoadedFont[]> {
  if (names.length === 0 || entries.length === 0) return [];
  const byExact = new Map<string, string>();
  const byNorm = new Map<string, string>();
  for (const e of entries) {
    for (const n of [e.postscript, e.family]) {
      if (n && !byExact.has(n)) byExact.set(n, e.path);
      const nn = n && normalize(n);
      if (nn && !byNorm.has(nn)) byNorm.set(nn, e.path);
    }
  }
  const requestedByPath = new Map<string, Set<string>>();
  for (const name of names) {
    if (!name) continue;
    const path = byExact.get(name) ?? byNorm.get(normalize(name));
    if (!path) continue;
    if (!requestedByPath.has(path)) requestedByPath.set(path, new Set());
    requestedByPath.get(path)!.add(name);
  }
  const paths = [...requestedByPath.keys()];
  if (paths.length === 0) return [];
  const loaded = await loadFontFiles(paths);
  const out: LoadedFont[] = [];
  for (let i = 0; i < paths.length; i++) {
    const f = loaded[i];
    if (!f) continue;
    await registerAliases(f.dataUri, new Set([f.family, f.postscript ?? "", ...requestedByPath.get(paths[i])!]));
    out.push(f);
  }
  return out;
}
