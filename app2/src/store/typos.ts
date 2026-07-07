import { create } from "zustand";
import type { Typo } from "../engine/typos";

interface TypoState {
  /** Typo library loaded from the user-imported typo folder (empty until imported). */
  typos: Typo[];
  setTypos: (typos: Typo[]) => void;
}

export const useTypos = create<TypoState>((set) => ({
  typos: [],
  setTypos: (typos) => set({ typos }),
}));