import { renderSpread, type RenderResult } from "./renderSpread";
import { BLANK_TEMPLATE, getTemplate, type Template } from "./templates";
import { pagesOf, type Spread } from "../store/album";
import type { ImageMeta } from "../ipc/import";
import { readLayoutBgPath } from "../ipc/library";
import { readLayoutBg, savedLayoutFolder } from "../ipc/layouts";
import { getDisplayImage } from "../ipc/import";
import { useLibrary } from "../store/library";

/** Locate the hi-res, text-free background plate for a template: the imported
 *  library item's own bg first, then the legacy hi-res folder (older packs).
 *  Shared by export (print) and the 3D preview (screen). */
export async function resolveHiresBg(tpl: Template): Promise<string | null> {
  const libItem = useLibrary.getState().layouts.find((l) => l.id === tpl.id);
  if (libItem?.bgPath) {
    const bg = await readLayoutBgPath(libItem.bgPath).catch(() => null);
    if (bg) return bg;
  }
  const layoutFolder = savedLayoutFolder();
  if (layoutFolder) {
    const name = tpl.id.split("/").pop()!;
    return readLayoutBg(layoutFolder, name).catch(() => null);
  }
  return null;
}

export interface PreviewOpts {
  images: ImageMeta[];
  bgColor: string;
  /** Album page size in cm (incl. custom "WxH"); null → template fallback. */
  pageCm: { w: number; h: number } | null;
  borderPt: number;
  borderColor: string;
  /** Target spread width in device pixels — DPI is derived to hit it. */
  targetW: number;
}

/** Render one spread to a screen-resolution JPEG (data URL) for on-screen
 *  preview (3D show). Reuses the print pipeline at a DPI sized to `targetW`. */
export async function renderSpreadImage(spread: Spread, opts: PreviewOpts): Promise<RenderResult> {
  const tpl = getTemplate(spread.templateId) ?? BLANK_TEMPLATE;
  const pages = pagesOf(spread, tpl.ratioWH);
  const spreadCmW = opts.pageCm ? opts.pageCm.w * pages : tpl.ratioWH >= 1 ? 50 : 35;
  const dpi = Math.max(72, Math.round((opts.targetW * 2.54) / spreadCmW));
  // No hi-res plate on the preview path: the baked preview bg (tpl.bg, already
  // in memory) is what the editor shows and is far cheaper than reading the
  // full-res plate off disk for every spread. Print/export keeps the hi-res path.
  return renderSpread(
    spread,
    tpl,
    opts.images,
    opts.bgColor,
    dpi,
    82,
    null,
    opts.pageCm,
    0,
    false,
    opts.borderPt,
    opts.borderColor,
    getDisplayImage // light, editor-cached pixels — far faster than print decode
  );
}