import type Konva from "konva";

/** Rotate-handle icon: circular badge with a half-circle arrow (↻), so the
 *  rotation anchor is self-explanatory instead of a plain dot. */
const ICON_SIZE = 22;

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 24 24">
  <circle cx="12" cy="12" r="11" fill="#6e76ff"/>
  <path d="M16.9 8.6 A 5.8 5.8 0 1 0 17.8 12" fill="none" stroke="#fff"
        stroke-width="1.9" stroke-linecap="round"/>
  <path d="M17.6 4.9 L17.1 8.8 L13.2 8.2 Z" fill="#fff"/>
</svg>`;

let icon: HTMLImageElement | null = null;
function iconImage(onReady: () => void): HTMLImageElement {
  if (!icon) {
    icon = new Image();
    icon.src = `data:image/svg+xml;utf8,${encodeURIComponent(SVG)}`;
  }
  if (!icon.complete) icon.addEventListener("load", onReady, { once: true });
  return icon;
}

/** Pass as `anchorStyleFunc` on a Transformer: turns the rotater anchor into
 *  the ↻ icon (other anchors keep the default style). */
export function rotaterIconStyle(anchor: Konva.Rect): void {
  if (!anchor.hasName("rotater")) return;
  const img = iconImage(() => anchor.getLayer()?.batchDraw());
  anchor.setAttrs({
    width: ICON_SIZE,
    height: ICON_SIZE,
    offsetX: ICON_SIZE / 2,
    offsetY: ICON_SIZE / 2,
    cornerRadius: ICON_SIZE / 2,
    strokeEnabled: false,
    fillPriority: "pattern",
    fillPatternImage: img,
    fillPatternRepeat: "no-repeat",
    fillPatternScaleX: ICON_SIZE / 44,
    fillPatternScaleY: ICON_SIZE / 44,
  });
}
