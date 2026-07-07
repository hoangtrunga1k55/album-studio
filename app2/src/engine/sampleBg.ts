/** Sample the background colour behind a text box (to cover the rasterized
 *  original when the user starts editing it). Border-point mode, cached per url. */

interface Sampled {
  data: Uint8ClampedArray;
  w: number;
  h: number;
}

const cache = new Map<string, Sampled | null | Promise<Sampled | null>>();
const SAMPLE_MAX = 700;

function load(url: string): Promise<Sampled | null> {
  const existing = cache.get(url);
  if (existing instanceof Promise) return existing;
  if (existing !== undefined) return Promise.resolve(existing);

  const p = new Promise<Sampled | null>((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, SAMPLE_MAX / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const cv = document.createElement("canvas");
        cv.width = w;
        cv.height = h;
        const ctx = cv.getContext("2d")!;
        ctx.drawImage(img, 0, 0, w, h);
        const entry = { data: ctx.getImageData(0, 0, w, h).data, w, h };
        cache.set(url, entry);
        resolve(entry);
      } catch {
        cache.set(url, null);
        resolve(null);
      }
    };
    img.onerror = () => {
      cache.set(url, null);
      resolve(null);
    };
    img.src = url;
  });
  cache.set(url, p);
  return p;
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Most common colour along the bbox border (likely background, not glyph). */
export async function sampleBgColor(
  url: string,
  nx: number,
  ny: number,
  nw: number,
  nh: number
): Promise<string> {
  const e = await load(url);
  if (!e) return "#ffffff";
  const { data, w, h } = e;
  const x0 = nx * w;
  const y0 = ny * h;
  const x1 = (nx + nw) * w;
  const y1 = (ny + nh) * h;

  const counts = new Map<string, { n: number; r: number; g: number; b: number }>();
  for (let t = 0; t <= 1.0001; t += 0.2) {
    const pts: [number, number][] = [
      [x0 + (x1 - x0) * t, y0],
      [x0 + (x1 - x0) * t, y1],
      [x0, y0 + (y1 - y0) * t],
      [x1, y0 + (y1 - y0) * t],
    ];
    for (const [px, py] of pts) {
      const xi = Math.min(w - 1, Math.max(0, Math.round(px)));
      const yi = Math.min(h - 1, Math.max(0, Math.round(py)));
      const idx = (yi * w + xi) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const key = `${r >> 4}-${g >> 4}-${b >> 4}`;
      const c = counts.get(key) ?? { n: 0, r: 0, g: 0, b: 0 };
      c.n++;
      c.r += r;
      c.g += g;
      c.b += b;
      counts.set(key, c);
    }
  }
  let best: { n: number; r: number; g: number; b: number } | null = null;
  for (const c of counts.values()) if (!best || c.n > best.n) best = c;
  return best ? toHex(best.r / best.n, best.g / best.n, best.b / best.n) : "#ffffff";
}
