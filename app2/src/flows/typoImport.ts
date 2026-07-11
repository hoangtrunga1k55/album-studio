import { loadTypoFolder, pickTypoFolder, saveTypoFolder } from "../ipc/typos";
import { loadTemplateFontsFromFolder, savedFontFolder } from "../engine/fontLibrary";
import { useTypos } from "../store/typos";
import { useFonts } from "../store/fonts";

/** Pick the typo-kho folder, load it and resolve the fonts it references.
 *  Returns false when the user cancels the picker. */
export async function importTypoLibrary(): Promise<boolean> {
  const path = await pickTypoFolder();
  if (!path) return false;
  const list = await loadTypoFolder(path);
  useTypos.getState().setTypos(list);
  saveTypoFolder(path);
  const folder = savedFontFolder();
  if (folder) {
    const r = await loadTemplateFontsFromFolder(folder);
    useFonts.getState().addFonts(r.loaded);
    useFonts.getState().setIndex(r.entries);
  }
  return true;
}