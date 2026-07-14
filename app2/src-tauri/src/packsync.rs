//! Pack sync — keep a local layout/typo library in step with a GitHub Release.
//!
//! The release holds every pack file as a flat asset (`layout-25x35/lay-6.json`
//! → `layout-25x35__lay-6.json`) plus `manifest.json` listing path + sha256.
//! Syncing downloads the manifest, compares hashes with what is on disk, then
//! fetches ONLY the changed files and deletes the ones that were removed.

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;

const ASSET_SEP: &str = "__";

#[derive(Deserialize, Clone)]
struct ManifestFile {
    path: String,
    sha256: String,
}

#[derive(Deserialize)]
struct Manifest {
    kind: String,
    version: String,
    files: Vec<ManifestFile>,
}

/// Progress events streamed to the UI while syncing.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum SyncEvent {
    Started { total: usize, version: String },
    File { done: usize, total: usize, name: String },
    Done { downloaded: usize, removed: usize, kept: usize, version: String, pack_kind: String },
}

fn sha256_of(path: &Path) -> Option<String> {
    let bytes = std::fs::read(path).ok()?;
    let mut h = Sha256::new();
    h.update(&bytes);
    Some(format!("{:x}", h.finalize()))
}

/// `https://github.com/owner/repo/releases/tag/pack-layout` (or …/releases/download/pack-layout/…)
/// → the asset base `https://github.com/owner/repo/releases/download/pack-layout`
fn asset_base(release_url: &str) -> Result<String, String> {
    let u = release_url.trim().trim_end_matches('/');
    if let Some(rest) = u.split("/releases/tag/").nth(1) {
        let base = u.split("/releases/tag/").next().unwrap_or_default();
        return Ok(format!("{base}/releases/download/{rest}"));
    }
    if u.contains("/releases/download/") {
        // already an asset URL — cut back to the tag folder
        let mut parts: Vec<&str> = u.split('/').collect();
        parts.pop();
        return Ok(parts.join("/"));
    }
    Err("Link release không hợp lệ (cần dạng .../releases/tag/<tag>)".into())
}

async fn fetch(url: &str) -> Result<Vec<u8>, String> {
    let res = reqwest::get(url)
        .await
        .map_err(|e| format!("Tải lỗi: {e}"))?;
    if !res.status().is_success() {
        return Err(format!("Tải lỗi {} — {url}", res.status()));
    }
    Ok(res
        .bytes()
        .await
        .map_err(|e| format!("Đọc dữ liệu lỗi: {e}"))?
        .to_vec())
}

/// Sync `release_url` into `dest` (created if missing). Returns the pack kind.
#[tauri::command]
pub async fn sync_pack(
    release_url: String,
    dest: String,
    on_event: Channel<SyncEvent>,
) -> Result<String, String> {
    let base = asset_base(&release_url)?;
    let root = PathBuf::from(&dest);
    std::fs::create_dir_all(&root).map_err(|e| format!("Không tạo được thư mục: {e}"))?;

    // 1. manifest
    let bytes = fetch(&format!("{base}/manifest.json")).await?;
    let manifest: Manifest =
        serde_json::from_slice(&bytes).map_err(|e| format!("manifest.json hỏng: {e}"))?;
    let _ = on_event.send(SyncEvent::Started {
        total: manifest.files.len(),
        version: manifest.version.clone(),
    });

    // 2. download what changed
    let total = manifest.files.len();
    let mut downloaded = 0usize;
    let mut kept = 0usize;
    for (i, f) in manifest.files.iter().enumerate() {
        let local = root.join(&f.path);
        let fresh = sha256_of(&local).map(|h| h == f.sha256).unwrap_or(false);
        if fresh {
            kept += 1;
        } else {
            let asset = f.path.replace('/', ASSET_SEP);
            let data = fetch(&format!("{base}/{asset}")).await?;
            if let Some(dir) = local.parent() {
                std::fs::create_dir_all(dir).map_err(|e| format!("Tạo thư mục lỗi: {e}"))?;
            }
            std::fs::write(&local, &data).map_err(|e| format!("Ghi file lỗi: {e}"))?;
            downloaded += 1;
        }
        let _ = on_event.send(SyncEvent::File {
            done: i + 1,
            total,
            name: f.path.clone(),
        });
    }

    // 3. delete local files the pack no longer has
    let wanted: std::collections::HashSet<String> =
        manifest.files.iter().map(|f| f.path.clone()).collect();
    let mut removed = 0usize;
    for entry in walkdir::WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
    {
        let rel = match entry.path().strip_prefix(&root) {
            Ok(r) => r.to_string_lossy().replace('\\', "/"),
            Err(_) => continue,
        };
        if rel == "manifest.json" || rel.starts_with('.') {
            continue;
        }
        if !wanted.contains(&rel) {
            let _ = std::fs::remove_file(entry.path());
            removed += 1;
        }
    }

    // 4. remember the manifest locally (so the next sync can show the version)
    let _ = std::fs::write(root.join("manifest.json"), &bytes);

    let _ = on_event.send(SyncEvent::Done {
        downloaded,
        removed,
        kept,
        version: manifest.version.clone(),
        pack_kind: manifest.kind.clone(),
    });
    Ok(manifest.kind)
}

/// Version string of the locally synced pack (empty when never synced).
#[tauri::command]
pub async fn local_pack_version(dest: String) -> Result<String, String> {
    let p = Path::new(&dest).join("manifest.json");
    let txt = match std::fs::read_to_string(&p) {
        Ok(t) => t,
        Err(_) => return Ok(String::new()),
    };
    let m: Manifest = serde_json::from_str(&txt).map_err(|e| e.to_string())?;
    Ok(m.version)
}
