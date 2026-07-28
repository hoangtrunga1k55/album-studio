import { create } from "zustand";
import type { Element } from "../engine/elements";

interface ElementState {
  /** Element library loaded from the user-imported folder (empty until loaded). */
  elements: Element[];
  setElements: (elements: Element[]) => void;
  /** Attach an element's image data URI once read from disk (lazy). */
  setSrc: (id: string, src: string) => void;
}

export const useElements = create<ElementState>((set) => ({
  elements: [],
  setElements: (elements) => set({ elements }),
  setSrc: (id, src) =>
    set((s) => ({ elements: s.elements.map((e) => (e.id === id ? { ...e, src } : e)) })),
}));

/** Categories present in a list of elements, in first-seen order. */
export function elementCategories(list: Element[]): string[] {
  const seen: string[] = [];
  for (const e of list) if (!seen.includes(e.category)) seen.push(e.category);
  return seen;
}
