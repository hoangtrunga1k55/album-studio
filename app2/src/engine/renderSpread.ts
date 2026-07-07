import Konva from "konva";
import type { Spread } from "../store/album";
import type { Template } from "./templates";
import type { ImageMeta } from "../ipc/import";
import { getExportImage } from "../ipc/export";
import { getTypo } from "./typos";
import { sampleBgColor } from "./sampleBg";
import { fitFontSizeToWidth, isSingleLine } from "./fitText";

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = src;
  });
}

const fam = (f: string) => `"${f}", "EB Garamond", Georgia, serif`;

export interface RenderResult {
  dataUrl: string;
  w: number;
  h: number;
}

/** Render one spread at print resolution to a JPEG data URL.
 *
 *  When `hiresBg` (a full-res, text-free layout-pack background) is provided,
 *  it replaces the bundled preview plate AND every template text is redrawn as
 *  sharp vector — that is the print-quality path. Without it, the baked preview
 *  plate is used and only user-edited texts get a vector overlay. */
export async function renderSpread(
  spread: Spread,
  tpl: Template,
  images: ImageMeta[],
  bgColor: string,
  dpi: number,
  quality: number,
  hiresBg?: string | null,
  pageCm?: { w: number; h: number } | null
): Promise<RenderResult> {
  // Print at the album's true page size (cm): landscape templates are 2-page
  // spreads (2×w × h), portrait ones a single page (w × h) — the normalized
  // layout stretches to that ratio, so custom sizes work too.
  const spreadCm = pageCm
    ? tpl.ratioWH >= 1
      ? { w: pageCm.w * 2, h: pageCm.h }
      : pageCm
    : null;
  let W: number, H: number;
  if (spreadCm) {
    W = Math.round((dpi * spreadCm.w) / 2.54);
    H = Math.round((dpi * spreadCm.h) / 2.54);
  } else {
    const longCm = tpl.ratioWH >= 1 ? 50 : 35;
    const longPx = Math.round((dpi * longCm) / 2.54);
    W = tpl.ratioWH >= 1 ? longPx : Math.round(longPx * tpl.ratioWH);
    H = tpl.ratioWH >= 1 ? Math.round(longPx / tpl.ratioWH) : longPx;
  }

  const container = document.createElement("div");
  container.style.display = "none";
  document.body.appendChild(container);
  const stage = new Konva.Stage({ container, width: W, height: H });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);

  try {
    // Hi-res text-free plate → clean-background print path (render all text vector).
    const cleanBg = !!hiresBg;
    const bgSrc = hiresBg || tpl.bg;
    layer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: bgColor }));
    if (spread.bgImageId) {
      // Full-bleed background photo replaces the template plate (§6.5).
      const meta = images.find((m) => m.id === spread.bgImageId);
      if (meta) {
        try {
          const bg = await loadImg(await getExportImage(meta.path));
          const scale = Math.max(W / bg.width, H / bg.height);
          const dw = bg.width * scale;
          const dh = bg.height * scale;
          layer.add(
            new Konva.Image({ image: bg, x: (W - dw) / 2, y: (H - dh) / 2, width: dw, height: dh })
          );
        } catch {
          /* ignore */
        }
      }
    } else if (bgSrc) {
      try {
        const bg = await loadImg(bgSrc);
        layer.add(new Konva.Image({ image: bg, x: 0, y: 0, width: W, height: H }));
      } catch {
        /* ignore missing bg */
      }
    }

    // Fonts must be ready before any text measuring below.
    await document.fonts.ready;

    // Covers for edited/deleted template texts — UNDER the photos, so they only
    // hide the raster text baked into the plate (never a photo dragged above).
    if (!cleanBg && !spread.bgImageId) {
      for (let i = 0; i < tpl.texts.length; i++) {
        const ed = spread.textEdits[i];
        if (!ed) continue;
        const tx = tpl.texts[i];
        const fontName = ed.font ?? tx.font ?? "";
        const orig = tx.content ?? "";
        const fit = orig.trim() && isSingleLine(orig) ? fitFontSizeToWidth(orig, fontName, tx.w * W) : 0;
        const lines0 = Math.max(1, orig.replace(/\r/g, "\n").split("\n").length);
        const baseFs = fit > 0 ? fit : tx.fontSizeFrac ? tx.fontSizeFrac * H : ((tx.h * H) / lines0) * 0.86;
        const fs = Math.max(7, baseFs * (ed.sizeScale ?? 1));
        const cover = tpl.bg
          ? await sampleBgColor(tpl.bg, tx.x, tx.y, tx.w, tx.h).catch(() => bgColor)
          : bgColor;
        const ox = tx.x * W;
        const oy = tx.y * H;
        const ow = tx.w * W;
        const oh = tx.h * H;
        const padX = ow * 0.04 + fs * 0.12;
        const padY = oh * 0.22;
        layer.add(
          new Konva.Rect({ x: ox - padX, y: oy - padY / 2, width: ow + padX * 2, height: oh + padY, fill: cover })
        );
      }
    }

    // Margin = photo↔photo gap; Padding = photo↔edge inset (§6.6).
    const gap = (spread.margin ?? 0) * H;
    const padIn = (spread.padding ?? 0) * H;
    const innerW = W - padIn * 2;
    const innerH = H - padIn * 2;
    for (let i = 0; i < tpl.slots.length; i++) {
      const id = spread.imageIds[i];
      if (!id) continue;
      const meta = images.find((m) => m.id === id);
      if (!meta) continue;
      // User-moved/resized frames override the template rect.
      const s = { ...tpl.slots[i], ...(spread.slotRects?.[i] ?? {}) };
      const px = {
        x: padIn + s.x * innerW + gap / 2,
        y: padIn + s.y * innerH + gap / 2,
        w: Math.max(4, s.w * innerW - gap),
        h: Math.max(4, s.h * innerH - gap),
      };
      let img: HTMLImageElement;
      try {
        img = await loadImg(await getExportImage(meta.path));
      } catch {
        continue;
      }
      const t = spread.transforms[i] ?? { zoom: 1, panX: 0, panY: 0, fit: "cover" as const };
      // Rotation swaps the footprint; fit against rotated bounds (same as display).
      const rot = t.rot ?? 0;
      const swapped = rot === 90 || rot === 270;
      const iw = swapped ? img.height : img.width;
      const ih = swapped ? img.width : img.height;
      const fitScale =
        t.fit === "contain" ? Math.min(px.w / iw, px.h / ih) : Math.max(px.w / iw, px.h / ih);
      const scale = fitScale * (t.zoom ?? 1);
      const dw = iw * scale;
      const dh = ih * scale;
      const maxX = Math.max(0, (dw - px.w) / 2);
      const maxY = Math.max(0, (dh - px.h) / 2);
      const nw = img.width * scale;
      const nh = img.height * scale;
      const g = new Konva.Group({ clipX: px.x, clipY: px.y, clipWidth: px.w, clipHeight: px.h });
      g.add(
        new Konva.Image({
          image: img,
          x: px.x + px.w / 2 + (t.panX ?? 0) * maxX,
          y: px.y + px.h / 2 + (t.panY ?? 0) * maxY,
          width: nw,
          height: nh,
          offsetX: nw / 2,
          offsetY: nh / 2,
          rotation: rot,
          scaleX: t.flipH ? -1 : 1,
          scaleY: t.flipV ? -1 : 1,
        })
      );
      layer.add(g);
    }

    // Ensure imported fonts are ready before measuring/drawing text.
    await document.fonts.ready;

    // Template text. On a clean (text-free) hi-res plate every text is redrawn
    // as vector. On the baked preview plate the original text is already there,
    // so only edited texts need a cover + overlay, and deleted ones a cover.
    for (let i = 0; i < tpl.texts.length; i++) {
      const ed = spread.textEdits[i];
      if (!cleanBg && !ed) continue;
      const tx = tpl.texts[i];
      const nx = tx.x + (ed?.dx ?? 0);
      const ny = tx.y + (ed?.dy ?? 0);
      const px = { x: nx * W, y: ny * H, w: tx.w * W, h: tx.h * H };
      const content = (ed?.content ?? tx.content ?? "").replace(/\r/g, "\n");
      const lines = Math.max(1, content.split("\n").length);
      const fontName = ed?.font ?? tx.font ?? "";
      const orig = tx.content ?? "";
      const fit = orig.trim() && isSingleLine(orig) ? fitFontSizeToWidth(orig, fontName, tx.w * W) : 0;
      const baseFs = fit > 0 ? fit : tx.fontSizeFrac ? tx.fontSizeFrac * H : ((tx.h * H) / lines) * 0.86;
      const fs = Math.max(7, baseFs * (ed?.sizeScale ?? 1));

      if (ed?.deleted) continue;
      layer.add(
        new Konva.Text({
          x: px.x,
          y: px.y,
          width: Math.max(px.w, fs),
          scaleX: ed?.scaleX ?? 1,
          scaleY: ed?.scaleY ?? 1,
          text: content,
          fontSize: fs,
          fontFamily: fam(ed?.font ?? tx.font ?? ""),
          fill: ed?.color ?? tx.color ?? "#222222",
          align: "center",
          lineHeight: 1.12,
        })
      );
    }
    spread.addedTexts.forEach((a) => {
      const content = a.content.replace(/\r/g, "\n");
      const fs = Math.max(8, a.sizeFrac * H);
      layer.add(
        new Konva.Text({
          x: a.x * W,
          y: a.y * H,
          width: W * 0.5,
          scaleX: a.scaleX ?? 1,
          scaleY: a.scaleY ?? 1,
          text: content,
          fontSize: fs,
          fontFamily: fam(a.font),
          fill: a.color,
          align: "center",
          lineHeight: 1.12,
        })
      );
    });

    // placed typo designs (decoration + vector text)
    for (const pt of spread.typos ?? []) {
      const typo = getTypo(pt.typoId);
      if (!typo) continue;
      const tw = pt.w * W;
      const th = tw / (typo.ratioWH || 1);
      const g = new Konva.Group({
        x: pt.x * W,
        y: pt.y * H,
        scaleX: pt.scaleX ?? 1,
        scaleY: pt.scaleY ?? 1,
      });
      if (typo.deco) {
        try {
          const d = await loadImg(typo.deco);
          g.add(new Konva.Image({ image: d, x: 0, y: 0, width: tw, height: th }));
        } catch {
          /* ignore */
        }
      }
      for (const tx of typo.texts) {
        const content = (tx.content ?? "").replace(/\r/g, "\n");
        const lines = Math.max(1, content.split("\n").length);
        const fs = Math.max(6, ((tx.h * th) / lines) * 0.86);
        g.add(
          new Konva.Text({
            x: tx.x * tw,
            y: tx.y * th,
            width: Math.max(tx.w * tw, fs),
            text: content,
            fontSize: fs,
            fontFamily: fam(tx.font ?? ""),
            fill: pt.color ?? tx.color ?? "#ffffff",
            align: "center",
            lineHeight: 1.1,
          })
        );
      }
      layer.add(g);
    }

    await document.fonts.ready;
    layer.draw();
    const dataUrl = stage.toDataURL({ mimeType: "image/jpeg", quality: quality / 100, pixelRatio: 1 });
    return { dataUrl, w: W, h: H };
  } finally {
    stage.destroy();
    container.remove();
  }
}
