import { create } from "zustand";
import type { Typo } from "../engine/typos";

interface TypoState {
  /** Typo library loaded from the user-imported typo pack (empty until imported). */
  typos: Typo[];
  setTypos: (typos: Typo[]) => void;
  /** Attach a decoration PNG once it has been read from disk (lazy). */
  setDeco: (id: string, deco: string) => void;
}

export const useTypos = create<TypoState>((set) => ({
  typos: [],
  setTypos: (typos) => set({ typos }),
  setDeco: (id, deco) =>
    set((s) => ({ typos: s.typos.map((t) => (t.id === id ? { ...t, deco } : t)) })),
}));