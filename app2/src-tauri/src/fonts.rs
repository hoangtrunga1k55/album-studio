//! Font import (§4.4.1). Reads user-selected font files, extracts the family
//! name + checks Vietnamese diacritic coverage, returns a data URI the webview
//! registers via the FontFace API.

use std::path::Path;

use base64::{engine::general_purpose, Engine};
use rayon::prelude::*;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

/// Characters that must all have glyphs for a font to be "Vietnamese-ready".
const VN_TEST: &[char] = &['Á', 'À', 'Ã', 'Ả', 'Ạ', 'ơ', 'ư', 'ế', 'ố', 'ữ', 'ệ', 'đ'];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoadedFont {
    family: String,
    /// PostScript name (how PSD text layers reference the font, e.g. "Gilroy-Regular").
    postscript: String,
    data_uri: String,
    has_vietnamese: bool,
    file: String,
}

#[tauri::command]
pub async fn load_fonts(paths: Vec<String>) -> Result<Vec<LoadedFont>, String> {
    let mut out = Vec::new();
    for p in paths {
        let path = Path::new(&p);
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase();
        let bytes = std::fs::read(&p).map_err(|e| format!("{p}: {e}"))?;

        let stem = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let mut family = stem.clone();
        let mut postscript = stem;
        let mut has_vietnamese = false;

        if ext == "ttf" || ext == "otf" {
            if let Ok(face) = ttf_parser::Face::parse(&bytes, 0) {
                let name_of = |id: u16| {
                    face.names()
                        .into_iter()
                        .find(|n| n.name_id == id && n.is_unicode())
                        .and_then(|n| n.to_string())
                        .filter(|s| !s.is_empty())
                };
                if let Some(n) = name_of(ttf_parser::name_id::FAMILY) {
                    family = n;
                }
                if let Some(n) = name_of(ttf_parser::name_id::POST_SCRIPT_NAME) {
                    postscript = n;
                }
                has_vietnamese = VN_TEST.iter().all(|&c| face.glyph_index(c).is_some());
            }
        }

        let mime = match ext.as_str() {
            "otf" => "font/otf",
            "woff2" => "font/woff2",
            "woff" => "font/woff",
            _ => "font/ttf",
        };
        let data_uri = format!("data:{};base64,{}", mime, general_purpose::STANDARD.encode(&bytes));

        out.push(LoadedFont {
            family,
            postscript,
            data_uri,
            has_vietnamese,
            file: path
                .file_name()
                .map(|s| s.to_string_lossy().to_string())
                .unwrap_or_default(),
        });
    }
    Ok(out)
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScannedFont {
    family: String,
    postscript: String,
    path: String,
    has_vietnamese: bool,
}

fn read_font_meta(path: &Path) -> Option<ScannedFont> {
    let bytes = std::fs::read(path).ok()?;
    let face = ttf_parser::Face::parse(&bytes, 0).ok()?;
    let name_of = |id: u16| {
        face.names()
            .into_iter()
            .find(|n| n.name_id == id && n.is_unicode())
            .and_then(|n| n.to_string())
            .filter(|s| !s.is_empty())
    };
    let stem = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    Some(ScannedFont {
        family: name_of(ttf_parser::name_id::FAMILY).unwrap_or_else(|| stem.clone()),
        postscript: name_of(ttf_parser::name_id::POST_SCRIPT_NAME).unwrap_or(stem),
        path: path.to_string_lossy().to_string(),
        has_vietnamese: VN_TEST.iter().all(|&c| face.glyph_index(c).is_some()),
    })
}

/// Cache wrapper: the font list plus a fingerprint (candidate-file count) so a
/// stale cache is detected when the user adds/removes fonts in the folder.
#[derive(Serialize, Deserialize)]
struct FontIndexCache {
    count: usize,
    fonts: Vec<ScannedFont>,
}

fn is_font_file(p: &Path) -> bool {
    let ext = p
        .extension()
        .and_then(|x| x.to_str())
        .unwrap_or("")
        .to_lowercase();
    ext == "ttf" || ext == "otf" || ext == "ttc"
}

/// Recursively index a font folder (Layer 3). Reads only name tables (fast),
/// caches the result next to the folder — and re-scans automatically when the
/// number of font files changes (adding a font pack invalidates the cache).
#[tauri::command]
pub async fn scan_font_folder(path: String) -> Result<Vec<ScannedFont>, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Không phải thư mục: {path}"));
    }

    let files: Vec<_> = WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| is_font_file(e.path()))
        .map(|e| e.path().to_path_buf())
        .collect();

    // Fresh cache only if the file count still matches the folder.
    let cache = root.join(".font_index.json");
    if let Ok(txt) = std::fs::read_to_string(&cache) {
        if let Ok(c) = serde_json::from_str::<FontIndexCache>(&txt) {
            if c.count == files.len() && !c.fonts.is_empty() {
                return Ok(c.fonts);
            }
        }
    }

    let list: Vec<ScannedFont> = files.par_iter().filter_map(|p| read_font_meta(p)).collect();
    if let Ok(txt) = serde_json::to_string(&FontIndexCache {
        count: files.len(),
        fonts: list.clone(),
    }) {
        let _ = std::fs::write(&cache, txt);
    }
    Ok(list)
}
