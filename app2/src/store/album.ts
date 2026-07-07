import { create } from "zustand";
import type { ImageMeta } from "../ipc/import";
import {
  getTemplate,
  nearestSlotCount,
  nextTemplateAny,
  nextTemplateSameCount,
  randomTemplate,
  type AlbumSize,
} from "../engine/templates";
import { planAutoDesign, type Density } from "../engine/autoLayout";

/** Pan/zoom of an image inside its slot. zoom>=1; pan in [-1,1] (fraction of overflow). */
export interface SlotTransform {
  zoom: number;
  panX: number;
  panY: number;
  /** cover = fill slot (crop); contain = whole image visible (letterbox). */
  fit?: "cover" | "contain";
}

/** Per-template-text override (edit content/font/color/size/position or delete). */
export interface TextEdit {
  content?: string;
  font?: string;
  color?: string;
  sizeScale?: number;
  scaleX?: number; // free horizontal stretch (resize handles), default 1
  scaleY?: number; // free vertical stretch, default 1
  deleted?: boolean;
  dx?: number; // normalized position offset
  dy?: number;
}

/** A user-added text element (not from the template). */
export interface AddedText {
  id: string;
  content: string;
  font: string;
  color: string;
  sizeFrac: number; // font size as fraction of stage height
  scaleX?: number; // free horizontal stretch, default 1
  scaleY?: number; // free vertical stretch, default 1
  x: number; // normalized top-left
  y: number;
}

export type TextSel =
  | { kind: "tpl"; index: number }
  | { kind: "added"; id: string }
  | null;

/** A typo design placed on a spread. */
export interface PlacedTypo {
  id: string;
  typoId: string;
  x: number; // normalized top-left
  y: number;
  w: number; // normalized width (height derived from typo ratio)
  scaleX?: number; // free horizontal stretch (resize handles), default 1
  scaleY?: number; // free vertical stretch, default 1
  color: string | null; // null = original per-text colors; hex = flood recolor
}

/** One album spread: a chosen template + the images assigned to its slots (in order). */
export interface Spread {
  id: string;
  templateId: string;
  imageIds: string[];
  /** slotIndex -> pan/zoom of the image in that slot. */
  transforms: Record<number, SlotTransform>;
  /** templateTextIndex -> override. */
  textEdits: Record<number, TextEdit>;
  /** user-added texts. */
  addedTexts: AddedText[];
  /** typo designs placed on this spread. */
  typos: PlacedTypo[];
  /** gap between photos, fraction of spread height (§4.1 Margin slider). */
  margin: number;
}

let counter = 0;
const newId = (p: string) => `${p}_${++counter}`;

function freshSpread(size: AlbumSize, slotCount = 1): Spread {
  const t =
    randomTemplate(size, nearestSlotCount(size, slotCount)) ??
    randomTemplate(size, nearestSlotCount(size, 1));
  return {
    id: newId("sp"),
    templateId: t ? t.id : "",
    imageIds: [],
    transforms: {},
    textEdits: {},
    addedTexts: [],
    typos: [],
    margin: 0,
  };
}

/** Per-photo curation metadata (SmartAlbums-style rating/reject). Persisted
 *  in the project file, keyed by the stable image id (hash of path). */
export interface PhotoMeta {
  rating?: number; // 0–5 stars
  rejected?: boolean; // X — hidden from the grid, file untouched
}

interface AlbumState {
  size: AlbumSize | null;
  images: ImageMeta[];
  spreads: Spread[];
  currentIndex: number;
  selectedSlot: number | null;
  selectedText: TextSel;
  selectedTypo: string | null;
  bgColor: string;
  photoMeta: Record<string, PhotoMeta>;
  /** Photos highlighted in the Photos panel (rating keys apply to these). */
  selectedPhotos: string[];

  createAlbum: (size: AlbumSize) => void;
  resetAlbum: () => void;
  /** Load a saved project (images re-imported separately by path). */
  applyProject: (p: {
    size: AlbumSize;
    bgColor: string;
    density: Density;
    currentIndex: number;
    spreads: Spread[];
    photoMeta?: Record<string, PhotoMeta>;
  }) => void;

  addImages: (images: ImageMeta[]) => void;
  clearImages: () => void;

  setSelectedPhotos: (ids: string[]) => void;
  /** Set the star rating (0–5) on every selected/named photo. */
  ratePhotos: (ids: string[], rating: number) => void;
  /** Toggle reject (X) on the given photos. */
  toggleRejected: (ids: string[]) => void;

  /** Toggle an image on the CURRENT spread; re-picks a template matching the new count. */
  toggleImage: (imageId: string) => void;
  /** Add several photos to the CURRENT spread at once (multi-select drop). */
  addToSpread: (imageIds: string[]) => void;
  /** SPACE: shuffle to another template with the same slot count. */
  shuffleCurrent: () => void;
  /** Explicitly set the current spread's template (from the gallery). */
  setTemplate: (templateId: string) => void;
  /** Empty a slot (no shift) on the current spread. */
  clearSlot: (slotIndex: number) => void;
  /** Place an image into a specific slot (drag-drop / replace). */
  setSlotImage: (slotIndex: number, imageId: string) => void;
  /** Update pan/zoom of an image in a slot on the current spread. */
  setSlotTransform: (slotIndex: number, t: SlotTransform) => void;
  /** Fill (cover) or Fit (contain) the image in a slot. */
  setSlotFit: (slotIndex: number, fit: "cover" | "contain") => void;
  /** Set gap between photos for the current spread. */
  setMargin: (margin: number) => void;

  /** Swap: pick a source slot, then swap with the next slot clicked. */
  swapSource: number | null;
  beginSwap: (slotIndex: number) => void;
  cancelSwap: () => void;
  swapImages: (a: number, b: number) => void;
  /** Randomly rearrange the images among the filled slots (2 = swap, 3+ = shuffle). */
  shuffleImages: () => void;

  addSpread: () => void;
  removeSpread: (index: number) => void;
  setCurrent: (index: number) => void;

  /** Density for Auto Design (§4.3). */
  density: Density;
  setDensity: (d: Density) => void;
  /** Auto-distribute all images across spreads. */
  autoDesign: (o?: {
    source?: "all" | "selected" | "starred";
    order?: "date" | "name";
    fullBleedPct?: number;
  }) => void;

  selectSlot: (slot: number | null) => void;

  // ---- typography editing (current spread) ----
  selectText: (sel: TextSel) => void;
  editTplText: (index: number, patch: TextEdit) => void;
  deleteTplText: (index: number) => void;
  /** Drop all edits for a template text → restore the original baked look. */
  resetTplText: (index: number) => void;
  addText: (t: Omit<AddedText, "id">) => void;
  updateAddedText: (id: string, patch: Partial<AddedText>) => void;
  removeAddedText: (id: string) => void;

  // ---- typo designs (current spread) ----
  selectTypo: (id: string | null) => void;
  addTypo: (typoId: string, x: number, y: number) => void;
  updateTypo: (id: string, patch: Partial<PlacedTypo>) => void;
  removeTypo: (id: string) => void;

  setBgColor: (color: string) => void;
}

export const useAlbum = create<AlbumState>((set) => ({
  size: null,
  images: [],
  spreads: [],
  currentIndex: 0,
  selectedSlot: null,
  selectedText: null,
  selectedTypo: null,
  swapSource: null,
  bgColor: "#ffffff",
  photoMeta: {},
  selectedPhotos: [],

  createAlbum: (size) =>
    set({
      size,
      spreads: [freshSpread(size)],
      currentIndex: 0,
      selectedSlot: null,
      photoMeta: {},
      selectedPhotos: [],
    }),
  resetAlbum: () =>
    set({
      size: null,
      spreads: [],
      currentIndex: 0,
      images: [],
      selectedSlot: null,
      photoMeta: {},
      selectedPhotos: [],
    }),

  applyProject: (p) =>
    set({
      size: p.size,
      bgColor: p.bgColor,
      density: p.density,
      currentIndex: p.currentIndex,
      spreads: p.spreads.map((sp) => ({ ...sp, typos: sp.typos ?? [] })),
      images: [],
      selectedSlot: null,
      selectedText: null,
      selectedTypo: null,
      photoMeta: p.photoMeta ?? {},
      selectedPhotos: [],
    }),

  addImages: (imgs) => set((s) => ({ images: [...s.images, ...imgs] })),
  clearImages: () => set({ images: [] }),

  setSelectedPhotos: (selectedPhotos) => set({ selectedPhotos }),

  ratePhotos: (ids, rating) =>
    set((s) => {
      const photoMeta = { ...s.photoMeta };
      for (const id of ids) {
        photoMeta[id] = { ...photoMeta[id], rating: rating > 0 ? rating : undefined };
      }
      return { photoMeta };
    }),

  toggleRejected: (ids) =>
    set((s) => {
      const photoMeta = { ...s.photoMeta };
      const anyKept = ids.some((id) => !photoMeta[id]?.rejected);
      for (const id of ids) {
        photoMeta[id] = { ...photoMeta[id], rejected: anyKept };
      }
      return { photoMeta };
    }),

  toggleImage: (imageId) =>
    set((s) => {
      if (!s.size) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const has = cur.imageIds.includes(imageId);
      cur.imageIds = has
        ? cur.imageIds.filter((id) => id !== imageId)
        : [...cur.imageIds, imageId];

      const count = cur.imageIds.length;
      const tpl = getTemplate(cur.templateId);
      if (count > 0 && (!tpl || tpl.slotCount !== nearestSlotCount(s.size, count))) {
        const next = randomTemplate(s.size, nearestSlotCount(s.size, count));
        if (next) cur.templateId = next.id;
      }
      cur.transforms = {};
      cur.textEdits = {};
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: null, selectedText: null };
    }),

  addToSpread: (imageIds) =>
    set((s) => {
      if (!s.size || imageIds.length === 0) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const merged = [...cur.imageIds.filter(Boolean)];
      for (const id of imageIds) if (!merged.includes(id)) merged.push(id);
      if (merged.length === cur.imageIds.filter(Boolean).length) return s;

      // Re-pick a template that fits the new count (capped by the largest pool).
      const targetCount = nearestSlotCount(s.size, merged.length);
      const tpl = getTemplate(cur.templateId);
      if (targetCount > 0 && (!tpl || tpl.slotCount !== targetCount)) {
        const next = randomTemplate(s.size, targetCount);
        if (next) cur.templateId = next.id;
      }
      cur.imageIds = merged.slice(0, targetCount || merged.length);
      cur.transforms = {};
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: null, selectedText: null, selectedPhotos: [] };
    }),

  shuffleCurrent: () =>
    set((s) => {
      if (!s.size) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      // No image chosen yet → browse ALL layouts; once N images chosen → only N-slot.
      let next =
        cur.imageIds.length === 0
          ? nextTemplateAny(s.size, cur.templateId)
          : nextTemplateSameCount(cur.templateId);
      if (!next) {
        const count = nearestSlotCount(s.size, cur.imageIds.length || 1);
        next = randomTemplate(s.size, count);
      }
      if (next) {
        cur.templateId = next.id;
        cur.transforms = {};
        cur.textEdits = {};
        spreads[s.currentIndex] = cur;
      }
      return { spreads, selectedText: null };
    }),

  setTemplate: (templateId) =>
    set((s) => {
      const spreads = [...s.spreads];
      spreads[s.currentIndex] = { ...spreads[s.currentIndex], templateId };
      return { spreads };
    }),

  clearSlot: (slotIndex) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.imageIds = cur.imageIds.map((id, i) => (i === slotIndex ? "" : id));
      const tr = { ...cur.transforms };
      delete tr[slotIndex];
      cur.transforms = tr;
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  setSlotImage: (slotIndex, imageId) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const ids = [...cur.imageIds];
      while (ids.length <= slotIndex) ids.push("");
      ids[slotIndex] = imageId;
      cur.imageIds = ids;
      const tr = { ...cur.transforms };
      delete tr[slotIndex]; // reset pan/zoom for the new image
      cur.transforms = tr;
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: slotIndex, selectedText: null };
    }),

  setSlotTransform: (slotIndex, t) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.transforms = { ...cur.transforms, [slotIndex]: t };
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  setSlotFit: (slotIndex, fit) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const prev = cur.transforms[slotIndex] ?? { zoom: 1, panX: 0, panY: 0 };
      cur.transforms = { ...cur.transforms, [slotIndex]: { ...prev, zoom: 1, panX: 0, panY: 0, fit } };
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  setMargin: (margin) =>
    set((s) => {
      const spreads = [...s.spreads];
      spreads[s.currentIndex] = { ...spreads[s.currentIndex], margin };
      return { spreads };
    }),

  beginSwap: (slotIndex) => set({ swapSource: slotIndex }),
  cancelSwap: () => set({ swapSource: null }),
  swapImages: (a, b) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const ids = [...cur.imageIds];
      const max = Math.max(a, b);
      while (ids.length <= max) ids.push("");
      [ids[a], ids[b]] = [ids[b], ids[a]];
      cur.imageIds = ids;
      const tr = { ...cur.transforms };
      const ta = tr[a];
      const tb = tr[b];
      if (tb !== undefined) tr[a] = tb;
      else delete tr[a];
      if (ta !== undefined) tr[b] = ta;
      else delete tr[b];
      cur.transforms = tr;
      spreads[s.currentIndex] = cur;
      return { spreads, swapSource: null, selectedSlot: b };
    }),

  shuffleImages: () =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const ids = [...cur.imageIds];
      const filled = ids.map((id, i) => ({ id, i })).filter((x) => x.id);
      if (filled.length < 2) return s;
      const imgs = filled.map((f) => f.id);
      const perm = [...imgs];
      for (let i = perm.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [perm[i], perm[j]] = [perm[j], perm[i]];
      }
      if (imgs.every((v, k) => v === perm[k])) perm.push(perm.shift()!); // avoid no-op
      filled.forEach((f, k) => (ids[f.i] = perm[k]));
      cur.imageIds = ids;
      cur.transforms = {};
      spreads[s.currentIndex] = cur;
      return { spreads, swapSource: null, selectedSlot: null, selectedText: null, selectedTypo: null };
    }),

  addSpread: () =>
    set((s) => {
      if (!s.size) return s;
      const spreads = [...s.spreads, freshSpread(s.size)];
      return { spreads, currentIndex: spreads.length - 1, selectedSlot: null };
    }),

  removeSpread: (index) =>
    set((s) => {
      if (s.spreads.length <= 1) return s;
      const spreads = s.spreads.filter((_, i) => i !== index);
      const currentIndex = Math.min(s.currentIndex, spreads.length - 1);
      return { spreads, currentIndex, selectedSlot: null };
    }),

  setCurrent: (index) => set({ currentIndex: index, selectedSlot: null, swapSource: null }),

  density: "can",
  setDensity: (density) => set({ density }),
  autoDesign: (o) =>
    set((s) => {
      if (!s.size || s.images.length === 0) return s;
      // Rejected photos never enter the album; narrow by source if asked.
      let photos = s.images.filter((i) => !s.photoMeta[i.id]?.rejected);
      if (o?.source === "selected" && s.selectedPhotos.length > 0) {
        photos = photos.filter((i) => s.selectedPhotos.includes(i.id));
      } else if (o?.source === "starred") {
        photos = photos.filter((i) => (s.photoMeta[i.id]?.rating ?? 0) > 0);
      }
      if (photos.length === 0) return s;

      const ratings: Record<string, number> = {};
      for (const [id, m] of Object.entries(s.photoMeta)) {
        if (m.rating) ratings[id] = m.rating;
      }
      const plans = planAutoDesign(s.size, photos, {
        density: s.density,
        order: o?.order,
        fullBleedPct: o?.fullBleedPct,
        ratings,
      });
      if (plans.length === 0) return s;
      const spreads = plans.map((p) => ({
        id: newId("sp"),
        templateId: p.templateId,
        imageIds: p.imageIds,
        transforms: {},
        textEdits: {},
        addedTexts: [],
        typos: [],
        margin: 0,
      }));
      return { spreads, currentIndex: 0, selectedSlot: null, selectedText: null, selectedTypo: null };
    }),

  selectSlot: (selectedSlot) => set({ selectedSlot, selectedText: null, selectedTypo: null, swapSource: null }),

  selectText: (selectedText) => set({ selectedText, selectedSlot: null, selectedTypo: null, swapSource: null }),

  selectTypo: (selectedTypo) => set({ selectedTypo, selectedSlot: null, selectedText: null, swapSource: null }),

  addTypo: (typoId, x, y) =>
    set((s) => {
      const id = newId("ty");
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.typos = [...(cur.typos ?? []), { id, typoId, x, y, w: 0.32, color: null }];
      spreads[s.currentIndex] = cur;
      return { spreads, selectedTypo: id, selectedSlot: null, selectedText: null };
    }),

  updateTypo: (id, patch) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.typos = (cur.typos ?? []).map((t) => (t.id === id ? { ...t, ...patch } : t));
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  removeTypo: (id) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.typos = (cur.typos ?? []).filter((t) => t.id !== id);
      spreads[s.currentIndex] = cur;
      return { spreads, selectedTypo: null };
    }),

  editTplText: (index, patch) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.textEdits = { ...cur.textEdits, [index]: { ...cur.textEdits[index], ...patch } };
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  deleteTplText: (index) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.textEdits = { ...cur.textEdits, [index]: { ...cur.textEdits[index], deleted: true } };
      spreads[s.currentIndex] = cur;
      return { spreads, selectedText: null };
    }),

  resetTplText: (index) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const next = { ...cur.textEdits };
      delete next[index];
      cur.textEdits = next;
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  addText: (t) =>
    set((s) => {
      const id = newId("tx");
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.addedTexts = [...cur.addedTexts, { ...t, id }];
      spreads[s.currentIndex] = cur;
      return { spreads, selectedText: { kind: "added", id }, selectedSlot: null };
    }),

  updateAddedText: (id, patch) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.addedTexts = cur.addedTexts.map((a) => (a.id === id ? { ...a, ...patch } : a));
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  removeAddedText: (id) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.addedTexts = cur.addedTexts.filter((a) => a.id !== id);
      spreads[s.currentIndex] = cur;
      return { spreads, selectedText: null };
    }),

  setBgColor: (bgColor) => set({ bgColor }),
}));

/** Convenience selector: the spread currently being edited. */
export function currentSpread(s: AlbumState): Spread | undefined {
  return s.spreads[s.currentIndex];
}
