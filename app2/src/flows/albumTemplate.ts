/** F5 — Album Template: save the WHOLE album structure (every spread's layout,
 *  text, typo, element, background) WITHOUT the client's photos, then rebuild a
 *  fresh empty-slot album from it for the next client. File: `.albumtemplate`
 *  (plain JSON, reuses the project read/write IPC). */

import { save, open } from "@tauri-apps/plugin-dialog";
import { saveProjectFile, openProjectFile } from "../ipc/project";
import { useAlbum, type AlbumSettings, type Spread } from "../store/album";
import { useProject, rememberRecent } from "../store/project";
import { clearHistory } from "../store/history";
import { saveNow } from "./projectIO";

const KIND = "album-template";
const EXT = "albumtemplate";

/** Strip every photo reference from a spread — keep the design (frames, text,
 *  typo, element, z-order, background color) so slots come back empty. */
function stripPhotos(sp: Spread): Spread {
  return { ...sp, imageIds: [], transforms: {}, bgImageId: null };
}

/** Save the current album as a reusable, photoless template. */
export async function saveAlbumTemplate(): Promise<boolean> {
  const st = useAlbum.getState();
  if (!st.spreads.length) {
    alert("No spreads to save as a template.");
    return false;
  }
  const dest = await save({
    title: "Save album template",
    defaultPath: `mau-album.${EXT}`,
    filters: [{ name: "Album Template", extensions: [EXT] }],
  });
  if (typeof dest !== "string" || !dest) return false;
  const content = JSON.stringify({
    version: 1,
    kind: KIND,
    size: st.size,
    bgColor: st.bgColor,
    settings: st.settings,
    spreads: st.spreads.map(stripPhotos),
  });
  try {
    await saveProjectFile(dest, content);
    return true;
  } catch (err) {
    alert("Save album template error: " + String(err));
    return false;
  }
}

/** Create a NEW album from a saved template: pick the template, pick where the
 *  new .album lives, then rebuild every spread with empty slots ready to fill. */
export async function newFromAlbumTemplate(): Promise<boolean> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Album Template", extensions: [EXT] }],
  });
  if (typeof picked !== "string") return false;

  let tpl: {
    kind?: string;
    size: string;
    bgColor?: string;
    settings?: Partial<AlbumSettings>;
    spreads: Spread[];
  };
  try {
    tpl = JSON.parse(await openProjectFile(picked));
  } catch (err) {
    alert("Couldn't read the album template: " + String(err));
    return false;
  }
  if (tpl.kind !== KIND || !Array.isArray(tpl.spreads)) {
    alert("This file is not a valid album template.");
    return false;
  }

  let path = await save({
    title: "New album from template — where to save",
    defaultPath: "album-tu-mau.album",
    filters: [{ name: "Album Studio", extensions: ["album"] }],
  });
  if (typeof path !== "string" || !path) return false;
  if (!path.endsWith(".album")) path += ".album";

  useAlbum.getState().applyProject({
    size: tpl.size,
    bgColor: tpl.bgColor ?? "#ffffff",
    density: "can",
    currentIndex: 0,
    spreads: tpl.spreads.map(stripPhotos), // guard: never carry photos in
    photoMeta: {},
    settings: tpl.settings,
  });

  const name = path.split(/[/\\]/).pop()!.replace(/\.album$/i, "");
  useProject.getState().openProject(path, name);
  clearHistory();
  await saveNow();
  rememberRecent({ path, name, size: tpl.size });
  return true;
}