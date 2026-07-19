mod export;
mod fonts;
mod import;
mod layouts;
mod menu;
mod packsync;
mod project;
mod typos;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    // Native menu bar on BOTH platforms (SmartAlbums-style File/View):
    // accelerators are handled by the OS so Vietnamese IMEs can't eat them;
    // the webview just receives "menu-cmd" / "zoom-cmd" events.
    let builder = builder
        .menu(|handle| menu::build_menu(handle, &[]))
        .on_menu_event(|app, event| {
            use tauri::Emitter;
            let id = event.id().as_ref();
            if id.starts_with("zoom_") {
                let _ = app.emit("zoom-cmd", id.to_string());
            } else if id.starts_with("file_") || id.starts_with("recent:") || id.starts_with("app_") {
                let _ = app.emit("menu-cmd", id.to_string());
            }
        });

    // Windows: same guarantee via RegisterHotKey — registered ONLY while the
    // window has focus (blur unregisters), so other apps keep their keys.
    // Vietnamese IMEs (UniKey/EVKey) can't eat these below the hotkey layer.
    #[cfg(target_os = "windows")]
    let builder = builder
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .on_window_event(|window, event| {
            use tauri::{Emitter, Manager};
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if let tauri::WindowEvent::Focused(focused) = event {
                let app = window.app_handle();
                let gs = app.global_shortcut();
                if *focused {
                    for (accel, id) in [
                        ("Ctrl+=", "zoom_in"),
                        ("Ctrl+-", "zoom_out"),
                        ("Ctrl+0", "zoom_fit"),
                        ("Ctrl+1", "zoom_100"),
                    ] {
                        let _ = gs.on_shortcut(accel, move |app, _s, ev| {
                            if ev.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                                let _ = app.emit("zoom-cmd", id.to_string());
                            }
                        });
                    }
                } else {
                    let _ = gs.unregister_all();
                }
            }
        });

    builder
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
            packsync::local_pack_version,
            menu::update_recent_menu
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}