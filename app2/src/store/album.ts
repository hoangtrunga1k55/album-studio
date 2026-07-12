import { create } from "zustand";
import type { ImageMeta } from "../ipc/import";
import {
  getTemplate,
  nearestSlotCount,
  nextTemplateAny,
  nextTemplateSameCount,
  parseSizeCm,
  randomTemplate,
  setPreferredSource,
  type AlbumSize,
  type LayoutSourceFilter,
} from "../engine/templates";
import { planAutoDesign, type Density } from "../engine/autoLayout";

/** Pan/zoom of an image inside its slot. zoom>=1; pan in [-1,1] (fraction of overflow). */
export interface SlotTransform {
  zoom: number;
  panX: number;
  panY: number;
  /** cover = fill slot (crop); contain = whole image visible (letterbox). */
  fit?: "cover" | "contain";
  /** rotate the photo inside the slot (file untouched). */
  rot?: 0 | 90 | 180 | 270;
  flipH?: boolean;
  flipV?: boolean;
  /** tone (SmartAlbums Tone Adjustments): brightness -1..1, 0 = off. */
  brightness?: number;
  /** contrast -100..100, 0 = off. */
  contrast?: number;
}

/** User-adjusted slot frame (normalized), overriding the template's rect. */
export interface SlotRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** free rotation of the whole frame, degrees. */
  rotDeg?: number;
}

/** Per-template-text override (edit content/font/color/size/position or delete). */
export interface TextEdit {
  content?: string;
  font?: string;
  color?: string;
  sizeScale?: number;
  scaleX?: number; // free horizontal stretch (resize handles), default 1
  scaleY?: number; // free vertical stretch, default 1
  rotDeg?: number; // free rotation, degrees
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
  rotDeg?: number; // free rotation, degrees
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
  rotDeg?: number; // free rotation, degrees
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
  /** photo → edge padding, fraction of spread height (§6.6). */
  padding?: number;
  /** full-bleed background photo covering the whole spread (§6.5). */
  bgImageId?: string | null;
  /** slotIndex → user-moved/resized frame (normalized), overrides the template. */
  slotRects?: Record<number, SlotRect>;
  /** Unified paint order (Arrange): photo slots (`s<i>`), template texts
   *  (`t<i>`), added texts (`a<id>`) and typos (`y<id>`) all in ONE list —
   *  first = bottom, last = top, so text/typo can sit UNDER photos too.
   *  Missing/partial → natural order (slots, tpl texts, added, typos). */
  zOrder?: string[];
  /** Album cover — pinned at position 0, edited like any spread. */
  isCover?: boolean;
  /** Cover size: 1 = front only (1 page), 2 = full wrap (2-page spread). */
  pages?: 1 | 2;
}

/** Display name of a spread ("Bìa" / "Spread N") — cover-aware numbering. */
export function spreadLabel(spreads: Spread[], i: number): string {
  const hasCover = !!spreads[0]?.isCover;
  if (hasCover) return i === 0 ? "Bìa" : `Spread ${i}`;
  return `Spread ${i + 1}`;
}

/** Effective page count of a spread (cover can be 1-page; others follow
 *  the template: landscape = 2-page spread, portrait = single page). */
export function pagesOf(spread: Spread | undefined, tplRatioWH: number): 1 | 2 {
  if (spread?.isCover) return spread.pages ?? 2;
  return tplRatioWH >= 1 ? 2 : 1;
}

export type ArrangeOp = "front" | "forward" | "backward" | "back";

/** Normalized key order: keeps valid entries, appends missing in natural order. */
export function orderKeys(order: string[] | undefined, all: string[]): string[] {
  const valid = new Set(all);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const k of order ?? []) {
    if (valid.has(k) && !seen.has(k)) {
      seen.add(k);
      out.push(k);
    }
  }
  for (const k of all) if (!seen.has(k)) out.push(k);
  return out;
}

/** All z-keys of a spread in natural (bottom→top) order:
 *  photo slots first, then template texts, added texts, typos. */
export function zKeysOf(spread: Spread, slotCount: number, tplTextCount: number): string[] {
  return [
    ...Array.from({ length: slotCount }, (_, i) => `s${i}`),
    ...Array.from({ length: tplTextCount }, (_, i) => `t${i}`),
    ...spread.addedTexts.map((a) => `a${a.id}`),
    ...(spread.typos ?? []).map((t) => `y${t.id}`),
  ];
}

/** Move `key` within an ordered list per the arrange op (later = on top). */
function applyArrange(order: string[], key: string, op: ArrangeOp): string[] {
  const pos = order.indexOf(key);
  if (pos < 0) return order;
  const out = [...order];
  out.splice(pos, 1);
  if (op === "front") out.push(key);
  else if (op === "back") out.unshift(key);
  else if (op === "forward") out.splice(Math.min(pos + 1, out.length), 0, key);
  else out.splice(Math.max(pos - 1, 0), 0, key);
  return out;
}

/** Album-wide print/design settings from the New Album wizard (SmartAlbums-style). */
export interface AlbumSettings {
  /** print DPI — export default + photo low-resolution warnings. */
  dpi: number;
  /** trim: edge strip the lab may cut away, mm (red dashed guide; 0 = off). */
  trimMm: number;
  /** safe zone from the page edge, mm (green dashed guide; 0 = off). */
  safeMm: number;
  /** border drawn around every photo, mm (0 = off). */
  borderMm: number;
  borderColor: string;
  /** gap between photos, mm — default margin of every new spread. */
  gapMm: number;
  /** which layout set drives suggestions (Space / Auto Design). */
  layoutSource: LayoutSourceFilter;
}

export const DEFAULT_SETTINGS: AlbumSettings = {
  dpi: 300,
  trimMm: 3,
  safeMm: 5,
  borderMm: 0,
  borderColor: "#ffffff",
  gapMm: 0,
  layoutSource: "all",
};

/** Gap in mm → margin as a fraction of the page height (0 when size unknown). */
function gapFrac(size: AlbumSize | null, gapMm: number): number {
  const cm = parseSizeCm(size);
  return cm && gapMm > 0 ? gapMm / 10 / cm.h : 0;
}

let counter = 0;
const newId = (p: string) => `${p}_${++counter}`;

function freshSpread(_size: AlbumSize, _slotCount = 1, margin = 0): Spread {
  // Blank white page (SmartAlbums): no suggested template — a layout is
  // picked automatically the moment the user drops photos in.
  return {
    id: newId("sp"),
    templateId: "",
    imageIds: [],
    transforms: {},
    textEdits: {},
    addedTexts: [],
    typos: [],
    margin,
  };
}

/** Per-photo curation metadata (SmartAlbums-style rating/reject). Persisted
 *  in the project file, keyed by the stable image id (hash of path). */
export interface PhotoMeta {
  rating?: number; // 0–5 stars
  rejected?: boolean; // X — hidden from the grid, file untouched
  /** color label 1–4 (keys 6–9): red / yellow / green / blue. */
  label?: 1 | 2 | 3 | 4;
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
  /** Album-wide settings from the New Album wizard. */
  settings: AlbumSettings;
  setSettings: (patch: Partial<AlbumSettings>) => void;

  createAlbum: (
    size: AlbumSize,
    spreadCount?: number,
    opts?: { settings?: AlbumSettings; bgColor?: string }
  ) => void;
  resetAlbum: () => void;
  /** Load a saved project (images re-imported separately by path). */
  applyProject: (p: {
    size: AlbumSize;
    bgColor: string;
    density: Density;
    currentIndex: number;
    spreads: Spread[];
    photoMeta?: Record<string, PhotoMeta>;
    settings?: Partial<AlbumSettings>;
  }) => void;

  addImages: (images: ImageMeta[]) => void;
  clearImages: () => void;
  /** Remove imported photos from the album (files on disk untouched):
   *  slots empty out, backgrounds drop, ratings/labels forgotten. */
  removeImages: (ids: string[]) => void;

  setSelectedPhotos: (ids: string[]) => void;
  /** Set the star rating (0–5) on every selected/named photo. */
  ratePhotos: (ids: string[], rating: number) => void;
  /** Toggle reject (X) on the given photos. */
  toggleRejected: (ids: string[]) => void;
  /** Set/toggle a color label (keys 6–9) on the given photos. */
  labelPhotos: (ids: string[], label: 1 | 2 | 3 | 4) => void;

  /** Canvas view zoom (1 = fit to screen). ⌘+/⌘−/⌘0. */
  viewZoom: number;
  setViewZoom: (z: number) => void;

  /** Toggle an image on the CURRENT spread; re-picks a template matching the new count. */
  toggleImage: (imageId: string) => void;
  /** Add several photos to the CURRENT spread at once (multi-select drop). */
  addToSpread: (imageIds: string[]) => void;
  /** SPACE: shuffle to another template with the same slot count. */
  shuffleCurrent: () => void;
  /** Explicitly set the current spread's template (from the gallery). */
  setTemplate: (templateId: string) => void;
  /** Hover-preview a template on the current spread WITHOUT committing
   *  (SmartAlbums layout strip / center grid). null = show the real one. */
  previewTemplateId: string | null;
  setPreviewTemplate: (templateId: string | null) => void;
  /** Commit a template: photos refill in order, edits/crops reset. */
  applyTemplate: (templateId: string) => void;
  /** Add photos to ANY spread (drop on the next-spread zone). */
  addToSpreadAt: (index: number, imageIds: string[]) => void;
  /** Drop on the cover zone: photo becomes the spread's full-bleed background. */
  setCoverImage: (imageId: string) => void;
  /** Empty a slot (no shift) on the current spread. */
  clearSlot: (slotIndex: number) => void;
  /** Place an image into a specific slot (drag-drop / replace). */
  setSlotImage: (slotIndex: number, imageId: string) => void;
  /** Update pan/zoom of an image in a slot on the current spread. */
  setSlotTransform: (slotIndex: number, t: SlotTransform) => void;
  /** Fill (cover) or Fit (contain) the image in a slot. */
  setSlotFit: (slotIndex: number, fit: "cover" | "contain") => void;
  /** Move/resize a slot frame (8-handle editing, like text). */
  setSlotRect: (slotIndex: number, rect: SlotRect) => void;
  /** Restore a slot frame to the template's position. */
  resetSlotRect: (slotIndex: number) => void;
  /** Arrange (§6): move ANY element (`s<i>`/`t<i>`/`a<id>`/`y<id>`) in the
   *  unified paint order — text/typo can go under photos and vice versa. */
  arrangeZ: (key: string, op: ArrangeOp) => void;
  /** Cover size: 1 = front only, 2 = full wrap (only the cover spread). */
  setCoverPages: (pages: 1 | 2) => void;
  /** Align anchor (SmartAlbums): a slot marked as the reference frame —
   *  other frames align to its center/edges from the panel. Phím G. */
  alignAnchor: number | null;
  setAlignAnchor: (i: number | null) => void;

  /** Multi-select (Shift-click): z-keys (`s<i>`/`t<i>`/`a<id>`/`y<id>`) of the
   *  grouped elements — move them together, tone-adjust the photos in one go. */
  multiSel: string[];
  toggleMultiSel: (key: string) => void;
  /** Marquee (kéo khung chọn): replace the whole group at once. */
  setMultiSel: (keys: string[]) => void;
  /** Move every grouped element. Slots normalize against the inner area,
   *  texts/typos against the stage — hence the two delta pairs. */
  moveGroup: (d: { slot: { dx: number; dy: number }; stage: { dx: number; dy: number } }) => void;
  /** Apply photo edits (tone/fit) to every PHOTO in the group. */
  adjustGroupPhotos: (patch: Partial<SlotTransform>) => void;
  /** Slot in crop mode (double-click a photo → pan/zoom it; Esc exits) §6.3. */
  cropSlot: number | null;
  setCropSlot: (slot: number | null) => void;
  /** Quality overlays (§10): bleed frame + gutter strip. Toggle with ⌘B. */
  showBleed: boolean;
  toggleBleed: () => void;
  /** Rulers along the canvas edges (§7.4). Toggle with ⌘R. */
  showRuler: boolean;
  toggleRuler: () => void;
  /** Active canvas tool (§7.2): select or draw a new photo frame. */
  tool: "select" | "drawSlot";
  setTool: (tool: "select" | "drawSlot") => void;
  /** Layout dock (docked picker under the topbar) — shared open state so the
   *  topbar button and the Layout panel both control it. */
  layoutDockOpen: boolean;
  setLayoutDock: (open: boolean) => void;
  /** Append a hand-drawn photo frame beyond the template's slots (§7.2). */
  addDrawnSlot: (rect: SlotRect) => void;
  /** Remove a hand-drawn frame (index >= template slot count). */
  removeDrawnSlot: (slotIndex: number) => void;
  /** Set gap between photos for the current spread. */
  setMargin: (margin: number) => void;
  /** Set photo→edge padding for the current spread (§6.6). */
  setPadding: (padding: number) => void;
  /** Copy the current spread's margin + padding to every spread (§6.6). */
  applySpacingAll: () => void;
  /** Rotate the photo in a slot by +90° (§6.7). */
  rotateSlot: (slotIndex: number) => void;
  /** Flip the photo in a slot horizontally/vertically (§6.7). */
  flipSlot: (slotIndex: number, axis: "h" | "v") => void;
  /** Full bleed: move a slot's photo to the spread background (§6.5). */
  setAsBackground: (slotIndex: number) => void;
  removeBackground: () => void;

  /** Swap: pick a source slot, then swap with the next slot clicked. */
  swapSource: number | null;
  beginSwap: (slotIndex: number) => void;
  cancelSwap: () => void;
  swapImages: (a: number, b: number) => void;
  /** Randomly rearrange the images among the filled slots (2 = swap, 3+ = shuffle). */
  shuffleImages: () => void;

  addSpread: () => void;
  /** Insert a fresh spread right after `index` (§6.7). */
  addSpreadAfter: (index: number) => void;
  /** Duplicate a spread with all its edits (§6.7). */
  duplicateSpread: (index: number) => void;
  removeSpread: (index: number) => void;
  /** Reorder: move a spread to a new position (filmstrip drag-drop). */
  moveSpread: (from: number, to: number) => void;
  /** Auto redesign just the current spread: new random layout, same photos (§5.4). */
  redesignSpread: () => void;
  /** Change the current spread's slot count by ±1, keeping photos (§6.4). */
  changeSlotCount: (delta: 1 | -1) => void;
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
  /** SmartAlbums click model: click the spread background = LAYOUT mode
   *  (ruler + frame editing; photo-swap dragging off) — click a photo outside
   *  layout mode = edit that photo. Esc leaves layout mode. */
  spreadSelected: boolean;
  selectSpread: () => void;
  clearSelection: () => void;

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
  settings: DEFAULT_SETTINGS,

  setSettings: (patch) =>
    set((s) => {
      const settings = { ...s.settings, ...patch };
      setPreferredSource(settings.layoutSource);
      return { settings };
    }),

  createAlbum: (size, spreadCount = 1, opts) =>
    set((s) => {
      const settings = opts?.settings ?? s.settings;
      // Suggestion pool must be narrowed BEFORE the spreads pick their templates.
      setPreferredSource(settings.layoutSource);
      const margin = gapFrac(size, settings.gapMm);
      // The cover is a real spread pinned at position 0 (2-page wrap default).
      const cover: Spread = { ...freshSpread(size, 1, margin), isCover: true, pages: 2 };
      return {
        size,
        settings,
        bgColor: opts?.bgColor ?? s.bgColor,
        spreads: [
          cover,
          ...Array.from({ length: Math.max(1, spreadCount) }, () => freshSpread(size, 1, margin)),
        ],
        currentIndex: 0,
        selectedSlot: null,
        photoMeta: {},
        selectedPhotos: [],
      };
    }),
  resetAlbum: () => {
    setPreferredSource("all");
    set({
      size: null,
      spreads: [],
      currentIndex: 0,
      images: [],
      selectedSlot: null,
      photoMeta: {},
      selectedPhotos: [],
      settings: DEFAULT_SETTINGS,
      bgColor: "#ffffff",
    });
  },

  applyProject: (p) => {
    const settings = { ...DEFAULT_SETTINGS, ...p.settings };
    setPreferredSource(settings.layoutSource);
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
      settings,
    });
  },

  addImages: (imgs) => set((s) => ({ images: [...s.images, ...imgs] })),
  clearImages: () => set({ images: [] }),

  removeImages: (ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const gone = new Set(ids);
      const images = s.images.filter((i) => !gone.has(i.id));
      const spreads = s.spreads.map((sp) => {
        const hit =
          sp.imageIds.some((id) => id && gone.has(id)) ||
          (sp.bgImageId && gone.has(sp.bgImageId));
        if (!hit) return sp;
        const transforms = { ...sp.transforms };
        const imageIds = sp.imageIds.map((id, i) => {
          if (id && gone.has(id)) {
            delete transforms[i];
            return "";
          }
          return id;
        });
        return {
          ...sp,
          imageIds,
          transforms,
          bgImageId: sp.bgImageId && gone.has(sp.bgImageId) ? null : sp.bgImageId,
        };
      });
      const photoMeta = { ...s.photoMeta };
      for (const id of ids) delete photoMeta[id];
      return { images, spreads, photoMeta, selectedPhotos: [], selectedSlot: null };
    }),

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

  labelPhotos: (ids, label) =>
    set((s) => {
      const photoMeta = { ...s.photoMeta };
      // Same key again clears the label (Lightroom-style toggle).
      const allSame = ids.every((id) => photoMeta[id]?.label === label);
      for (const id of ids) {
        photoMeta[id] = { ...photoMeta[id], label: allSame ? undefined : label };
      }
      return { photoMeta };
    }),

  viewZoom: 1,
  setViewZoom: (viewZoom) => set({ viewZoom }),

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
      cur.slotRects = {};
      cur.zOrder = undefined;
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
      const forCover = !!cur.isCover;
      const targetCount = nearestSlotCount(s.size, merged.length, forCover);
      const tpl = getTemplate(cur.templateId);
      if (targetCount > 0 && (!tpl || tpl.slotCount !== targetCount)) {
        const next = randomTemplate(s.size, targetCount, undefined, forCover);
        if (next) cur.templateId = next.id;
      }
      cur.imageIds = merged.slice(0, targetCount || merged.length);
      cur.transforms = {};
      cur.slotRects = {};
      cur.zOrder = undefined;
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: null, selectedText: null, selectedPhotos: [] };
    }),

  shuffleCurrent: () =>
    set((s) => {
      if (!s.size) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      // No image chosen yet → browse ALL layouts; once N images chosen → only N-slot.
      const forCover = !!cur.isCover;
      let next =
        cur.imageIds.length === 0
          ? nextTemplateAny(s.size, cur.templateId, forCover)
          : nextTemplateSameCount(cur.templateId);
      if (!next) {
        const count = nearestSlotCount(s.size, cur.imageIds.length || 1, forCover);
        next = randomTemplate(s.size, count, undefined, forCover);
      }
      if (next) {
        cur.templateId = next.id;
        cur.transforms = {};
      cur.slotRects = {};
      cur.zOrder = undefined;
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

  previewTemplateId: null,
  setPreviewTemplate: (previewTemplateId) => set({ previewTemplateId }),

  applyTemplate: (templateId) =>
    set((s) => {
      const next = getTemplate(templateId);
      if (!next) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const photos = cur.imageIds.filter(Boolean);
      cur.templateId = templateId;
      cur.imageIds = next.slots.map((_, i) => photos[i] ?? "");
      cur.transforms = {};
      cur.slotRects = {};
      cur.zOrder = undefined;
      cur.textEdits = {};
      spreads[s.currentIndex] = cur;
      return { spreads, previewTemplateId: null, selectedSlot: null, selectedText: null };
    }),

  addToSpreadAt: (index, imageIds) =>
    set((s) => {
      if (!s.size || imageIds.length === 0 || !s.spreads[index]) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[index] };
      const merged = [...cur.imageIds.filter(Boolean)];
      for (const id of imageIds) if (!merged.includes(id)) merged.push(id);
      if (merged.length === cur.imageIds.filter(Boolean).length) return s;
      const forCover = !!cur.isCover;
      const targetCount = nearestSlotCount(s.size, merged.length, forCover);
      const tpl = getTemplate(cur.templateId);
      if (targetCount > 0 && (!tpl || tpl.slotCount !== targetCount)) {
        const next = randomTemplate(s.size, targetCount, undefined, forCover);
        if (next) cur.templateId = next.id;
      }
      cur.imageIds = merged.slice(0, targetCount || merged.length);
      cur.transforms = {};
      cur.slotRects = {};
      cur.zOrder = undefined;
      spreads[index] = cur;
      return { spreads, selectedPhotos: [] };
    }),

  setCoverImage: (imageId) =>
    set((s) => {
      if (!imageId) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.bgImageId = imageId;
      spreads[s.currentIndex] = cur;
      return { spreads, selectedPhotos: [] };
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

  setPadding: (padding) =>
    set((s) => {
      const spreads = [...s.spreads];
      spreads[s.currentIndex] = { ...spreads[s.currentIndex], padding };
      return { spreads };
    }),

  applySpacingAll: () =>
    set((s) => {
      const cur = s.spreads[s.currentIndex];
      if (!cur) return s;
      const spreads = s.spreads.map((sp) => ({ ...sp, margin: cur.margin, padding: cur.padding }));
      return { spreads };
    }),

  rotateSlot: (slotIndex) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const t = cur.transforms[slotIndex] ?? { zoom: 1, panX: 0, panY: 0 };
      const rot = ((((t.rot ?? 0) + 90) % 360) as 0 | 90 | 180 | 270);
      cur.transforms = { ...cur.transforms, [slotIndex]: { ...t, rot, zoom: 1, panX: 0, panY: 0 } };
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  flipSlot: (slotIndex, axis) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const t = cur.transforms[slotIndex] ?? { zoom: 1, panX: 0, panY: 0 };
      const patch = axis === "h" ? { flipH: !t.flipH } : { flipV: !t.flipV };
      cur.transforms = { ...cur.transforms, [slotIndex]: { ...t, ...patch } };
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  setAsBackground: (slotIndex) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const id = cur.imageIds[slotIndex];
      if (!id) return s;
      // Photo moves from its slot to the spread background (slot empties in place).
      cur.bgImageId = id;
      cur.imageIds = cur.imageIds.map((x, i) => (i === slotIndex ? "" : x));
      const nextTransforms = { ...cur.transforms };
      delete nextTransforms[slotIndex];
      cur.transforms = nextTransforms;
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: null };
    }),

  removeBackground: () =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      if (!cur.bgImageId) return s;
      cur.bgImageId = null;
      spreads[s.currentIndex] = cur;
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
      cur.slotRects = {};
      cur.zOrder = undefined;
      spreads[s.currentIndex] = cur;
      return { spreads, swapSource: null, selectedSlot: null, selectedText: null, selectedTypo: null };
    }),

  addSpread: () =>
    set((s) => {
      if (!s.size) return s;
      const spreads = [...s.spreads, freshSpread(s.size, 1, gapFrac(s.size, s.settings.gapMm))];
      return { spreads, currentIndex: spreads.length - 1, selectedSlot: null };
    }),

  addSpreadAfter: (index) =>
    set((s) => {
      if (!s.size) return s;
      const spreads = [...s.spreads];
      spreads.splice(index + 1, 0, freshSpread(s.size, 1, gapFrac(s.size, s.settings.gapMm)));
      return { spreads, currentIndex: index + 1, selectedSlot: null };
    }),

  duplicateSpread: (index) =>
    set((s) => {
      const src = s.spreads[index];
      if (!src) return s;
      const copy: Spread = {
        ...structuredClone(src),
        id: newId("sp"),
        // a duplicated cover is just a normal spread — one cover per album
        isCover: undefined,
        pages: undefined,
      };
      const spreads = [...s.spreads];
      spreads.splice(index + 1, 0, copy);
      return { spreads, currentIndex: index + 1, selectedSlot: null };
    }),

  removeSpread: (index) =>
    set((s) => {
      if (s.spreads.length <= 1) return s;
      // the cover can't be deleted (clear its content instead)
      if (index === 0 && s.spreads[0]?.isCover) return s;
      const spreads = s.spreads.filter((_, i) => i !== index);
      const currentIndex = Math.min(s.currentIndex, spreads.length - 1);
      return { spreads, currentIndex, selectedSlot: null };
    }),

  moveSpread: (from, to) =>
    set((s) => {
      const max = s.spreads.length - 1;
      // the cover is pinned at 0 — it never moves, nothing moves before it
      const min = s.spreads[0]?.isCover ? 1 : 0;
      if (from < min) return s;
      const dest = Math.max(min, Math.min(max, to));
      if (from === dest || !s.spreads[from]) return s;
      const spreads = [...s.spreads];
      const [sp] = spreads.splice(from, 1);
      spreads.splice(dest, 0, sp);
      // keep the moved spread selected in its new position
      return { spreads, currentIndex: dest, selectedSlot: null, previewTemplateId: null };
    }),

  redesignSpread: () =>
    set((s) => {
      if (!s.size) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const tpl = getTemplate(cur.templateId);
      const count = tpl?.slotCount ?? Math.max(1, cur.imageIds.filter(Boolean).length);
      const next = randomTemplate(s.size, count, cur.templateId, !!cur.isCover);
      if (!next) return s;
      // Same photos, fresh layout: refill in order, drop crop tweaks.
      const photos = cur.imageIds.filter(Boolean);
      cur.templateId = next.id;
      cur.imageIds = next.slots.map((_, i) => photos[i] ?? "");
      cur.transforms = {};
      cur.slotRects = {};
      cur.zOrder = undefined;
      cur.textEdits = {};
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: null, selectedText: null };
    }),

  changeSlotCount: (delta) =>
    set((s) => {
      if (!s.size) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const tpl = getTemplate(cur.templateId);
      const count = tpl?.slotCount ?? 1;
      const forCover = !!cur.isCover;
      const target = nearestSlotCount(s.size, count + delta, forCover);
      if (target === count) return s;
      const next = randomTemplate(s.size, target, undefined, forCover);
      if (!next) return s;
      const photos = cur.imageIds.filter(Boolean);
      cur.templateId = next.id;
      cur.imageIds = next.slots.map((_, i) => photos[i] ?? "");
      cur.transforms = {};
      cur.slotRects = {};
      cur.zOrder = undefined;
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: null };
    }),

  cropSlot: null,
  setCropSlot: (cropSlot) => set({ cropSlot }),

  showBleed: true,
  toggleBleed: () => set((s) => ({ showBleed: !s.showBleed })),

  showRuler: true,
  toggleRuler: () => set((s) => ({ showRuler: !s.showRuler })),

  tool: "select",
  setTool: (tool) => set({ tool }),

  layoutDockOpen: false,
  setLayoutDock: (layoutDockOpen) => set({ layoutDockOpen }),

  addDrawnSlot: (rect) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const tpl = getTemplate(cur.templateId);
      const base = tpl?.slotCount ?? 0;
      // Extra frames live at sequential indices right after the template's.
      const extras = Object.keys(cur.slotRects ?? {})
        .map(Number)
        .filter((k) => k >= base);
      const idx = base + extras.length;
      cur.slotRects = { ...cur.slotRects, [idx]: rect };
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: idx, tool: "select" };
    }),

  removeDrawnSlot: (slotIndex) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const tpl = getTemplate(cur.templateId);
      const base = tpl?.slotCount ?? 0;
      if (slotIndex < base || !cur.slotRects?.[slotIndex]) return s;
      // Compact the extra frames (and their photos) so indices stay sequential.
      const extras = Object.keys(cur.slotRects)
        .map(Number)
        .filter((k) => k >= base)
        .sort((a, b) => a - b);
      const keptRects: Record<number, SlotRect> = {};
      for (const [k, v] of Object.entries(cur.slotRects)) {
        if (Number(k) < base) keptRects[Number(k)] = v;
      }
      const imageIds = [...cur.imageIds];
      const transforms = { ...cur.transforms };
      let out = base;
      for (const k of extras) {
        if (k === slotIndex) {
          delete transforms[k];
          continue;
        }
        keptRects[out] = cur.slotRects[k];
        imageIds[out] = cur.imageIds[k] ?? "";
        if (cur.transforms[k]) transforms[out] = cur.transforms[k];
        out++;
      }
      imageIds.length = out;
      cur.slotRects = keptRects;
      cur.imageIds = imageIds;
      cur.transforms = transforms;
      cur.zOrder = undefined; // slot indices shifted — drop the custom paint order
      spreads[s.currentIndex] = cur;
      return { spreads, selectedSlot: null };
    }),

  setSlotRect: (slotIndex, rect) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      cur.slotRects = { ...cur.slotRects, [slotIndex]: rect };
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  resetSlotRect: (slotIndex) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      if (!cur.slotRects?.[slotIndex]) return s;
      const next = { ...cur.slotRects };
      delete next[slotIndex];
      cur.slotRects = next;
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  alignAnchor: null,
  setAlignAnchor: (alignAnchor) => set({ alignAnchor }),

  multiSel: [],
  setMultiSel: (multiSel) =>
    set({ multiSel, selectedSlot: null, selectedText: null, selectedTypo: null }),
  toggleMultiSel: (key) =>
    set((s) => {
      let sel = s.multiSel;
      // First Shift-click folds the current single selection into the group.
      if (sel.length === 0) {
        const seed: string[] = [];
        if (s.selectedSlot !== null) seed.push(`s${s.selectedSlot}`);
        if (s.selectedText)
          seed.push(s.selectedText.kind === "tpl" ? `t${s.selectedText.index}` : `a${s.selectedText.id}`);
        if (s.selectedTypo) seed.push(`y${s.selectedTypo}`);
        sel = seed;
      }
      sel = sel.includes(key) ? sel.filter((k) => k !== key) : [...sel, key];
      return { multiSel: sel, selectedSlot: null, selectedText: null, selectedTypo: null };
    }),

  moveGroup: (d) =>
    set((s) => {
      if (s.multiSel.length === 0) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const tpl = getTemplate(cur.templateId);
      const slotRects = { ...cur.slotRects };
      const textEdits = { ...cur.textEdits };
      let addedTexts = cur.addedTexts;
      let typos = cur.typos ?? [];
      for (const k of s.multiSel) {
        if (k[0] === "s") {
          const i = parseInt(k.slice(1), 10);
          const base =
            tpl && i < tpl.slots.length
              ? { ...tpl.slots[i], ...(slotRects[i] ?? {}) }
              : slotRects[i];
          if (!base) continue;
          slotRects[i] = { ...base, x: base.x + d.slot.dx, y: base.y + d.slot.dy };
        } else if (k[0] === "t") {
          const i = parseInt(k.slice(1), 10);
          const ed = textEdits[i] ?? {};
          textEdits[i] = { ...ed, dx: (ed.dx ?? 0) + d.stage.dx, dy: (ed.dy ?? 0) + d.stage.dy };
        } else if (k[0] === "a") {
          addedTexts = addedTexts.map((a) =>
            `a${a.id}` === k ? { ...a, x: a.x + d.stage.dx, y: a.y + d.stage.dy } : a
          );
        } else {
          typos = typos.map((t) =>
            `y${t.id}` === k ? { ...t, x: t.x + d.stage.dx, y: t.y + d.stage.dy } : t
          );
        }
      }
      cur.slotRects = slotRects;
      cur.textEdits = textEdits;
      cur.addedTexts = addedTexts;
      cur.typos = typos;
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  adjustGroupPhotos: (patch) =>
    set((s) => {
      if (s.multiSel.length === 0) return s;
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const transforms = { ...cur.transforms };
      for (const k of s.multiSel) {
        if (k[0] !== "s") continue;
        const i = parseInt(k.slice(1), 10);
        if (!cur.imageIds[i]) continue;
        const prev = transforms[i] ?? { zoom: 1, panX: 0, panY: 0 };
        transforms[i] = { ...prev, ...patch };
      }
      cur.transforms = transforms;
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  setCoverPages: (pages) =>
    set((s) => {
      const cover = s.spreads[0];
      if (!cover?.isCover || cover.pages === pages) return s;
      const spreads = [...s.spreads];
      spreads[0] = { ...cover, pages };
      return { spreads };
    }),

  arrangeZ: (key, op) =>
    set((s) => {
      const spreads = [...s.spreads];
      const cur = { ...spreads[s.currentIndex] };
      const tpl = getTemplate(cur.templateId);
      const tplSlots = tpl?.slotCount ?? 0;
      const extras = Object.keys(cur.slotRects ?? {})
        .map(Number)
        .filter((k) => k >= tplSlots).length;
      const all = zKeysOf(cur, tplSlots + extras, tpl?.texts.length ?? 0);
      if (!all.includes(key)) return s;
      cur.zOrder = applyArrange(orderKeys(cur.zOrder, all), key, op);
      spreads[s.currentIndex] = cur;
      return { spreads };
    }),

  setCurrent: (index) =>
    set({
      currentIndex: index,
      selectedSlot: null,
      swapSource: null,
      cropSlot: null,
      previewTemplateId: null,
      spreadSelected: false,
      alignAnchor: null,
      multiSel: [],
    }),

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
      const margin = gapFrac(s.size, s.settings.gapMm);
      const planned = plans.map((p) => ({
        id: newId("sp"),
        templateId: p.templateId,
        imageIds: p.imageIds,
        transforms: {},
        textEdits: {},
        addedTexts: [],
        typos: [],
        margin,
      }));
      // Auto Design fills the CONTENT spreads — the cover stays untouched.
      const cover = s.spreads[0]?.isCover ? [s.spreads[0]] : [];
      const spreads = [...cover, ...planned];
      return { spreads, currentIndex: cover.length, selectedSlot: null, selectedText: null, selectedTypo: null };
    }),

  // NOTE: selecting a slot KEEPS the layout mode (spreadSelected) — in layout
  // mode a click on a frame means "edit this frame", not "edit this photo".
  selectSlot: (selectedSlot) =>
    set({ selectedSlot, selectedText: null, selectedTypo: null, swapSource: null, multiSel: [] }),

  spreadSelected: false,
  selectSpread: () =>
    set({
      spreadSelected: true,
      selectedSlot: null,
      selectedText: null,
      selectedTypo: null,
      swapSource: null,
      multiSel: [],
    }),
  /** Esc / panel ✕: drop every selection AND leave layout mode. */
  clearSelection: () =>
    set({
      selectedSlot: null,
      selectedText: null,
      selectedTypo: null,
      swapSource: null,
      spreadSelected: false,
      multiSel: [],
    }),

  selectText: (selectedText) =>
    set({
      selectedText,
      selectedSlot: null,
      selectedTypo: null,
      swapSource: null,
      spreadSelected: false,
      multiSel: [],
    }),

  selectTypo: (selectedTypo) =>
    set({
      selectedTypo,
      selectedSlot: null,
      selectedText: null,
      swapSource: null,
      spreadSelected: false,
      multiSel: [],
    }),

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
