import type { ImageMeta } from "../ipc/import";
import {
  availableSlotCounts,
  nearestSlotCount,
  suggestionTemplates,
  type AlbumSize,
  type Template,
} from "./templates";

export type Density = "thua" | "can" | "day";

/** Target images-per-spread bands (§4.3). */
const BANDS: Record<Density, number[]> = {
  thua: [1, 2],
  can: [3, 4],
  day: [5, 6, 7, 8],
};

export const DENSITY_LABELS: { id: Density; label: string }[] = [
  { id: "thua", label: "Thưa" },
  { id: "can", label: "Cân" },
  { id: "day", label: "Dày" },
];

const orient = (r: number) => (r > 1.15 ? "L" : r < 0.87 ? "P" : "S");

function pickCount(size: AlbumSize, density: Density): number {
  const avail = availableSlotCounts(size);
  const cands = BANDS[density].filter((n) => avail.includes(n));
  if (cands.length) return cands[Math.floor(Math.random() * cands.length)];
  const band = BANDS[density];
  return nearestSlotCount(size, band[Math.floor(band.length / 2)]);
}

/** Template with `count` slots whose slot orientations best match the image group. */
function pickTemplate(size: AlbumSize, count: number, group: ImageMeta[]): Template | undefined {
  const pool = suggestionTemplates(size).filter((t) => t.slotCount === count);
  if (!pool.length) return undefined;
  const gsig = group.map((g) => orient(g.ratio)).sort().join("");
  let best = -1;
  let bestPool: Template[] = [];
  for (const t of pool) {
    const tsig = t.slots.map((s) => orient(s.ratioWH ?? 1)).sort().join("");
    let score = 0;
    for (let k = 0; k < Math.min(gsig.length, tsig.length); k++) {
      if (gsig[k] === tsig[k]) score++;
    }
    if (score > best) {
      best = score;
      bestPool = [t];
    } else if (score === best) {
      bestPool.push(t);
    }
  }
  return bestPool[Math.floor(Math.random() * bestPool.length)];
}

export interface SpreadPlan {
  templateId: string;
  imageIds: string[];
}

/** Auto Design options (SmartAlbums §5.2). */
export interface AutoDesignOptions {
  density: Density;
  /** Photo order: chronological (default) or by filename. */
  order?: "date" | "name";
  /** % of spreads that become a single-photo statement (full-bleed style). */
  fullBleedPct?: number;
  /** Star ratings — rated photos get priority for the single-photo spreads. */
  ratings?: Record<string, number>;
}

/** 1-photo template whose slot covers the most area (closest to full bleed). */
function pickFullBleedTemplate(size: AlbumSize): Template | undefined {
  const pool = suggestionTemplates(size).filter((t) => t.slotCount === 1);
  if (!pool.length) return undefined;
  let best: Template | undefined;
  let bestArea = -1;
  for (const t of pool) {
    const s = t.slots[0];
    const area = s.w * s.h;
    if (area > bestArea) {
      bestArea = area;
      best = t;
    }
  }
  return best;
}

/** Fill a template's slots from a group: widest image → widest slot. */
function assign(tpl: Template, group: ImageMeta[]): string[] {
  const slotOrder = tpl.slots
    .map((s, idx) => ({ idx, r: s.ratioWH ?? 1 }))
    .sort((a, b) => b.r - a.r);
  const grpOrder = group.map((g) => ({ id: g.id, r: g.ratio })).sort((a, b) => b.r - a.r);
  const imageIds: string[] = new Array(tpl.slotCount).fill("");
  for (let k = 0; k < Math.min(slotOrder.length, grpOrder.length); k++) {
    imageIds[slotOrder[k].idx] = grpOrder[k].id;
  }
  return imageIds;
}

/** SmartAlbums-style Auto Design (§5.3): sort → group by density → match
 *  templates by ratio → sprinkle single-photo (full-bleed) spreads, giving
 *  those spots to the highest-rated photo nearby. */
export function planAutoDesign(
  size: AlbumSize,
  images: ImageMeta[],
  opts: AutoDesignOptions
): SpreadPlan[] {
  const order = opts.order ?? "date";
  const fbPct = Math.max(0, Math.min(100, opts.fullBleedPct ?? 0));
  const ratings = opts.ratings ?? {};

  let queue = [...images].sort(
    order === "name"
      ? (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })
      : (a, b) => a.capturedAt.localeCompare(b.capturedAt)
  );

  const out: SpreadPlan[] = [];
  let fbAcc = 0;
  let guard = 0;

  while (queue.length > 0 && guard++ < 1000) {
    fbAcc += fbPct;
    if (fbAcc >= 100) {
      fbAcc -= 100;
      const tpl = pickFullBleedTemplate(size);
      if (tpl) {
        // Give the solo spread to the best-rated photo in the near window,
        // keeping chronology roughly intact.
        const window = queue.slice(0, 6);
        let bestIdx = 0;
        let bestRating = -1;
        window.forEach((p, k) => {
          const r = ratings[p.id] ?? 0;
          if (r > bestRating) {
            bestRating = r;
            bestIdx = k;
          }
        });
        const chosen = queue[bestIdx];
        queue = queue.filter((_, k) => k !== bestIdx);
        const imageIds = new Array(tpl.slotCount).fill("");
        imageIds[0] = chosen.id;
        out.push({ templateId: tpl.id, imageIds });
        continue;
      }
    }

    let n = pickCount(size, opts.density);
    if (n > queue.length) n = nearestSlotCount(size, queue.length);
    if (n <= 0) break;

    const group = queue.slice(0, n);
    queue = queue.slice(n);
    const tpl = pickTemplate(size, n, group);
    if (!tpl) continue;
    out.push({ templateId: tpl.id, imageIds: assign(tpl, group) });
  }
  return out;
}

/** Back-compat: chronological plan with just a density. */
export function planAutoLayout(size: AlbumSize, images: ImageMeta[], density: Density): SpreadPlan[] {
  return planAutoDesign(size, images, { density });
}
