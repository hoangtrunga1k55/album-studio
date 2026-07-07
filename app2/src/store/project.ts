import { create } from "zustand";
import type { AlbumSize } from "../engine/templates";

/** A project the user opened/created before — shown on the Welcome screen. */
export interface RecentProject {
  path: string;
  name: string;
  size: AlbumSize;
  openedAt: number; // epoch ms
}

const RECENTS_KEY = "albumstudio2.recents";
const RECENTS_MAX = 12;

export function loadRecents(): RecentProject[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const list = raw ? (JSON.parse(raw) as RecentProject[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function rememberRecent(entry: Omit<RecentProject, "openedAt">) {
  try {
    const rest = loadRecents().filter((r) => r.path !== entry.path);
    const next = [{ ...entry, openedAt: Date.now() }, ...rest].slice(0, RECENTS_MAX);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}

export function forgetRecent(path: string) {
  try {
    localStorage.setItem(RECENTS_KEY, JSON.stringify(loadRecents().filter((r) => r.path !== path)));
  } catch {
    /* ignore */
  }
}

type SaveState = "saved" | "saving" | "dirty" | "error";

interface ProjectState {
  /** Absolute path of the .album file this session writes to (null = no project open). */
  path: string | null;
  name: string;
  saveState: SaveState;
  openProject: (path: string, name: string) => void;
  closeProject: () => void;
  setSaveState: (s: SaveState) => void;
}

export const useProject = create<ProjectState>((set) => ({
  path: null,
  name: "",
  saveState: "saved",
  openProject: (path, name) => set({ path, name, saveState: "saved" }),
  closeProject: () => set({ path: null, name: "", saveState: "saved" }),
  setSaveState: (saveState) => set({ saveState }),
}));
