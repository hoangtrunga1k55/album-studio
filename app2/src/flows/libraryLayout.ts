/** Load a pack layout (LayoutItem) into a real Template on demand and cache it,
 *  so it can be applied to the current spread. Mirrors LayoutStrip's loader —
 *  shared so the left Library browser and the bottom layout dock behave the
 *  same (parse JSON once, fill the bg plate, load the layout's fonts). */

import {
  libraryTemplate,
  registerLibraryTemplate,
  templateFromJson,
  type Template,
} from "../engine/templates";
import { readLayoutBgPath, readLayoutJson, type LayoutItem } from "../ipc/library";

/** "cover-25x35" / "layout-30x30" → "25x35" (album size the pack targets). */
function catSize(category: string): string | null {
  const m = /(\d{2,3})\s*[x×]\s*(\d{2,3})/i.exec(category);
  return m ? `${m[1]}x${m[2]}` : null;
}

/** Does this pack category belong to the cover spread? */
export const isCoverCat = (c: string) => /^(cover|bia|bìa)/i.test(c);

/** Parse + register a pack layout as a Template (cached). Returns undefined on
 *  a broken/missing JSON. */
export async function ensureLibraryTemplate(item: LayoutItem): Promise<Template | undefined> {
  const cached = libraryTemplate(item.id);
  // Startup eager-parse registers WITHOUT the bg plate — fill it in here.
  if (cached?.bg || (cached && !item.bgPath)) return cached;
  if (cached && item.bgPath) {
    const bg = (await readLayoutBgPath(item.bgPath).catch(() => null)) ?? undefined;
    return bg ? registerLibraryTemplate({ ...cached, bg }) : cached;
  }
  try {
    const raw = JSON.parse(await readLayoutJson(item.jsonPath));
    const bg = item.bgPath
      ? (await readLayoutBgPath(item.bgPath).catch(() => null)) ?? undefined
      : undefined;
    const tpl = registerLibraryTemplate(
      templateFromJson(
        item.id,
        item.name,
        raw,
        isCoverCat(item.category) ? "cover" : "spread",
        bg,
        catSize(item.category) ?? "*"
      )
    );
    return tpl;
  } catch {
    return undefined;
  }
}