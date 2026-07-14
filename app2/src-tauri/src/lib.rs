mod export;
mod fonts;
mod import;
mod layouts;
mod packsync;
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
            typos::load_typo_folder,
            typos::scan_typo_library,
            typos::read_typo_deco,
            layouts::read_layout_bg,
            layouts::scan_layout_pack,
            layouts::scan_layout_library,
            layouts::read_layout_json,
            layouts::read_layout_bg_path,
            packsync::sync_pack,
            packsync::local_pack_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}