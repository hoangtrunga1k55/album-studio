/** "Edit in Photoshop" round-trip: open a photo in an external editor, then
 *  poll its modification time and refresh the image in the app whenever it is
 *  saved — so pixel edits show up on the canvas without a manual reimport. */

import { openInEditor, fileMtimeMs } from "../ipc/import";
import { useAlbum } from "../store/album";

const POLL_MS = 1500;
const WATCH_TIMEOUT_MS = 15 * 60 * 1000; // stop watching a file after 15 min idle

interface Watch {
  timer: ReturnType<typeof setInterval>;
  stopAt: ReturnType<typeof setTimeout>;
  lastMtime: number;
}

const watches = new Map<string, Watch>();

export function stopWatch(path: string): void {
  const w = watches.get(path);
  if (!w) return;
  clearInterval(w.timer);
  clearTimeout(w.stopAt);
  watches.delete(path);
}

/** Poll `path` for saves; each time mtime advances, refresh that image. */
function startWatch(path: string, baseMtime: number): void {
  stopWatch(path); // one watcher per path

  const timer = setInterval(() => {
    void fileMtimeMs(path)
      .then((m) => {
        const w = watches.get(path);
        if (!w) return;
        if (m > w.lastMtime + 1) {
          // rounding slack
          w.lastMtime = m;
          void useAlbum.getState().refreshImage(path);
        }
      })
      .catch(() => {
        /* file briefly locked mid-save — ignore, next tick retries */
      });
  }, POLL_MS);

  const stopAt = setTimeout(() => stopWatch(path), WATCH_TIMEOUT_MS);
  watches.set(path, { timer, stopAt, lastMtime: baseMtime });
}

/** Open the photo in Photoshop and start watching it for saves. */
export async function editInPhotoshop(path: string): Promise<void> {
  const base = await fileMtimeMs(path).catch(() => 0);
  await openInEditor(path); // throws with a user-facing message if it fails
  startWatch(path, base);
}
