import { TEMPLATES } from "./templates";
import { typoFontNames } from "./typos";
import { loadFontFiles, scanFontFolder, type LoadedFont, type ScannedFont } from "../ipc/fonts";

const FOLDER_KEY = "albumstudio.fontFolder";

export function savedFontFolder(): string | null {
  try {
    return localStorage.getItem(FOLDER_KEY);
  } catch {
    return null;
  }
}
export function saveFontFolder(path: string) {
  try {
    localStorage.setItem(FOLDER_KEY, path);
  } catch {
    /* ignore */
  }
}

const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, "");

/** Font names referenced by templates + the typo library (PostScript names). */
function neededFontNames(): Set<string> {
  const names = new Set<string>();
  for (const t of TEMPLATES) for (const tx of t.texts) if (tx.font) names.add(tx.font);
  for (const n of typoFontNames()) names.add(n);
  return names;
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
 * Scan the font folder, then load the fonts templates + typos need — matching
 * by exact name and a normalized form (ignoring spaces/hyphens/case) — and
 * register each under its family, PostScript name, AND the requested name so
 * canvas text renders correctly regardless of naming differences.
 */
export async function loadTemplateFontsFromFolder(folder: string): Promise<FolderResult> {
  const entries = await scanFontFolder(folder);

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
