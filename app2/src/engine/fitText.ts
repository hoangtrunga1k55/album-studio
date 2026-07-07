/** Measure-based font sizing so an editable text overlay matches the size the
 *  original text occupies in the design — independent of each font's internal
 *  em metrics (which make `fontSizeFrac` render too small for display fonts).
 *
 *  We size from the ORIGINAL design content + width, so the font size stays put
 *  while the user edits (deleting/adding characters must not rescale the text). */

let _ctx: CanvasRenderingContext2D | null = null;
function ctx(): CanvasRenderingContext2D | null {
  if (_ctx) return _ctx;
  if (typeof document === "undefined") return null;
  _ctx = document.createElement("canvas").getContext("2d");
  return _ctx;
}

const FAMILY_FALLBACK = `"EB Garamond", Georgia, serif`;

/** Font size (px) so one line of `text` in `font` renders exactly `targetWidthPx` wide. */
export function fitFontSizeToWidth(text: string, font: string, targetWidthPx: number): number {
  const c = ctx();
  if (!c || !text.trim() || targetWidthPx <= 0) return 0;
  c.font = `100px "${font}", ${FAMILY_FALLBACK}`;
  const w = c.measureText(text).width;
  return w > 0 ? (100 * targetWidthPx) / w : 0;
}

/** A single-line text (no explicit line breaks) — the case we width-fit. */
export function isSingleLine(s: string): boolean {
  return !/[\r\n]/.test(s);
}