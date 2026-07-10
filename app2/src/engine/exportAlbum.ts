import { PDFDocument } from "pdf-lib";
import { renderSpread } from "./renderSpread";
import { getTemplate } from "./templates";
import { writeExport, type ExportFile } from "../ipc/export";
import { readLayoutBg, savedLayoutFolder } from "../ipc/layouts";
import type { Spread } from "../store/album";
import type { ImageMeta } from "../ipc/import";

export type ExportFormat = "jpg" | "pdf" | "both";

export interface ExportOpts {
  format: ExportFormat;
  dpi: number;
  quality: number;
  prefix: string;
  folder: string;
  /** Album page size in cm (from the album's size, incl. custom "WxH"). */
  pageCm?: { w: number; h: number } | null;
  /** JPG output: whole spreads or single pages (spread cut in half) §12.2. */
  pageMode?: "spread" | "page";
  /** print bleed in mm (0 = off) §12.3. */
  bleedMm?: number;
  /** corner crop marks (needs bleed > 0) §12.3. */
  cropMarks?: boolean;
  /** album setting: border around every photo, mm (0 = off). */
  borderMm?: number;
  borderColor?: string;
}

/** Cut a rendered spread JPEG into left/right page halves (§12.2). */
async function splitPages(dataUrl: string, quality: number): Promise<string[]> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = reject;
    im.src = dataUrl;
  });
  const half = Math.floor(img.width / 2);
  const cut = (x: number, w: number) => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = img.height;
    c.getContext("2d")!.drawImage(img, x, 0, w, img.height, 0, 0, w, img.height);
    return c.toDataURL("image/jpeg", quality / 100);
  };
  return [cut(0, half), cut(half, img.width - half)];
}

export interface CancelRef {
  cancelled: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
const stripDataUri = (d: string) => d.substring(d.indexOf(",") + 1);

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

/** Render every spread and write JPG/PDF into Export_YYYY-MM-DD/. Returns the folder. */
export async function exportAlbum(
  spreads: Spread[],
  images: ImageMeta[],
  bgColor: string,
  opts: ExportOpts,
  onProgress: (done: number, total: number) => void,
  cancel: CancelRef
): Promise<string> {
  const layoutFolder = savedLayoutFolder();
  const pages: { dataUrl: string; w: number; h: number }[] = [];
  for (let i = 0; i < spreads.length; i++) {
    if (cancel.cancelled) throw new Error("cancelled");
    onProgress(i, spreads.length);
    const tpl = getTemplate(spreads[i].templateId);
    if (!tpl) continue;
    // Hi-res text-free plate from the imported layout pack, if available.
    let hiresBg: string | null = null;
    if (layoutFolder) {
      const name = tpl.id.split("/").pop()!;
      hiresBg = await readLayoutBg(layoutFolder, name).catch(() => null);
    }
    pages.push(
      await renderSpread(
        spreads[i],
        tpl,
        images,
        bgColor,
        opts.dpi,
        opts.quality,
        hiresBg,
        opts.pageCm,
        (opts.bleedMm ?? 0) / 10,
        opts.cropMarks ?? false,
        opts.borderMm ?? 0,
        opts.borderColor ?? "#ffffff"
      )
    );
  }
  onProgress(spreads.length, spreads.length);

  const files: ExportFile[] = [];
  if (opts.format === "jpg" || opts.format === "both") {
    if (opts.pageMode === "page") {
      // JPG per page: landscape spreads split into left/right halves (§12.2).
      let pageNo = 0;
      for (const p of pages) {
        const parts = p.w > p.h ? await splitPages(p.dataUrl, opts.quality) : [p.dataUrl];
        for (const part of parts) {
          pageNo += 1;
          files.push({
            name: `${opts.prefix}Page_${String(pageNo).padStart(3, "0")}.jpg`,
            b64: stripDataUri(part),
          });
        }
      }
    } else {
      pages.forEach((p, i) =>
        files.push({ name: `${opts.prefix}${pad(i + 1)}.jpg`, b64: stripDataUri(p.dataUrl) })
      );
    }
  }
  if (opts.format === "pdf" || opts.format === "both") {
    const doc = await PDFDocument.create();
    for (const p of pages) {
      const jpg = await doc.embedJpg(b64ToBytes(stripDataUri(p.dataUrl)));
      const wpt = (p.w / opts.dpi) * 72;
      const hpt = (p.h / opts.dpi) * 72;
      const page = doc.addPage([wpt, hpt]);
      page.drawImage(jpg, { x: 0, y: 0, width: wpt, height: hpt });
    }
    files.push({ name: `${opts.prefix}album.pdf`, b64: bytesToB64(await doc.save()) });
  }

  const d = new Date();
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dir = `${opts.folder}/Export_${stamp}`;
  return writeExport(dir, files);
}
