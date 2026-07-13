import { loadTypoFolder, pickTypoFolder, saveTypoFolder } from "../ipc/typos";
import { loadSystemFonts } from "../engine/fontLibrary";
import { useTypos } from "../store/typos";
import { useFonts } from "../store/fonts";

/** Pick the typo-kho folder, load it, then re-resolve the fonts it references
 *  from the machine's installed fonts. Returns false when the user cancels. */
export async function importTypoLibrary(): Promise<boolean> {
  const path = await pickTypoFolder();
  if (!path) return false;
  const list = await loadTypoFolder(path);
  useTypos.getState().setTypos(list);
  saveTypoFolder(path);
  // typo fonts now count as "needed" — re-scan the machine to load them
  const r = await loadSystemFonts();
  useFonts.getState().addFonts(r.loaded);
  useFonts.getState().setIndex(r.entries);
  return true;
}