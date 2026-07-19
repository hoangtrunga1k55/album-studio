mod export;
mod fonts;
mod import;
mod layouts;
mod packsync;
mod project;
mod typos;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init());

    // macOS: ⌘+/⌘−/⌘0/⌘1 can be swallowed before they reach the webview
    // (input methods, WKWebView) — register them as NATIVE menu accelerators
    // so the OS delivers them reliably; the webview just receives an event.
    #[cfg(target_os = "macos")]
    let builder = builder
        .menu(|handle| {
            use tauri::menu::{Menu, MenuItem, Submenu};
            let menu = Menu::default(handle)?;
            let view = Submenu::with_items(
                handle,
                "Xem",
                true,
                &[
                    &MenuItem::with_id(handle, "zoom_in", "Phóng to", true, Some("CmdOrCtrl+="))?,
                    &MenuItem::with_id(handle, "zoom_out", "Thu nhỏ", true, Some("CmdOrCtrl+-"))?,
                    &MenuItem::with_id(handle, "zoom_fit", "Vừa khung nhìn", true, Some("CmdOrCtrl+0"))?,
                    &MenuItem::with_id(handle, "zoom_100", "Kích thước in thật (100%)", true, Some("CmdOrCtrl+1"))?,
                ],
            )?;
            menu.append(&view)?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            use tauri::Emitter;
            let id = event.id().as_ref();
            if id.starts_with("zoom_") {
                let _ = app.emit("zoom-cmd", id.to_string());
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
            packsync::local_pack_version
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}