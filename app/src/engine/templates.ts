/** LIORE layout templates (PSD → JSON), grouped by album size + slot count. */

export type AlbumSize = "30x30" | "25x35";
export const ALBUM_SIZES: { id: AlbumSize; label: string; note: string }[] = [
  { id: "30x30", label: "30 × 30 cm", note: "Vuông · spread 2 trang" },
  { id: "25x35", label: "25 × 35 cm", note: "Dọc · spread 2 trang" },
];

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
    };
  });
}

export const TEMPLATES: Template[] = [
  ...build(mods30, bg30, "30x30"),
  ...build(mods25, bg25, "25x35"),
];

export function getTemplate(id: string | null): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function templatesForSize(size: AlbumSize): Template[] {
  return TEMPLATES.filter((t) => t.size === size && t.slotCount > 0);
}

/** Slot counts actually available for a size, ascending. */
export function availableSlotCounts(size: AlbumSize): number[] {
  return [...new Set(templatesForSize(size).map((t) => t.slotCount))].sort(
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
  const pool = templatesForSize(cur.size)
    .filter((t) => t.slotCount === cur.slotCount)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (pool.length <= 1) return cur;
  const i = pool.findIndex((t) => t.id === currentId);
  return pool[(i + 1) % pool.length];
}

/** Next template (deterministic rotation) across ALL templates of a size,
 *  regardless of slot count — used by SPACE before any image is selected. */
export function nextTemplateAny(size: AlbumSize, currentId: string): Template | undefined {
  const pool = templatesForSize(size).sort((a, b) => a.id.localeCompare(b.id));
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
  let pool = templatesForSize(size).filter((t) => t.slotCount === count);
  if (pool.length === 0) return undefined;
  if (excludeId && pool.length > 1) {
    pool = pool.filter((t) => t.id !== excludeId);
  }
  return pool[Math.floor(Math.random() * pool.length)];
}
