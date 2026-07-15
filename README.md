# Album Studio

Local-first wedding-album designer for Vietnamese studios — Tauri (Rust) + React + Konva.

## Repo layout

```
app2/                   Tauri desktop app (Rust backend + React/TS frontend) — the shipping app
tools/layout-editor/    Internal helper to hand-fix a layout's photo/text boxes
docs/                   Guides + phase reports
ARCHITECTURE.md         Full technical architecture
Album_Studio_Spec.docx  Product spec
```

Kho layout/typo và công cụ đóng gói kho tách sang repo riêng:

- **[album-pack-builder](https://github.com/hoangtrunga1k55/album-pack-builder)** *(app admin)* — build & publish kho từ PSD.
- **[album-studio-packs](https://github.com/hoangtrunga1k55/album-studio-packs)** *(host kho)* — Release `pack-layout` / `pack-typo`, app tự cập nhật qua `manifest.json`.

## Not in git (delivered separately)

Large / proprietary, `.gitignore`d — obtain out of band:

| Path | What | Needed for |
|------|------|-----------|
| `source-layouts/` | Source layout PSDs (mỗi thư mục con = 1 nhóm) | Build kho layout bằng Album Pack Builder |
| `source-typos/` | Source typo PSDs | Build kho typo |

## Develop

```bash
cd app2
pnpm install
pnpm tauri dev      # run the app
pnpm tauri build    # produce the installer (.dmg / .exe)
```

## Runtime assets the end user provides

The installer is intentionally light (~6–7 MB). On first use:

- **Font**: cài font pack vào máy — app tự quét thư mục font của hệ điều hành.
- **Kho layout/typo**: ⚙ Cài đặt → dán link Release của `album-studio-packs` → ⟳ Cập nhật (app chỉ tải file đổi hash).
