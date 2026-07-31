/** F6 — procedural grain for spread backgrounds. A single monochrome noise
 *  tile is generated once and reused everywhere; the *intensity* is the node's
 *  opacity, so dragging the Noise slider never regenerates pixels (stays
 *  smooth). Blended with "overlay" it reads as film grain over the color. */

const TILE = 128;

let cached: HTMLCanvasElement | null = null;

/** A cached 128×128 monochrome noise tile (opaque grays). Typed as an image
 *  for Konva's `fillPatternImage` — a canvas is a valid pattern source at
 *  runtime, the DOM types just don't model that. */
export function noiseTile(): HTMLImageElement {
  if (cached) return cached as unknown as HTMLImageElement;
  const c = document.createElement("canvas");
  c.width = TILE;
  c.height = TILE;
  const ctx = c.getContext("2d")!;
  const img = ctx.createImageData(TILE, TILE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  cached = c;
  return c as unknown as HTMLImageElement;
}

/** Map the 0..1 noise slider to a sane overlay opacity (full = subtle grain,
 *  not a static-TV blast). */
export function noiseOpacity(noise: number): number {
  return Math.max(0, Math.min(1, noise)) * 0.5;
}