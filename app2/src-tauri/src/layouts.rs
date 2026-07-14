//! Layout library — a user-imported folder of layout packs.
//!
//! Layout: `<root>/<category>/<id>.json` (+ `<id>.thumb.jpg` preview and an
//! optional `<id>.bg.jpg` hi-res plate for print). The CATEGORY is simply the
//! sub-folder name (e.g. `cover-25x35`, `layout-30x30`) — thumbnails are
//! served straight from disk over the asset protocol (lazy, no base64), and
//! the real JSON is only parsed when the user picks a layout.

use std::path::{Path, PathBuf};

use base64::{engine::general_purpose, Engine};
use serde::Serialize;
use walkdir::WalkDir;

/// One layout in the library — metadata + file paths only (thumbnail is
/// loaded by the webview via the asset protocol; JSON on demand).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct LibraryItem {
    /// stable id: "<category>/<file stem>"
    pub id: String,
    /// sub-folder name — the category shown in the picker
    pub category: String,
    pub name: String,
    pub json_path: String,
    /// small preview image (may be absent → picker falls back to frame boxes)
    pub thumb_path: Option<String>,
    /// hi-res, text-free plate for print export (optional)
    pub bg_path: Option<String>,
}

fn first_existing(base: &Path, stem: &str, exts: &[&str]) -> Option<String> {
    for e in exts {
        let p = base.join(format!("{stem}{e}"));
        if p.is_file() {
            return Some(p.to_string_lossy().to_string());
        }
    }
    None
}

/// Index a layout library: every `<category>/<id>.json` under `root`.
/// Files sitting directly in `root` land in the category "khac".
#[tauri::command]
pub async fn scan_layout_library(root: String) -> Result<Vec<LibraryItem>, String> {
    let base = PathBuf::from(&root);
    if !base.is_dir() {
        return Err(format!("Không phải thư mục: {root}"));
    }
    let mut out = Vec::new();
    for entry in WalkDir::new(&base)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("json") {
            continue;
        }
        let stem = match path.file_stem().and_then(|s| s.to_str()) {
            Some(s) => s,
            None => continue,
        };
        // the pack's own manifest files are not layouts
        if stem.eq_ignore_ascii_case("index") || stem.eq_ignore_ascii_case("manifest") {
            continue;
        }
        let dir = path.parent().unwrap_or(&base);
        // category = sub-folder name; files sitting in the root take the
        // imported folder's OWN name (never a made-up "khac")
        let root_name = base
            .file_name()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "layout".into());
        let category = if dir == base {
            root_name.clone()
        } else {
            dir.strip_prefix(&base)
                .ok()
                .map(|p| p.to_string_lossy().replace('\\', "/"))
                .unwrap_or(root_name)
        };
        out.push(LibraryItem {
            id: format!("{category}/{stem}"),
            category,
            name: stem.to_string(),
            json_path: path.to_string_lossy().to_string(),
            thumb_path: first_existing(dir, stem, &[".thumb.jpg", ".thumb.png", ".preview.jpg", ".bg.jpg"]),
            bg_path: first_existing(dir, stem, &[".bg.jpg"]),
        });
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// Read one layout JSON (only when the user actually picks it).
#[tauri::command]
pub async fn read_layout_json(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Đọc layout lỗi: {e}"))
}

/// Read a hi-res plate by absolute path (print export).
#[tauri::command]
pub async fn read_layout_bg_path(path: String) -> Result<Option<String>, String> {
    match std::fs::read(&path) {
        Ok(bytes) => Ok(Some(format!(
            "data:image/jpeg;base64,{}",
            general_purpose::STANDARD.encode(&bytes)
        ))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Đọc nền hi-res lỗi: {e}")),
    }
}

/// Read `<folder>/<name>.bg.jpg` and return it as a JPEG data URI, or `None`
/// if the pack has no hi-res background for that template (caller falls back
/// to the bundled preview).
#[tauri::command]
pub async fn read_layout_bg(folder: String, name: String) -> Result<Option<String>, String> {
    let path = Path::new(&folder).join(format!("{name}.bg.jpg"));
    match std::fs::read(&path) {
        Ok(bytes) => Ok(Some(format!(
            "data:image/jpeg;base64,{}",
            general_purpose::STANDARD.encode(&bytes)
        ))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(format!("Đọc nền hi-res lỗi: {e}")),
    }
}

/// Count `*.bg.jpg` entries in a layout-pack folder (for import status).
#[tauri::command]
pub async fn scan_layout_pack(folder: String) -> Result<usize, String> {
    let dir = std::fs::read_dir(&folder).map_err(|e| format!("Không mở được thư mục: {e}"))?;
    let mut n = 0;
    for entry in dir.flatten() {
        if entry
            .file_name()
            .to_string_lossy()
            .to_ascii_lowercase()
            .ends_with(".bg.jpg")
        {
            n += 1;
        }
    }
    Ok(n)
}