import Konva from "konva";
import type { Spread } from "../store/album";
import type { Template } from "./templates";
import type { ImageMeta } from "../ipc/import";
import { getExportImage } from "../ipc/export";
import { getTypo } from "./typos";
import { sampleBgColor } from "./sampleBg";

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

/** Render one spread at print resolution to a JPEG data URL. */
export async function renderSpread(
  spread: Spread,
  tpl: Template,
  images: ImageMeta[],
  bgColor: string,
  dpi: number,
  quality: number
): Promise<RenderResult> {
  // Spread long edge ≈ 50cm (landscape) / 35cm (portrait single page).
  const longCm = tpl.ratioWH >= 1 ? 50 : 35;
  const longPx = Math.round((dpi * longCm) / 2.54);
  const W = tpl.ratioWH >= 1 ? longPx : Math.round(longPx * tpl.ratioWH);
  const H = tpl.ratioWH >= 1 ? Math.round(longPx / tpl.ratioWH) : longPx;

  const container = document.createElement("div");
  container.style.display = "none";
  document.body.appendChild(container);
  const stage = new Konva.Stage({ container, width: W, height: H });
  const layer = new Konva.Layer({ listening: false });
  stage.add(layer);

  try {
    layer.add(new Konva.Rect({ x: 0, y: 0, width: W, height: H, fill: bgColor }));
    if (tpl.bg) {
      try {
        const bg = await loadImg(tpl.bg);
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

    // Template text: original is baked into the bg plate. Only edited/deleted
    // ones need a cover + (for edited) an overlay in the chosen font.
    for (let i = 0; i < tpl.texts.length; i++) {
      const ed = spread.textEdits[i];
      if (!ed) continue;
      const tx = tpl.texts[i];
      const nx = tx.x + (ed.dx ?? 0);
      const ny = tx.y + (ed.dy ?? 0);
      const px = { x: nx * W, y: ny * H, w: tx.w * W, h: tx.h * H };
      const content = (ed.content ?? tx.content ?? "").replace(/\r/g, "\n");
      const lines = Math.max(1, content.split("\n").length);
      const fs = Math.max(7, ((tx.h * H) / lines) * 0.86 * (ed.sizeScale ?? 1));
      const cover = tpl.bg ? await sampleBgColor(tpl.bg, nx, ny, tx.w, tx.h).catch(() => bgColor) : bgColor;
      const padX = px.w * 0.04 + fs * 0.12;
      const padY = px.h * 0.22;
      layer.add(
        new Konva.Rect({ x: px.x - padX, y: px.y - padY / 2, width: px.w + padX * 2, height: px.h + padY, fill: cover })
      );
      if (ed.deleted) continue;
      layer.add(
        new Konva.Text({
          x: px.x,
          y: px.y,
          width: Math.max(px.w, fs),
          text: content,
          fontSize: fs,
          fontFamily: fam(ed.font ?? tx.font ?? ""),
          fill: ed.color ?? tx.color ?? "#222222",
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
      const gx = pt.x * W;
      const gy = pt.y * H;
      if (typo.deco) {
        try {
          const d = await loadImg(typo.deco);
          layer.add(new Konva.Image({ image: d, x: gx, y: gy, width: tw, height: th }));
        } catch {
          /* ignore */
        }
      }
      for (const tx of typo.texts) {
        const content = (tx.content ?? "").replace(/\r/g, "\n");
        const lines = Math.max(1, content.split("\n").length);
        const fs = Math.max(6, ((tx.h * th) / lines) * 0.86);
        layer.add(
          new Konva.Text({
            x: gx + tx.x * tw,
            y: gy + tx.y * th,
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
