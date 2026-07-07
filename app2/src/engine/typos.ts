/** Typo library — pre-designed Vietnamese typography blocks (from PSD), rendered
 *  as editable vector text (+ optional decoration overlay).
 *
 *  Not bundled with the app: the user imports a typo folder (like the font kho),
 *  and the loaded typos live in `useTypos` (store/typos.ts). This module only
 *  holds the shared types + accessors that read from that store. */

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
  ratioWH: number;
  texts: TypoText[];
  preview: string; // library thumbnail (data URI)
  deco?: string; // non-text decoration overlay (data URI)
}

export function getTypo(id: string): Typo | undefined {
  return useTypos.getState().typos.find((t) => t.id === id);
}

/** All font names referenced by the currently loaded typo library. */
export function typoFontNames(): string[] {
  const s = new Set<string>();
  for (const t of useTypos.getState().typos)
    for (const tx of t.texts) if (tx.font) s.add(tx.font);
  return [...s];
}