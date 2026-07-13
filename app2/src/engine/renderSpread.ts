import Konva from "konva";
import { orderKeys, pagesOf, zKeysOf, type Spread } from "../store/album";
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
  pageCm?: { w: number; h: number } | null,
  /** print bleed in cm (0 = none): the design is scaled up to cover it (§12.3). */
  bleedCm = 0,
  /** draw corner crop marks in the bleed margin (§12.3). */
  cropMarks = false,
  /** album setting: border around every photo, points (0 = off). */
  borderPt = 0,
  borderColor = "#ffffff"
): Promise<RenderResult> {
  // Print at the album's true page size (cm). The cover decides its own page
  // count (1 = front only, 2 = wrap); content spreads follow the template
  // orientation. The normalized layout stretches to that ratio.
  const pages = pagesOf(spread, tpl.ratioWH);
  const spreadCm = pageCm ? { w: pageCm.w * pages, h: pageCm.h } : null;
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

  // Bleed: the output canvas grows by the bleed on every side, and the whole
  // design is scaled up (from the center) so edge content extends past trim.
  const bp = Math.round((dpi * bleedCm) / 2.54);
  const outW = W + bp * 2;
  const outH = H + bp * 2;
  const bleedScale = bp > 0 ? Math.max(outW / W, outH / H) : 1;

  const container = document.createElement("div");
  container.style.display = "none";
  document.body.appendChild(container);
  const stage = new Konva.Stage({ container, width: outW, height: outH });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);
  const root = new Konva.Group({
    x: (outW - W * bleedScale) / 2,
    y: (outH - H * bleedScale) / 2,
    scaleX: bleedScale,
    scaleY: bleedScale,
  });
  layer.add(root);

  try {
    // Hi-res text-free plate → clean-background print path (render all text vector).
    const cleanBg = !!hiresBg;
    const bgSrc = hiresBg || tpl.bg;
    root.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: bgColor }));
    if (spread.bgImageId) {
      // Full-bleed background photo replaces the template plate (§6.5).
      const meta = images.find((m) => m.id === spread.bgImageId);
      if (meta) {
        try {
          const bg = await loadImg(await getExportImage(meta.path));
          const scale = Math.max(W / bg.width, H / bg.height);
          const dw = bg.width * scale;
          const dh = bg.height * scale;
          root.add(
            new Konva.Image({ image: bg, x: (W - dw) / 2, y: (H - dh) / 2, width: dw, height: dh })
          );
        } catch {
          /* ignore */
        }
      }
    } else if (bgSrc) {
      try {
        const bg = await loadImg(bgSrc);
        root.add(new Konva.Image({ image: bg, x: 0, y: 0, width: W, height: H }));
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
        root.add(
          new Konva.Rect({ x: ox - padX, y: oy - padY / 2, width: ow + padX * 2, height: oh + padY, fill: cover })
        );
      }
    }

    // Margin = photo↔photo gap; Padding = photo↔edge inset (§6.6).
    const gap = (spread.margin ?? 0) * H;
    const padIn = (spread.padding ?? 0) * H;
    const innerW = W - padIn * 2;
    const innerH = H - padIn * 2;
    // Template slots (with user overrides) + hand-drawn extra frames (§7.2).
    const allSlots = [
      ...tpl.slots.map((s, i) => ({ ...s, ...(spread.slotRects?.[i] ?? {}) })),
      ...Object.entries(spread.slotRects ?? {})
        .map(([k, v]) => [Number(k), v] as const)
        .filter(([k]) => k >= tpl.slots.length)
        .sort((a, b) => a[0] - b[0])
        .map(([, v]) => ({ ...v })),
    ];
    // Unified paint order (Arrange): photos, template texts, added texts and
    // typos in ONE stack (first = bottom) — matches the canvas exactly.
    for (const zk of orderKeys(spread.zOrder, zKeysOf(spread, allSlots.length, tpl.texts.length))) {
      if (zk[0] === "s") {
      const i = parseInt(zk.slice(1), 10);
      const id = spread.imageIds[i];
      if (!id) continue;
      const meta = images.find((m) => m.id === id);
      if (!meta) continue;
      const s = allSlots[i];
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
      const frameRot = spread.slotRects?.[i]?.rotDeg ?? 0;
      const imgNode = new Konva.Image({
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
      });
      // Tone adjustments — identical filters to the display canvas.
      if ((t.brightness ?? 0) !== 0 || (t.contrast ?? 0) !== 0) {
        imgNode.filters([Konva.Filters.Brighten, Konva.Filters.Contrast]);
        imgNode.brightness(t.brightness ?? 0);
        imgNode.contrast(t.contrast ?? 0);
        imgNode.cache();
      }
      g.add(imgNode);
      // Wizard border setting — same geometry as the display canvas.
      const bw = (borderPt / 72) * dpi; // points → inch → px
      const border =
        bw > 0
          ? new Konva.Rect({
              x: px.x,
              y: px.y,
              width: px.w,
              height: px.h,
              stroke: borderColor,
              strokeWidth: bw,
            })
          : null;
      if (frameRot) {
        // spin the whole frame (clip + photo) around its center — matches display
        const cx = px.x + px.w / 2;
        const cy = px.y + px.h / 2;
        const wrap = new Konva.Group({ x: cx, y: cy, offsetX: cx, offsetY: cy, rotation: frameRot });
        wrap.add(g);
        if (border) wrap.add(border);
        root.add(wrap);
      } else {
        root.add(g);
        if (border) root.add(border);
      }
      continue;
      }

      if (zk[0] === "t") {
      const i = parseInt(zk.slice(1), 10);
      const tx = tpl.texts[i];
      if (!tx) continue;
      const ed = spread.textEdits[i];
      if (!cleanBg && !ed) continue;
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
      root.add(
        new Konva.Text({
          x: px.x,
          y: px.y,
          width: Math.max(px.w, fs),
          scaleX: ed?.scaleX ?? 1,
          scaleY: ed?.scaleY ?? 1,
          rotation: ed?.rotDeg ?? 0,
          text: content,
          fontSize: fs,
          fontFamily: fam(ed?.font ?? tx.font ?? ""),
          fill: ed?.color ?? tx.color ?? "#222222",
          align: "center",
          lineHeight: 1.12,
        })
      );
      continue;
      }

      if (zk[0] === "a") {
      const a = spread.addedTexts.find((x) => x.id === zk.slice(1));
      if (!a) continue;
      const content = a.content.replace(/\r/g, "\n");
      const fs = Math.max(8, a.sizeFrac * H);
      root.add(
        new Konva.Text({
          x: a.x * W,
          y: a.y * H,
          width: W * 0.5,
          scaleX: a.scaleX ?? 1,
          scaleY: a.scaleY ?? 1,
          rotation: a.rotDeg ?? 0,
          text: content,
          fontSize: fs,
          fontFamily: fam(a.font),
          fill: a.color,
          align: "center",
          lineHeight: 1.12,
        })
      );
      continue;
      }

      // placed typo design `y<id>` (decoration + vector text)
      const pt = (spread.typos ?? []).find((x) => x.id === zk.slice(1));
      if (!pt) continue;
      const typo = getTypo(pt.typoId);
      if (!typo) continue;
      const tw = pt.w * W;
      const th = tw / (typo.ratioWH || 1);
      const g = new Konva.Group({
        x: pt.x * W,
        y: pt.y * H,
        scaleX: pt.scaleX ?? 1,
        scaleY: pt.scaleY ?? 1,
        rotation: pt.rotDeg ?? 0,
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
      root.add(g);
    }

    // Ensure imported fonts are ready before measuring/drawing text.
    await document.fonts.ready;


    // Crop marks: corner ticks at the trim box, drawn in the bleed margin.
    if (cropMarks && bp > 0) {
      const len = Math.max(12, bp * 0.8);
      const off = 4; // small gap so marks never touch the trim
      const mark = (points: number[]) =>
        layer.add(new Konva.Line({ points, stroke: "#000", strokeWidth: Math.max(1, dpi / 150) }));
      const corners = [
        { cx: bp, cy: bp, dx: -1, dy: -1 },
        { cx: bp + W, cy: bp, dx: 1, dy: -1 },
        { cx: bp, cy: bp + H, dx: -1, dy: 1 },
        { cx: bp + W, cy: bp + H, dx: 1, dy: 1 },
      ];
      for (const c of corners) {
        mark([c.cx + c.dx * off, c.cy, c.cx + c.dx * (off + len), c.cy]);
        mark([c.cx, c.cy + c.dy * off, c.cx, c.cy + c.dy * (off + len)]);
      }
    }

    await document.fonts.ready;
    layer.draw();
    const dataUrl = stage.toDataURL({ mimeType: "image/jpeg", quality: quality / 100, pixelRatio: 1 });
    return { dataUrl, w: outW, h: outH };
  } finally {
    stage.destroy();
    container.remove();
  }
}
