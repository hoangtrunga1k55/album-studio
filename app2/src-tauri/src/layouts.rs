//! Hi-res layout pack — a user-imported folder of full-resolution, text-free
//! layout backgrounds (`<id>.bg.jpg`) used for print-quality export.

use std::path::Path;

use base64::{engine::general_purpose, Engine};

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