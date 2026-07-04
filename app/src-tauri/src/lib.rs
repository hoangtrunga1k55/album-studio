mod export;
mod fonts;
mod import;
mod project;
mod typos;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            import::import_folder,
            import::import_files,
            import::get_display_image,
            import::get_export_image,
            fonts::load_fonts,
            fonts::scan_font_folder,
            export::write_export,
            project::save_project,
            project::open_project,
            typos::load_typo_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}