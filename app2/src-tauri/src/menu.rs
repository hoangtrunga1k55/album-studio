//! Native application menu (SmartAlbums-style) — SAME on macOS and Windows:
//! Tệp (New / Open / Mở gần đây / Save / Save As) + Xem (zoom). macOS also
//! gets the app menu and an Edit menu (the webview needs native clipboard
//! items for ⌘C/⌘V to work in inputs). The "Mở gần đây" submenu is rebuilt
//! from the frontend via `update_recent_menu` (recents live in localStorage).

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Runtime};

pub fn build_menu<R: Runtime>(
    handle: &AppHandle<R>,
    recents: &[(String, String)],
) -> tauri::Result<Menu<R>> {
    // --- Tệp > Mở gần đây ---
    let recent = Submenu::with_id(handle, "recent_menu", "Mở gần đây", true)?;
    if recents.is_empty() {
        recent.append(&MenuItem::with_id(handle, "recent_none", "(Trống)", false, None::<&str>)?)?;
    } else {
        for (path, name) in recents {
            recent.append(&MenuItem::with_id(
                handle,
                format!("recent:{path}"),
                name,
                true,
                None::<&str>,
            )?)?;
        }
    }

    let file = Submenu::with_items(
        handle,
        "Tệp",
        true,
        &[
            &MenuItem::with_id(handle, "file_new", "Dự án mới…", true, Some("CmdOrCtrl+N"))?,
            &MenuItem::with_id(handle, "file_open", "Mở dự án…", true, Some("CmdOrCtrl+O"))?,
            &recent,
            &PredefinedMenuItem::separator(handle)?,
            &MenuItem::with_id(handle, "file_save", "Lưu", true, Some("CmdOrCtrl+S"))?,
            &MenuItem::with_id(
                handle,
                "file_save_as",
                "Lưu thành bản sao…",
                true,
                Some("CmdOrCtrl+Shift+S"),
            )?,
        ],
    )?;

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

    let menu = Menu::new(handle)?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = Submenu::with_items(
            handle,
            "Album Studio 2",
            true,
            &[
                &PredefinedMenuItem::about(handle, None, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::hide(handle, None)?,
                &PredefinedMenuItem::hide_others(handle, None)?,
                &PredefinedMenuItem::show_all(handle, None)?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::quit(handle, Some("Thoát Album Studio 2"))?,
            ],
        )?;
        menu.append(&app_menu)?;
    }

    menu.append(&file)?;

    // macOS: without native Edit items, ⌘C/⌘V/⌘Z stop working inside inputs.
    #[cfg(target_os = "macos")]
    {
        let edit = Submenu::with_items(
            handle,
            "Sửa",
            true,
            &[
                // custom: ⌘Z phải tới được app (undo thiết kế) — item undo
                // mặc định chỉ gửi cho ô chữ và nuốt mất phím
                &MenuItem::with_id(handle, "app_undo", "Hoàn tác", true, Some("CmdOrCtrl+Z"))?,
                &MenuItem::with_id(handle, "app_redo", "Làm lại", true, Some("CmdOrCtrl+Shift+Z"))?,
                &PredefinedMenuItem::separator(handle)?,
                &PredefinedMenuItem::cut(handle, None)?,
                &PredefinedMenuItem::copy(handle, None)?,
                &PredefinedMenuItem::paste(handle, None)?,
                &PredefinedMenuItem::select_all(handle, None)?,
            ],
        )?;
        menu.append(&edit)?;
    }

    menu.append(&view)?;
    Ok(menu)
}

/// Frontend pushes its recents (localStorage) → rebuild the whole menu.
#[tauri::command]
pub fn update_recent_menu(app: AppHandle, recents: Vec<(String, String)>) -> Result<(), String> {
    let menu = build_menu(&app, &recents).map_err(|e| e.to_string())?;
    app.set_menu(menu).map_err(|e| e.to_string())?;
    Ok(())
}