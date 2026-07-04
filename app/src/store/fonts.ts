import { create } from "zustand";
import type { LoadedFont, ScannedFont } from "../ipc/fonts";

interface FontState {
  /** Fonts actually loaded (registered) — bundled + template + on-demand. */
  fonts: LoadedFont[];
  addFonts: (fonts: LoadedFont[]) => void;
  /** Full library index (metadata only) from the scanned font folder. */
  index: ScannedFont[];
  setIndex: (index: ScannedFont[]) => void;
}

export const useFonts = create<FontState>((set) => ({
  fonts: [],
  addFonts: (incoming) =>
    set((s) => {
      const byFamily = new Map(s.fonts.map((f) => [f.family, f]));
      for (const f of incoming) byFamily.set(f.family, f);
      return { fonts: [...byFamily.values()].sort((a, b) => a.family.localeCompare(b.family)) };
    }),
  index: [],
  setIndex: (index) => set({ index }),
}));
