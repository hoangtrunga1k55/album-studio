import { create } from "zustand";
import type { LayoutItem, TypoItem } from "../ipc/library";

/** Imported libraries (layout packs + typo packs), indexed as metadata only:
 *  thumbnails render straight from disk, heavy files load when picked. */
interface LibraryState {
  layouts: LayoutItem[];
  setLayouts: (items: LayoutItem[]) => void;
  typos: TypoItem[];
  setTypos: (items: TypoItem[]) => void;
}

export const useLibrary = create<LibraryState>((set) => ({
  layouts: [],
  setLayouts: (layouts) => set({ layouts }),
  typos: [],
  setTypos: (typos) => set({ typos }),
}));

/** Distinct categories of a list, in a stable order. */
export function categoriesOf(items: { category: string }[]): string[] {
  return [...new Set(items.map((i) => i.category))].sort((a, b) => a.localeCompare(b));
}