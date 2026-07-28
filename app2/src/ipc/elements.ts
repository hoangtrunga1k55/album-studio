import { invoke } from "@tauri-apps/api/core";
import { pickFolder } from "./library";

/** One element/sticker in the library (metadata + disk path). */
export interface ElementItem {
  id: string;
  category: string;
  name: string;
  ratioWH: number;
  path: string;
}

const KEY = "albumstudio2.elementFolder";
export const savedElementFolder = (): string | null => localStorage.getItem(KEY);
export const saveElementFolder = (p: string) => localStorage.setItem(KEY, p);

/** Index a folder of PNG/SVG elements (sub-folders = categories). */
export function scanElementFolder(root: string): Promise<ElementItem[]> {
  return invoke("scan_element_folder", { root });
}

const cache = new Map<string, Promise<string>>();
/** Read an element image as a data URI (alpha preserved), cached per path. */
export function readElementImage(path: string): Promise<string> {
  let p = cache.get(path);
  if (!p) {
    p = invoke<string>("read_element_image", { path });
    cache.set(path, p);
  }
  return p;
}

/** Folder picker (reuses the shared dialog). */
export const pickElementFolder = (): Promise<string | null> => pickFolder();
