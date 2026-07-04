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