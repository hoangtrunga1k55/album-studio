//! Typo library — load a user-imported folder of pre-processed typo assets
//! (typos.json manifest + <id>.preview.png / <id>.deco.png).

use std::path::Path;

use base64::{engine::general_purpose, Engine};
use serde::Serialize;
use serde_json::Value;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TypoOut {
    id: String,
    #[serde(rename = "ratioWH")]
    ratio_wh: f64,
    texts: Value,
    preview: String,      // data URI (png)
    deco: Option<String>, // data URI (png) or null
}

fn png_data_uri(p: &Path) -> Option<String> {
    let bytes = std::fs::read(p).ok()?;
    Some(format!("data:image/png;base64,{}", general_purpose::STANDARD.encode(&bytes)))
}

#[tauri::command]
pub async fn load_typo_folder(path: String) -> Result<Vec<TypoOut>, String> {
    let root = Path::new(&path);
    let manifest = root.join("typos.json");
    let txt = std::fs::read_to_string(&manifest)
        .map_err(|e| format!("Không thấy typos.json trong thư mục: {e}"))?;
    let items: Vec<Value> = serde_json::from_str(&txt).map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    for it in items {
        let id = it.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }
        let ratio_wh = it.get("ratioWH").and_then(|v| v.as_f64()).unwrap_or(1.0);
        let texts = it.get("texts").cloned().unwrap_or(Value::Array(vec![]));
        let has_deco = it.get("deco").and_then(|v| v.as_bool()).unwrap_or(false);

        let preview = match png_data_uri(&root.join(format!("{id}.preview.png"))) {
            Some(p) => p,
            None => continue,
        };
        let deco = if has_deco {
            png_data_uri(&root.join(format!("{id}.deco.png")))
        } else {
            None
        };
        out.push(TypoOut { id, ratio_wh, texts, preview, deco });
    }
    Ok(out)
}

/// One typo in the library — metadata + file paths (preview served over the
/// asset protocol, deco read only when the typo is placed on a spread).
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TypoItem {
    /// stable id: "<category>/<typo id>"
    pub id: String,
    /// sub-folder name: vn, korea, fashion…
    pub category: String,
    pub raw_id: String,
    #[serde(rename = "ratioWH")]
    pub ratio_wh: f64,
    pub texts: Value,
    pub preview_path: String,
    pub deco_path: Option<String>,
}

/// Index a typo library: every `<category>/typos.json` under `root` (a flat
/// folder without categories still works — it lands in "khac").
#[tauri::command]
pub async fn scan_typo_library(root: String) -> Result<Vec<TypoItem>, String> {
    let base = Path::new(&root);
    if !base.is_dir() {
        return Err(format!("Không phải thư mục: {root}"));
    }

    // folders to inspect: the root itself + every direct sub-folder.
    // A manifest sitting in the root takes the imported folder's OWN name.
    let root_name = base
        .file_name()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "typo".into());
    let mut dirs: Vec<(String, std::path::PathBuf)> = vec![(root_name, base.to_path_buf())];
    for e in std::fs::read_dir(base).map_err(|e| e.to_string())?.flatten() {
        if e.path().is_dir() {
            let name = e.file_name().to_string_lossy().to_string();
            dirs.push((name, e.path()));
        }
    }

    let mut out = Vec::new();
    for (category, dir) in dirs {
        let manifest = dir.join("typos.json");
        let txt = match std::fs::read_to_string(&manifest) {
            Ok(t) => t,
            Err(_) => continue, // folder without a manifest — skip
        };
        let items: Vec<Value> = match serde_json::from_str(&txt) {
            Ok(v) => v,
            Err(_) => continue,
        };
        for it in items {
            let raw_id = it.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
            if raw_id.is_empty() {
                continue;
            }
            let preview = dir.join(format!("{raw_id}.preview.png"));
            if !preview.is_file() {
                continue;
            }
            let has_deco = it.get("deco").and_then(|v| v.as_bool()).unwrap_or(false);
            let deco = dir.join(format!("{raw_id}.deco.png"));
            out.push(TypoItem {
                id: format!("{category}/{raw_id}"),
                category: category.clone(),
                raw_id,
                ratio_wh: it.get("ratioWH").and_then(|v| v.as_f64()).unwrap_or(1.0),
                texts: it.get("texts").cloned().unwrap_or(Value::Array(vec![])),
                preview_path: preview.to_string_lossy().to_string(),
                deco_path: if has_deco && deco.is_file() {
                    Some(deco.to_string_lossy().to_string())
                } else {
                    None
                },
            });
        }
    }
    out.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(out)
}

/// Read a typo's decoration PNG as a data URI (only when it is placed).
#[tauri::command]
pub async fn read_typo_deco(path: String) -> Result<Option<String>, String> {
    Ok(png_data_uri(Path::new(&path)))
}