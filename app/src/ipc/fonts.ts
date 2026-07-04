import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";

export interface LoadedFont {
  family: string;
  /** PostScript name — how PSD/template text references the font. */
  postscript?: string;
  dataUri: string;
  hasVietnamese: boolean;
  file: string;
}

/** All names a loaded font can be matched by (family + postscript). */
export function fontAliases(f: LoadedFont): string[] {
  return [f.family, f.postscript].filter(
    (v, i, a): v is string => !!v && a.indexOf(v) === i
  );
}

/** Read user-selected font files → family name + data URI + VN coverage. */
export async function loadFontFiles(paths: string[]): Promise<LoadedFont[]> {
  return invoke<LoadedFont[]>("load_fonts", { paths });
}

export interface ScannedFont {
  family: string;
  postscript: string;
  path: string;
  hasVietnamese: boolean;
}

/** Index a font folder (Layer 3): family/postscript names + path, cached. */
export async function scanFontFolder(path: string): Promise<ScannedFont[]> {
  return invoke<ScannedFont[]>("scan_font_folder", { path });
}

/** Register a font under every alias (family + postscript) so text referencing
 *  either name renders correctly. */
export async function registerLoaded(f: LoadedFont): Promise<void> {
  for (const name of fontAliases(f)) {
    try {
      const face = new FontFace(name, `url("${f.dataUri}")`);
      await face.load();
      (document.fonts as FontFaceSet).add(face);
    } catch {
      /* skip */
    }
  }
}

/** Open a font picker, load + register the chosen fonts, return them. */
export async function pickAndLoadFonts(): Promise<LoadedFont[]> {
  const paths = await open({
    multiple: true,
    directory: false,
    filters: [{ name: "Font", extensions: ["ttf", "otf", "woff", "woff2"] }],
  });
  if (!paths) return [];
  const list = Array.isArray(paths) ? paths : [paths];
  const loaded = await loadFontFiles(list);
  await Promise.all(loaded.map((f) => registerLoaded(f)));
  return loaded;
}
