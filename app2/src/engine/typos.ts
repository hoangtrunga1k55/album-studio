/** Typo library — pre-designed Vietnamese typography blocks (from PSD), rendered
 *  as editable vector text (+ optional decoration overlay).
 *
 *  The user imports a typo PACK folder whose sub-folders are the categories
 *  (vn / korea / fashion…). Only metadata + preview paths are indexed; the
 *  decoration PNG is read the first time a typo is actually placed. */

import { fileUrl, readTypoDeco, type TypoItem } from "../ipc/library";
import { useTypos } from "../store/typos";

export interface TypoText {
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  font?: string;
  color?: string;
}

export interface Typo {
  id: string;
  /** sub-folder of the pack: vn, korea, fashion… */
  category?: string;
  ratioWH: number;
  texts: TypoText[];
  /** library thumbnail — asset URL (lazy) or data URI (legacy folder). */
  preview: string;
  /** decoration overlay — data URI once loaded (see ensureTypoDeco). */
  deco?: string;
  /** where the decoration lives on disk, until it is loaded. */
  decoPath?: string;
}

/** Library item (metadata only) → the Typo shape the canvas understands. */
export function typoFromItem(i: TypoItem): Typo {
  return {
    id: i.id,
    category: i.category,
    ratioWH: i.ratioWH,
    texts: (i.texts as TypoText[]) ?? [],
    preview: fileUrl(i.previewPath),
    decoPath: i.decoPath ?? undefined,
  };
}

export function getTypo(id: string): Typo | undefined {
  return useTypos.getState().typos.find((t) => t.id === id);
}

/** Load the decoration PNG the first time this typo is placed on a spread. */
export async function ensureTypoDeco(id: string): Promise<void> {
  const t = getTypo(id);
  if (!t || t.deco || !t.decoPath) return;
  const deco = await readTypoDeco(t.decoPath).catch(() => null);
  if (deco) useTypos.getState().setDeco(id, deco);
}

/** All font names referenced by the currently loaded typo library. */
export function typoFontNames(): string[] {
  const s = new Set<string>();
  for (const t of useTypos.getState().typos)
    for (const tx of t.texts) if (tx.font) s.add(tx.font);
  return [...s];
}