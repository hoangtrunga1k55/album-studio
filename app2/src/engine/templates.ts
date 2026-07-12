/** LIORE layout templates (PSD → JSON), grouped by album size + slot count. */

/** Album size id — a preset ("25x35") or a custom "WxH" in cm ("28x30"). */
export type AlbumSize = string;
export const ALBUM_SIZES: { id: AlbumSize; label: string; note: string }[] = [
  { id: "30x30", label: "30 × 30 cm", note: "Vuông · spread 2 trang" },
  { id: "25x35", label: "25 × 35 cm", note: "Dọc · spread 2 trang" },
];

/** Parse "25x35" → page {w, h} in cm (null if not in WxH form). */
export function parseSizeCm(size: AlbumSize | null | undefined): { w: number; h: number } | null {
  if (!size) return null;
  const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/.exec(size.trim());
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  return w > 0 && h > 0 ? { w, h } : null;
}

/** Physical spread size (cm) for a template inside an album of `size`:
 *  landscape templates are 2-page spreads (2×w × h), portrait ones a single
 *  page (w × h). Normalized layouts stretch to this — SmartAlbums-style —
 *  so custom sizes reuse the same template pools. */
export function spreadCmFor(
  tpl: Pick<Template, "ratioWH">,
  size: AlbumSize | null | undefined
): { w: number; h: number } | null {
  const cm = parseSizeCm(size);
  if (!cm) return null;
  return (tpl.ratioWH || 2) >= 1 ? { w: cm.w * 2, h: cm.h } : { w: cm.w, h: cm.h };
}

export interface PhotoSlot {
  x: number;
  y: number;
  w: number;
  h: number;
  ratioWH?: number;
}

export interface TemplateText {
  x: number;
  y: number;
  w: number;
  h: number;
  content?: string;
  font?: string;
  fontSizeRaw?: number | null;
  /** True font size as a fraction of canvas height (fontSizeRaw × transform
   *  scale ÷ canvasH). Multiply by render height for the exact display size. */
  fontSizeFrac?: number;
  color?: string | null;
}

/** Where a template comes from — drives the 3 gallery tabs. */
export type TemplateSource = "basic" | "tizino" | "custom";

export interface Template {
  id: string;
  size: AlbumSize;
  name: string;
  ratioWH: number;
  slots: PhotoSlot[];
  texts: TemplateText[];
  slotCount: number;
  /** URL of the PSD decoration-only background plate (looks like the PSD). */
  bg?: string;
  /** basic = generated plain frames · tizino = PSD designs · custom = My Layouts. */
  source?: TemplateSource;
}

interface RawTemplate {
  canvas?: { ratioWH?: number };
  photoSlots?: PhotoSlot[];
  texts?: TemplateText[];
}

const mods30 = import.meta.glob<RawTemplate>("../assets/layouts/30x30/*.json", {
  eager: true,
  import: "default",
});
const mods25 = import.meta.glob<RawTemplate>("../assets/layouts/25x35/*.json", {
  eager: true,
  import: "default",
});
const bg30 = import.meta.glob<string>("../assets/layouts/30x30/*.bg.jpg", {
  eager: true,
  import: "default",
  query: "?url",
});
const bg25 = import.meta.glob<string>("../assets/layouts/25x35/*.bg.jpg", {
  eager: true,
  import: "default",
  query: "?url",
});

function bgMap(mods: Record<string, string>): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [path, url] of Object.entries(mods)) {
    const name = path.split("/").pop()!.replace(".bg.jpg", "");
    map[name] = url;
  }
  return map;
}

/** PSD font names sometimes come wrapped in quotes ("'Gilroy-Regular'") — strip them. */
function cleanFontName(f?: string): string | undefined {
  if (!f) return f;
  return f.replace(/^[\s'"’‘“”]+/, "").replace(/[\s'"’‘“”]+$/, "");
}

function build(
  mods: Record<string, RawTemplate>,
  bgs: Record<string, string>,
  size: AlbumSize
): Template[] {
  const bgByName = bgMap(bgs);
  return Object.entries(mods).map(([path, raw]) => {
    const file = path.split("/").pop()!.replace(".json", "");
    const slots = raw.photoSlots ?? [];
    const texts = (raw.texts ?? []).map((t) => ({ ...t, font: cleanFontName(t.font) }));
    return {
      id: `${size}/${file}`,
      size,
      name: file.replace("Layout ", ""),
      ratioWH: raw.canvas?.ratioWH ?? 2,
      slots,
      texts,
      slotCount: slots.length,
      bg: bgByName[file],
      source: "tizino" as const,
    };
  });
}

export const TEMPLATES: Template[] = [
  ...build(mods30, bg30, "30x30"),
  ...build(mods25, bg25, "25x35"),
];

/* ---------- Basic library: generated plain-frame layouts (SmartAlbums-style).
   Size-agnostic (normalized) — they stretch to any album size and fill the
   slot counts the Tizino pool doesn't cover (e.g. 5–8 for dense spreads). --- */

const BG = 0.02; // gap between frames
const BM = 0.05; // outer margin for non-full layouts
/** slot ratio ≈ (w/h) × spread ratio (~1.43) — good enough for orientation matching */
const r = (x: number, y: number, w: number, h: number): PhotoSlot => ({
  x, y, w, h, ratioWH: (w / h) * 1.43,
});

/** Split [from..to] into n cells with BG gaps. */
function seq(n: number, from = BM, to = 1 - BM): { p: number; s: number }[] {
  const span = (to - from - BG * (n - 1)) / n;
  return Array.from({ length: n }, (_, i) => ({ p: from + i * (span + BG), s: span }));
}

function grid(cols: number, rows: number): PhotoSlot[] {
  const xs = seq(cols);
  const ys = seq(rows);
  const out: PhotoSlot[] = [];
  for (const y of ys) for (const x of xs) out.push(r(x.p, y.p, x.s, y.s));
  return out;
}

function basic(name: string, slots: PhotoSlot[]): Template {
  return {
    id: `basic/${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${slots.length}`,
    size: "*",
    name,
    ratioWH: 1.43,
    slots,
    texts: [],
    slotCount: slots.length,
    source: "basic",
  };
}

const COL2 = seq(2);
const COL3 = seq(3);
const ROW2 = seq(2);

const BASIC_TEMPLATES: Template[] = [
  // 1 photo
  basic("Tràn trang", [r(0, 0, 1, 1)]),
  basic("Trung tâm", [r(0.18, 0.1, 0.64, 0.8)]),
  basic("Lệch phải", [r(0.42, 0.08, 0.5, 0.84)]),
  // 2 photos
  basic("Đôi ngang", [r(COL2[0].p, BM, COL2[0].s, 1 - BM * 2), r(COL2[1].p, BM, COL2[1].s, 1 - BM * 2)]),
  basic("Lớn trái nhỏ phải", [r(BM, BM, 0.56, 1 - BM * 2), r(0.65, 0.28, 0.3, 0.44)]),
  basic("Hai trang đôi", [r(0.03, 0.06, 0.44, 0.88), r(0.53, 0.06, 0.44, 0.88)]),
  // 3 photos
  basic("Trái lớn 2 phải", [
    r(BM, BM, 0.55, 1 - BM * 2),
    r(0.63, ROW2[0].p, 0.32, ROW2[0].s),
    r(0.63, ROW2[1].p, 0.32, ROW2[1].s),
  ]),
  basic("Ba cột", COL3.map((c) => r(c.p, BM, c.s, 1 - BM * 2))),
  basic("1 trên 2 dưới", [
    r(0.25, BM, 0.5, 0.5),
    r(BM, 0.58, 0.43, 0.36),
    r(0.52, 0.58, 0.43, 0.36),
  ]),
  // 4 photos
  basic("Lưới 2×2", grid(2, 2)),
  basic("Lớn trái 3 phải", [
    r(BM, BM, 0.55, 1 - BM * 2),
    ...seq(3).map((y) => r(0.63, y.p, 0.32, y.s)),
  ]),
  basic("Bốn cột", seq(4).map((c) => r(c.p, 0.2, c.s, 0.6))),
  // 5 photos
  basic("Lớn giữa 4 góc", [
    r(0.3, 0.22, 0.4, 0.56),
    r(BM, BM, 0.2, 0.3),
    r(0.75, BM, 0.2, 0.3),
    r(BM, 0.65, 0.2, 0.3),
    r(0.75, 0.65, 0.2, 0.3),
  ]),
  basic("Lớn trái 4 phải", [
    r(BM, BM, 0.5, 1 - BM * 2),
    ...grid(2, 2).map((s) => r(0.585 + (s.x - BM) * 0.44, s.y, s.w * 0.44, s.h)),
  ]),
  // 6 photos
  basic("Lưới 3×2", grid(3, 2)),
  basic("Lớn trái lưới phải", [
    r(BM, BM, 0.42, 1 - BM * 2),
    ...(() => {
      const xs = seq(2, 0.51, 1 - BM);
      const ys = seq(3);
      const out: PhotoSlot[] = [];
      for (const y of ys) for (const x of xs) out.push(r(x.p, y.p, x.s, y.s));
      return out;
    })(),
  ]),
  // 7 photos
  basic("Mosaic 7", [
    r(BM, BM, 0.35, 0.55),
    r(0.42, BM, 0.26, 0.35),
    r(0.7, BM, 0.25, 0.45),
    r(BM, 0.63, 0.25, 0.32),
    r(0.32, 0.43, 0.36, 0.52),
    r(0.7, 0.52, 0.25, 0.2),
    r(0.7, 0.74, 0.25, 0.21),
  ]),
  // 8 photos
  basic("Lưới 4×2", grid(4, 2)),
];

/* ---------- My Layouts (§7.5): user-saved custom templates ---------- */

const CUSTOM_KEY = "albumstudio2.customLayouts";

function loadCustoms(): Template[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    const list = raw ? (JSON.parse(raw) as Template[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

let CUSTOMS: Template[] = loadCustoms();

function persistCustoms() {
  try {
    localStorage.setItem(CUSTOM_KEY, JSON.stringify(CUSTOMS));
  } catch {
    /* ignore */
  }
}

export function customTemplates(): Template[] {
  return CUSTOMS;
}

/** Save the current spread's frame layout as a reusable template. */
export function saveCustomTemplate(
  size: AlbumSize,
  name: string,
  ratioWH: number,
  slots: PhotoSlot[]
): Template {
  const tpl: Template = {
    id: `custom/${Date.now()}`,
    size,
    name: name || `My Layout ${CUSTOMS.length + 1}`,
    ratioWH,
    slots,
    texts: [],
    slotCount: slots.length,
    source: "custom",
  };
  CUSTOMS = [...CUSTOMS, tpl];
  persistCustoms();
  return tpl;
}

export function deleteCustomTemplate(id: string) {
  CUSTOMS = CUSTOMS.filter((t) => t.id !== id);
  persistCustoms();
}

/** Trang trắng: album mới không gán mẫu (SmartAlbums) — canvas/export dùng
 *  bản này khi spread chưa có template; layout thật vào khi user thả ảnh. */
export const BLANK_TEMPLATE: Template = {
  id: "",
  size: "*",
  name: "Trống",
  ratioWH: 2,
  slots: [],
  texts: [],
  slotCount: 0,
  source: "basic",
};

export function getTemplate(id: string | null): Template | undefined {
  return (
    TEMPLATES.find((t) => t.id === id) ??
    BASIC_TEMPLATES.find((t) => t.id === id) ??
    CUSTOMS.find((t) => t.id === id)
  );
}

/** Which layout set drives suggestions (wizard "Bộ layout" select). */
export type LayoutSourceFilter = "all" | TemplateSource;

let preferredSource: LayoutSourceFilter = "all";

export function setPreferredSource(f: LayoutSourceFilter) {
  preferredSource = f;
}

/** Pool used by Space/shuffle/Auto Design: templatesForSize narrowed to the
 *  album's preferred layout set. Falls back to the full pool when the chosen
 *  set is empty (e.g. "Mẫu của tôi" with no saved layouts yet). */
export function suggestionTemplates(size: AlbumSize): Template[] {
  const all = templatesForSize(size);
  if (preferredSource === "all") return all;
  const filtered = all.filter((t) => (t.source ?? "tizino") === preferredSource);
  return filtered.length > 0 ? filtered : all;
}

export function templatesForSize(size: AlbumSize): Template[] {
  const customs = CUSTOMS.filter((t) => t.size === size && t.slotCount > 0);
  const exact = TEMPLATES.filter((t) => t.size === size && t.slotCount > 0);
  if (exact.length > 0) return [...BASIC_TEMPLATES, ...exact, ...customs];

  // Custom size → no dedicated pool. Fall back to the non-empty preset pool
  // whose page ratio is closest (normalized slots/texts stretch to any ratio).
  const target = parseSizeCm(size);
  const pools = new Map<string, Template[]>();
  for (const t of TEMPLATES) {
    if (t.slotCount === 0) continue;
    if (!pools.has(t.size)) pools.set(t.size, []);
    pools.get(t.size)!.push(t);
  }
  let best: Template[] = [];
  let bestDiff = Infinity;
  for (const [poolSize, list] of pools) {
    const cm = parseSizeCm(poolSize);
    const diff =
      target && cm ? Math.abs(cm.w / cm.h - target.w / target.h) : Number.MAX_SAFE_INTEGER / 2;
    if (diff < bestDiff || (diff === bestDiff && list.length > best.length)) {
      best = list;
      bestDiff = diff;
    }
  }
  return [...BASIC_TEMPLATES, ...best, ...customs];
}

/** Slot counts actually available for a size, ascending. */
export function availableSlotCounts(size: AlbumSize): number[] {
  return [...new Set(suggestionTemplates(size).map((t) => t.slotCount))].sort(
    (a, b) => a - b
  );
}

/** Closest available slot count to `n` for a size (prefers exact). */
export function nearestSlotCount(size: AlbumSize, n: number): number {
  const counts = availableSlotCounts(size);
  if (counts.length === 0) return 0;
  return counts.reduce((best, c) =>
    Math.abs(c - n) < Math.abs(best - n) ? c : best
  );
}

/** Next template (deterministic rotation) with the same size + slot count.
 *  Cycling through ALL of them before repeating — this is what SPACE does. */
export function nextTemplateSameCount(currentId: string): Template | undefined {
  const cur = getTemplate(currentId);
  if (!cur) return undefined;
  const pool = suggestionTemplates(cur.size)
    .filter((t) => t.slotCount === cur.slotCount)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (pool.length <= 1) return cur;
  const i = pool.findIndex((t) => t.id === currentId);
  return pool[(i + 1) % pool.length];
}

/** Next template (deterministic rotation) across ALL templates of a size,
 *  regardless of slot count — used by SPACE before any image is selected. */
export function nextTemplateAny(size: AlbumSize, currentId: string): Template | undefined {
  const pool = suggestionTemplates(size).sort((a, b) => a.id.localeCompare(b.id));
  if (pool.length === 0) return undefined;
  const i = pool.findIndex((t) => t.id === currentId);
  return pool[(i + 1) % pool.length];
}

/** A random template for a size with exactly `count` slots, optionally excluding one id. */
export function randomTemplate(
  size: AlbumSize,
  count: number,
  excludeId?: string
): Template | undefined {
  let pool = suggestionTemplates(size).filter((t) => t.slotCount === count);
  if (pool.length === 0) return undefined;
  if (excludeId && pool.length > 1) {
    pool = pool.filter((t) => t.id !== excludeId);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
