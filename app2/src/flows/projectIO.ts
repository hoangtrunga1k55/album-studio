/** Project lifecycle — SmartAlbums-style: the .album file is created on disk the
 *  moment the album is created, then kept up to date by autosave. */

import { save, open } from "@tauri-apps/plugin-dialog";
import { saveProjectFile, openProjectFile } from "../ipc/project";
import { importFiles } from "../ipc/import";
import { useAlbum } from "../store/album";
import { useProject, rememberRecent } from "../store/project";
import type { AlbumSize } from "../engine/templates";

function projectJson(): string {
  const st = useAlbum.getState();
  return JSON.stringify({
    version: 1,
    size: st.size,
    bgColor: st.bgColor,
    density: st.density,
    currentIndex: st.currentIndex,
    imagePaths: st.images.map((i) => i.path),
    spreads: st.spreads,
    photoMeta: st.photoMeta,
  });
}

/** Write the current album into the open project file (no-op without one). */
export async function saveNow(): Promise<void> {
  const { path, name, setSaveState } = useProject.getState();
  if (!path) return;
  setSaveState("saving");
  try {
    await saveProjectFile(path, projectJson());
    setSaveState("saved");
    void name;
  } catch {
    setSaveState("error");
  }
}

/** New Album wizard finish: pick where to store the file, write it, open editor. */
export async function createProject(name: string, size: AlbumSize): Promise<boolean> {
  const safe = name.trim() || "album";
  let path = await save({
    defaultPath: `${safe}.album`,
    filters: [{ name: "Album Studio", extensions: ["album"] }],
  });
  if (!path) return false;
  if (!path.endsWith(".album")) path += ".album";

  useAlbum.getState().createAlbum(size);
  useProject.getState().openProject(path, safe);
  await saveNow();
  rememberRecent({ path, name: safe, size });
  return true;
}

/** Open an existing .album (from a path or via a file picker). */
export async function openProject(fromPath?: string): Promise<boolean> {
  let path = fromPath;
  if (!path) {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Album Studio", extensions: ["album"] }],
    });
    if (typeof picked !== "string") return false;
    path = picked;
  }

  const proj = JSON.parse(await openProjectFile(path));
  useAlbum.getState().applyProject({
    size: proj.size,
    bgColor: proj.bgColor,
    density: proj.density,
    currentIndex: proj.currentIndex,
    spreads: proj.spreads,
    photoMeta: proj.photoMeta,
  });

  const name = path.split("/").pop()!.replace(/\.album$/, "");
  useProject.getState().openProject(path, name);
  rememberRecent({ path, name, size: proj.size });

  if (Array.isArray(proj.imagePaths) && proj.imagePaths.length) {
    await importFiles(proj.imagePaths, (e) => {
      if (e.kind === "image") {
        const { kind, ...meta } = e;
        void kind;
        useAlbum.getState().addImages([meta]);
      }
    });
  }
  return true;
}

/** Debounced autosave: call once at app start; saves 1.5s after any change. */
export function startAutosave(): () => void {
  let timer: number | undefined;
  const unsub = useAlbum.subscribe(() => {
    const { path, setSaveState } = useProject.getState();
    if (!path) return;
    setSaveState("dirty");
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 1500);
  });
  return () => {
    unsub();
    window.clearTimeout(timer);
  };
}
