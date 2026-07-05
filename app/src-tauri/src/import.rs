//! Phase 1 — image import pipeline (Rust-native).
//!
//! Scans a folder recursively, reads EXIF (capture time + orientation),
//! generates a small thumbnail per image in parallel, and streams each
//! result back to the webview through a Tauri Channel so the grid fills
//! progressively and the UI never blocks.

use std::hash::{Hash, Hasher};
use std::path::Path;

use base64::{engine::general_purpose, Engine};
use image::{codecs::jpeg::JpegEncoder, DynamicImage, GenericImageView};
use rayon::prelude::*;
use serde::Serialize;
use tauri::ipc::Channel;
use walkdir::WalkDir;

/// Longest-side size of the generated grid thumbnail, in pixels.
const THUMB_MAX: u32 = 320;
/// JPEG quality for thumbnails (small files, fast to ship over IPC).
const THUMB_QUALITY: u8 = 72;
/// Longest-side size of the canvas "display" image (sharp on screen, not full-res).
const DISPLAY_MAX: u32 = 1600;
const DISPLAY_QUALITY: u8 = 85;

const SUPPORTED: &[&str] = &["jpg", "jpeg", "png", "tif", "tiff", "heic", "heif"];

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageMeta {
    pub id: String,
    pub path: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
    pub ratio: f32,
    /// Normalized "YYYY-MM-DD HH:MM:SS" — sortable. From EXIF, else file mtime.
    pub captured_at: String,
    /// Base64 data URI (image/jpeg) of the thumbnail.
    pub thumb: String,
}

#[derive(Serialize, Clone)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ImportEvent {
    Started { total: usize },
    Image(ImageMeta),
    Failed { path: String, error: String },
    Done { ok: usize, failed: usize },
}

#[tauri::command]
pub async fn import_folder(path: String, on_event: Channel<ImportEvent>) -> Result<(), String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Không phải thư mục: {path}"));
    }
    let files: Vec<String> = WalkDir::new(root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| has_supported_ext(e.path()))
        .map(|e| e.path().to_string_lossy().to_string())
        .collect();
    process_files(files, on_event);
    Ok(())
}

/// Import a user-selected list of image files (multi-select picker).
#[tauri::command]
pub async fn import_files(paths: Vec<String>, on_event: Channel<ImportEvent>) -> Result<(), String> {
    let files: Vec<String> = paths
        .into_iter()
        .filter(|p| has_supported_ext(Path::new(p)))
        .collect();
    process_files(files, on_event);
    Ok(())
}

/// Process a list of image files in parallel, streaming each result.
fn process_files(files: Vec<String>, on_event: Channel<ImportEvent>) {
    let _ = on_event.send(ImportEvent::Started { total: files.len() });

    let ok = std::sync::atomic::AtomicUsize::new(0);
    let failed = std::sync::atomic::AtomicUsize::new(0);
    use std::sync::atomic::Ordering::Relaxed;

    files.par_iter().for_each(|fp| {
        match process_one(fp) {
            Ok(meta) => {
                ok.fetch_add(1, Relaxed);
                let _ = on_event.send(ImportEvent::Image(meta));
            }
            Err(e) => {
                failed.fetch_add(1, Relaxed);
                let _ = on_event.send(ImportEvent::Failed {
                    path: fp.clone(),
                    error: e,
                });
            }
        }
    });

    let _ = on_event.send(ImportEvent::Done {
        ok: ok.load(Relaxed),
        failed: failed.load(Relaxed),
    });
}

fn has_supported_ext(p: &Path) -> bool {
    p.extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Returns a display-resolution JPEG (data URI) for a single image — used when
/// an image is placed on the canvas (sharp on screen, far smaller than full-res).
#[tauri::command]
pub async fn get_display_image(path: String) -> Result<String, String> {
    let img = decode_image(&path)?;
    encode_jpeg_data_uri(&img, DISPLAY_MAX, DISPLAY_QUALITY)
}

/// Higher-resolution JPEG for print export.
#[tauri::command]
pub async fn get_export_image(path: String) -> Result<String, String> {
    let img = decode_image(&path)?;
    encode_jpeg_data_uri(&img, 3200, 92)
}

/// Decode any supported image to pixels, with EXIF orientation applied.
fn decode_image(fp: &str) -> Result<DynamicImage, String> {
    let path = Path::new(fp);
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if ext == "heic" || ext == "heif" {
        // libheif already applies orientation transforms.
        #[cfg(not(target_os = "windows"))]
        {
            decode_heic(fp)
        }
        // libheif (a C library) isn't available on the Windows build yet.
        #[cfg(target_os = "windows")]
        {
            Err("Định dạng HEIC/HEIF chưa hỗ trợ trên Windows (dùng JPG/PNG).".to_string())
        }
    } else {
        let img = image::open(path).map_err(|e| e.to_string())?;
        let (_, orientation) = read_exif(path);
        Ok(apply_orientation(img, orientation))
    }
}

fn process_one(fp: &str) -> Result<ImageMeta, String> {
    let path = Path::new(fp);

    let img = decode_image(fp)?;
    let (exif_time, _) = read_exif(path);

    let (width, height) = img.dimensions();
    let captured_at = exif_time.unwrap_or_else(|| file_mtime(path));

    let thumb = encode_jpeg_data_uri(&img, THUMB_MAX, THUMB_QUALITY)?;

    Ok(ImageMeta {
        id: hash_path(fp),
        path: fp.to_string(),
        name: path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        width,
        height,
        ratio: width as f32 / height.max(1) as f32,
        captured_at,
        thumb,
    })
}

/// Decode a HEIC/HEIF file to an RGB image via the system libheif.
#[cfg(not(target_os = "windows"))]
fn decode_heic(fp: &str) -> Result<DynamicImage, String> {
    use libheif_rs::{ColorSpace, HeifContext, LibHeif, RgbChroma};

    let lib = LibHeif::new();
    let ctx = HeifContext::read_from_file(fp).map_err(|e| e.to_string())?;
    let handle = ctx.primary_image_handle().map_err(|e| e.to_string())?;
    let decoded = lib
        .decode(&handle, ColorSpace::Rgb(RgbChroma::Rgb), None)
        .map_err(|e| e.to_string())?;

    let width = decoded.width();
    let height = decoded.height();
    let planes = decoded.planes();
    let plane = planes.interleaved.ok_or("HEIC: no interleaved plane")?;
    let stride = plane.stride;
    let data = plane.data;

    // Copy row by row to drop any stride padding.
    let row_bytes = (width as usize) * 3;
    let mut buf = Vec::with_capacity(row_bytes * height as usize);
    for y in 0..height as usize {
        let start = y * stride;
        buf.extend_from_slice(&data[start..start + row_bytes]);
    }
    let rgb = image::RgbImage::from_raw(width, height, buf)
        .ok_or("HEIC: failed to build image buffer")?;
    Ok(DynamicImage::ImageRgb8(rgb))
}

/// Returns (normalized capture time, EXIF orientation 1..8).
fn read_exif(path: &Path) -> (Option<String>, u16) {
    let file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return (None, 1),
    };
    let mut reader = std::io::BufReader::new(file);
    let exif = match exif::Reader::new().read_from_container(&mut reader) {
        Ok(e) => e,
        Err(_) => return (None, 1),
    };

    let time = exif
        .get_field(exif::Tag::DateTimeOriginal, exif::In::PRIMARY)
        .or_else(|| exif.get_field(exif::Tag::DateTime, exif::In::PRIMARY))
        .map(|f| normalize_exif_time(&f.display_value().to_string()));

    let orientation = exif
        .get_field(exif::Tag::Orientation, exif::In::PRIMARY)
        .and_then(|f| f.value.get_uint(0))
        .map(|v| v as u16)
        .unwrap_or(1);

    (time, orientation)
}

/// EXIF date is "YYYY:MM:DD HH:MM:SS" -> "YYYY-MM-DD HH:MM:SS" (sortable).
fn normalize_exif_time(s: &str) -> String {
    let s = s.trim();
    if s.len() >= 10 && s.as_bytes()[4] == b':' && s.as_bytes()[7] == b':' {
        let mut c: Vec<char> = s.chars().collect();
        c[4] = '-';
        c[7] = '-';
        return c.into_iter().collect();
    }
    s.to_string()
}

fn file_mtime(path: &Path) -> String {
    use chrono::{DateTime, Local};
    std::fs::metadata(path)
        .and_then(|m| m.modified())
        .map(|t| {
            let dt: DateTime<Local> = t.into();
            dt.format("%Y-%m-%d %H:%M:%S").to_string()
        })
        .unwrap_or_else(|_| "0000-00-00 00:00:00".to_string())
}

fn apply_orientation(img: DynamicImage, orientation: u16) -> DynamicImage {
    match orientation {
        2 => img.fliph(),
        3 => img.rotate180(),
        4 => img.flipv(),
        5 => img.rotate90().fliph(),
        6 => img.rotate90(),
        7 => img.rotate270().fliph(),
        8 => img.rotate270(),
        _ => img,
    }
}

/// Downscale (never upscale) to `max` longest side and encode as a JPEG data URI.
fn encode_jpeg_data_uri(img: &DynamicImage, max: u32, quality: u8) -> Result<String, String> {
    let scaled = img.thumbnail(max, max); // preserves aspect ratio, downscale-only
    let rgb = scaled.to_rgb8();
    let mut buf: Vec<u8> = Vec::new();
    JpegEncoder::new_with_quality(&mut buf, quality)
        .encode_image(&rgb)
        .map_err(|e| e.to_string())?;
    Ok(format!(
        "data:image/jpeg;base64,{}",
        general_purpose::STANDARD.encode(&buf)
    ))
}

fn hash_path(s: &str) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    s.hash(&mut h);
    format!("img_{:016x}", h.finish())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Runs the real pipeline over `../test-photos` (JPEG + HEIC) when present.
    /// Verifies decode + thumbnail generation, including the libheif path.
    #[test]
    fn processes_jpeg_and_heic() {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../test-photos");
        if !Path::new(dir).is_dir() {
            eprintln!("skip: no test-photos dir");
            return;
        }
        let (mut total, mut heic) = (0, 0);
        for entry in WalkDir::new(dir).into_iter().filter_map(|e| e.ok()) {
            if !entry.file_type().is_file() || !has_supported_ext(entry.path()) {
                continue;
            }
            let p = entry.path().to_string_lossy().to_string();
            let meta = process_one(&p).unwrap_or_else(|e| panic!("process {p}: {e}"));
            assert!(meta.thumb.starts_with("data:image/jpeg;base64,"));
            assert!(meta.width > 0 && meta.height > 0);
            total += 1;
            if p.ends_with(".heic") {
                heic += 1;
            }
        }
        assert!(total >= 4, "expected >=4 images, got {total}");
        assert!(heic >= 1, "expected >=1 HEIC decoded, got {heic}");
    }
}