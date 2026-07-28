//! Element / sticker library (F3) — a user-imported folder of decorative
//! PNG/SVG assets. Sub-folders are categories (ribbon, seal, floral…); a flat
//! folder of images works too (it lands under the folder's own name). Only
//! metadata + paths are indexed here — the pixels are read on demand
//! (`read_element_image`) so scanning a big folder stays cheap.

use std::path::Path;

use base64::{engine::general_purpose, Engine};
use serde::Serialize;

/// One library element — metadata + disk path (image read only when placed).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ElementItem {
    /// stable id: "<category>/<file stem>"
    pub id: String,
    /// sub-folder name: ribbon, seal, floral…
    pub category: String,
    /// display name (file stem)
    pub name: String,
    #[serde(rename = "ratioWH")]
    pub ratio_wh: f64,
    pub path: String,
}

fn is_image(p: &Path) -> bool {
    matches!(
        p.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()).as_deref(),
        Some("png" | "webp" | "gif" | "svg")
    )
}

/// Index an element library: every image under `root` and its direct
/// sub-folders. Sub-folder name = category; images in the root itself land
/// under the folder's own name.
#[tauri::command]
pub async fn scan_element_folder(root: String) -> Result<Vec<ElementItem>, String> {
    let base = Path::new(&root);
    if !base.is_dir() {
        return Err(format!("Không phải thư mục: {root}"));
    }
    let root_name = base
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "element".into());

    let mut dirs: Vec<(String, std::path::PathBuf)> = vec![(root_name, base.to_path_buf())];
    for e in std::fs::read_dir(base).map_err(|e| e.to_string())?.flatten() {
        if e.path().is_dir() {
            dirs.push((e.file_name().to_string_lossy().to_string(), e.path()));
        }
    }

    let mut out = Vec::new();
    for (category, dir) in dirs {
        let entries = match std::fs::read_dir(&dir) {
            Ok(r) => r,
            Err(_) => continue,
        };
        for f in entries.flatten() {
            let p = f.path();
            if !p.is_file() || !is_image(&p) {
                continue;
            }
            let stem = p.file_stem().map(|s| s.to_string_lossy().to_string()).unwrap_or_default();
            if stem.is_empty() {
                continue;
            }
            // SVG has no raster dimensions; default square. Raster: read header only.
            let ratio_wh = match image::image_dimensions(&p) {
                Ok((w, h)) if h > 0 => w as f64 / h as f64,
                _ => 1.0,
            };
            out.push(ElementItem {
                id: format!("{category}/{stem}"),
                category: category.clone(),
                name: stem,
                ratio_wh,
                path: p.to_string_lossy().to_string(),
            });
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// Read an element image as a data URI (alpha preserved — PNG/SVG kept as-is).
/// Called the first time an element is placed on a spread.
#[tauri::command]
pub async fn read_element_image(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    let bytes = std::fs::read(p).map_err(|e| e.to_string())?;
    let mime = match p.extension().and_then(|e| e.to_str()).map(|s| s.to_ascii_lowercase()).as_deref()
    {
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("gif") => "image/gif",
        _ => "image/png",
    };
    Ok(format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(&bytes)))
}