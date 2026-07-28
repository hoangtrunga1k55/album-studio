/** Element / sticker library (F3) — decorative PNG/SVG assets the user drops
 *  onto a spread. The user loads a FOLDER (sub-folders = categories); only
 *  metadata is indexed, the image bytes are read the first time an element is
 *  placed (see ensureElementImage). */

import { readElementImage, type ElementItem } from "../ipc/elements";
import { useElements } from "../store/elements";

export interface Element {
  id: string;
  category: string;
  name: string;
  /** width / height of the source image (1 for SVG). */
  ratioWH: number;
  /** disk path — bytes read lazily into `src`. */
  path: string;
  /** image data URI once loaded (alpha preserved). */
  src?: string;
}

export function elementFromItem(i: ElementItem): Element {
  return { id: i.id, category: i.category, name: i.name, ratioWH: i.ratioWH || 1, path: i.path };
}

export function getElement(id: string): Element | undefined {
  return useElements.getState().elements.find((e) => e.id === id);
}

/** Read an element's pixels once — no-op if already loaded. */
export async function ensureElementImage(id: string): Promise<void> {
  const e = getElement(id);
  if (!e || e.src || !e.path) return;
  const src = await readElementImage(e.path).catch(() => null);
  if (src) useElements.getState().setSrc(id, src);
}
