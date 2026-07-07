import { invoke } from "@tauri-apps/api/core";

export function saveProjectFile(path: string, content: string): Promise<void> {
  return invoke("save_project", { path, content });
}

export function openProjectFile(path: string): Promise<string> {
  return invoke<string>("open_project", { path });
}