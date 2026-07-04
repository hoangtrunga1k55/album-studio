import type { ImageMeta } from "../ipc/import";
import {
  availableSlotCounts,
  nearestSlotCount,
  templatesForSize,
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
  const pool = templatesForSize(size).filter((t) => t.slotCount === count);
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

/** Distribute images chronologically across spreads (§4.3 Auto Design). */
export function planAutoLayout(
  size: AlbumSize,
  images: ImageMeta[],
  density: Density
): SpreadPlan[] {
  const sorted = [...images].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  const out: SpreadPlan[] = [];
  let i = 0;
  let guard = 0;

  while (i < sorted.length && guard++ < 500) {
    let n = pickCount(size, density);
    if (i + n > sorted.length) n = nearestSlotCount(size, sorted.length - i);
    if (n <= 0) break;

    const group = sorted.slice(i, i + n);
    const tpl = pickTemplate(size, n, group);
    if (!tpl) {
      i += n;
      continue;
    }

    // Assign by orientation: widest image → widest slot.
    const slotOrder = tpl.slots
      .map((s, idx) => ({ idx, r: s.ratioWH ?? 1 }))
      .sort((a, b) => b.r - a.r);
    const grpOrder = group
      .map((g) => ({ id: g.id, r: g.ratio }))
      .sort((a, b) => b.r - a.r);

    const imageIds: string[] = new Array(tpl.slotCount).fill("");
    for (let k = 0; k < Math.min(slotOrder.length, grpOrder.length); k++) {
      imageIds[slotOrder[k].idx] = grpOrder[k].id;
    }
    out.push({ templateId: tpl.id, imageIds });
    i += group.length;
  }
  return out;
}
