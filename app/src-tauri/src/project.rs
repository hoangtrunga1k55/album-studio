//! Save / open the album project file (.album) — a light JSON document.

#[tauri::command]
pub async fn save_project(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Lưu lỗi: {e}"))
}

#[tauri::command]
pub async fn open_project(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Mở lỗi: {e}"))
}