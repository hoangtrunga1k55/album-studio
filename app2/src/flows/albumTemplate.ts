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
    alert("Chưa có spread nào để lưu làm mẫu.");
    return false;
  }
  const dest = await save({
    title: "Lưu mẫu album",
    defaultPath: `mau-album.${EXT}`,
    filters: [{ name: "Mẫu Album", extensions: [EXT] }],
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
    alert("Lưu mẫu album lỗi: " + String(err));
    return false;
  }
}

/** Create a NEW album from a saved template: pick the template, pick where the
 *  new .album lives, then rebuild every spread with empty slots ready to fill. */
export async function newFromAlbumTemplate(): Promise<boolean> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [{ name: "Mẫu Album", extensions: [EXT] }],
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
    alert("Không đọc được mẫu album: " + String(err));
    return false;
  }
  if (tpl.kind !== KIND || !Array.isArray(tpl.spreads)) {
    alert("File không phải mẫu album hợp lệ.");
    return false;
  }

  let path = await save({
    title: "Album mới từ mẫu — lưu ở đâu",
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