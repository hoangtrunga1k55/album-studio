/** Project lifecycle — SmartAlbums-style: the .album file is created on disk the
 *  moment the album is created, then kept up to date by autosave. */

import { save, open } from "@tauri-apps/plugin-dialog";
import { saveProjectFile, openProjectFile } from "../ipc/project";
import { importFiles } from "../ipc/import";
import { useAlbum, type AlbumSettings } from "../store/album";
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
    settings: st.settings,
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
export async function createProject(
  name: string,
  size: AlbumSize,
  spreadCount = 1,
  opts?: { settings?: AlbumSettings; bgColor?: string }
): Promise<boolean> {
  const safe = name.trim() || "album";
  let path = await save({
    defaultPath: `${safe}.album`,
    filters: [{ name: "Album Studio", extensions: ["album"] }],
  });
  if (!path) return false;
  if (!path.endsWith(".album")) path += ".album";

  useAlbum.getState().createAlbum(size, spreadCount, opts);
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
      filters: [
        {
          name: "Album Studio",
          // .album + rotating backups (§3.2) so users can restore a snapshot
          extensions: ["album", "backup-1", "backup-2", "backup-3", "backup-4", "backup-5"],
        },
      ],
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
    settings: proj.settings,
  });

  // Opening a backup RESTORES it: content from the snapshot, but the session
  // (and autosave) targets the original .album file.
  const mainPath = path.replace(/\.backup-\d+$/, "");
  const name = mainPath.split("/").pop()!.replace(/\.album$/, "");
  useProject.getState().openProject(mainPath, name);
  rememberRecent({ path: mainPath, name, size: proj.size });

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

/* §3.2 — rotating safety backups: every 5 minutes a snapshot is written next
 * to the project (NAME.album.backup-1..5, round-robin, newest wins). */
const BACKUP_EVERY_MS = 5 * 60 * 1000;
const BACKUP_KEEP = 5;

async function writeBackup(): Promise<void> {
  const { path } = useProject.getState();
  if (!path || !useAlbum.getState().size) return;
  const key = `albumstudio2.backupIdx:${path}`;
  let idx = 0;
  try {
    idx = (parseInt(localStorage.getItem(key) ?? "0", 10) || 0) % BACKUP_KEEP;
  } catch {
    /* ignore */
  }
  try {
    await saveProjectFile(`${path}.backup-${idx + 1}`, projectJson());
    localStorage.setItem(key, String((idx + 1) % BACKUP_KEEP));
  } catch {
    /* backups must never interrupt the user */
  }
}

/** Open a rotating backup file (picked manually via Mở album → chọn .backup-N). */

/** Debounced autosave + 5-minute rotating backups. Call once at app start. */
export function startAutosave(): () => void {
  let timer: number | undefined;
  const unsub = useAlbum.subscribe(() => {
    const { path, setSaveState } = useProject.getState();
    if (!path) return;
    setSaveState("dirty");
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void saveNow(), 1500);
  });
  const backupTimer = window.setInterval(() => void writeBackup(), BACKUP_EVERY_MS);
  return () => {
    unsub();
    window.clearTimeout(timer);
    window.clearInterval(backupTimer);
  };
}
