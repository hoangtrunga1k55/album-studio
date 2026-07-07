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
    if (bgSrc) {
      try {
        const bg = await loadImg(bgSrc);
        layer.add(new Konva.Image({ image: bg, x: 0, y: 0, width: W, height: H }));
      } catch {
        /* ignore missing bg */
      }
    }

    const gap = (spread.margin ?? 0) * H;
    for (let i = 0; i < tpl.slots.length; i++) {
      const id = spread.imageIds[i];
      if (!id) continue;
      const meta = images.find((m) => m.id === id);
      if (!meta) continue;
      const s = tpl.slots[i];
      const px = {
        x: s.x * W + gap / 2,
        y: s.y * H + gap / 2,
        w: Math.max(4, s.w * W - gap),
        h: Math.max(4, s.h * H - gap),
      };
      let img: HTMLImageElement;
      try {
        img = await loadImg(await getExportImage(meta.path));
      } catch {
        continue;
      }
      const t = spread.transforms[i] ?? { zoom: 1, panX: 0, panY: 0, fit: "cover" as const };
      const fitScale =
        t.fit === "contain"
          ? Math.min(px.w / img.width, px.h / img.height)
          : Math.max(px.w / img.width, px.h / img.height);
      const scale = fitScale * (t.zoom ?? 1);
      const dw = img.width * scale;
      const dh = img.height * scale;
      const maxX = Math.max(0, (dw - px.w) / 2);
      const maxY = Math.max(0, (dh - px.h) / 2);
      const g = new Konva.Group({ clipX: px.x, clipY: px.y, clipWidth: px.w, clipHeight: px.h });
      g.add(
        new Konva.Image({
          image: img,
          x: px.x + (px.w - dw) / 2 + (t.panX ?? 0) * maxX,
          y: px.y + (px.h - dh) / 2 + (t.panY ?? 0) * maxY,
          width: dw,
          height: dh,
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

      // Cover the baked raster only when it exists (preview plate) and this text
      // is edited or deleted. The cover stays at the ORIGINAL position (so moving
      // the text doesn't reveal the raster). The clean hi-res plate needs none.
      if (!cleanBg && ed) {
        const cover = tpl.bg ? await sampleBgColor(tpl.bg, tx.x, tx.y, tx.w, tx.h).catch(() => bgColor) : bgColor;
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
