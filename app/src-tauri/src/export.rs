//! Export (§4.6) — write rendered spread files (JPG/PDF) to disk.

use std::fs;
use std::path::Path;

use base64::{engine::general_purpose, Engine};
use serde::Deserialize;

#[derive(Deserialize)]
pub struct ExportFile {
    name: String,
    /// raw base64 (no data: prefix)
    b64: String,
}

/// Create `dir` (and parents) and write each file. Returns the directory path.
#[tauri::command]
pub async fn write_export(dir: String, files: Vec<ExportFile>) -> Result<String, String> {
    let p = Path::new(&dir);
    fs::create_dir_all(p).map_err(|e| format!("Tạo thư mục lỗi: {e}"))?;
    for f in files {
        let bytes = general_purpose::STANDARD
            .decode(f.b64.trim())
            .map_err(|e| format!("{}: {e}", f.name))?;
        fs::write(p.join(&f.name), bytes).map_err(|e| format!("{}: {e}", f.name))?;
    }
    Ok(dir)
}
