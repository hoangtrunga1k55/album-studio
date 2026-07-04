# Album Studio

Local-first wedding-album designer for Vietnamese studios — Tauri (Rust) + React + Konva.

## Repo layout

```
app/                    Tauri desktop app (Rust backend + React/TS frontend)
tools/typo-pack/        Build a shippable "typo pack" from typo PSDs
tools/layout-editor/    Internal layout preview helper
ARCHITECTURE.md         Full technical architecture
Album_Studio_Spec.docx  Product spec
```

## Not in git (delivered separately)

These are large / proprietary and are `.gitignore`d — obtain them out of band:

| Path | What | Needed for |
|------|------|-----------|
| `fonts-lib/` | ~5000-font kho | App matches template/typo fonts at runtime (user imports the folder) |
| `source-layouts-25x35/` | Source layout PSDs (25×35) | Re-extracting layouts into `app/src/assets/layouts/` |
| `typo/` | Source typo PSDs + sample pack | Building typo packs |

## Develop

```bash
cd app
pnpm install
pnpm tauri dev      # run the app
pnpm tauri build    # produce the installer (.dmg / .exe)
```

## Runtime assets the end user provides

The installer is intentionally light (~6 MB). On first use the user points the app at:

- a **font kho** folder (Tab Font → "Thêm thư mục font"), and
- a **typo pack** folder (Tab Typo → "Thêm thư mục typo").

Build a typo pack from PSDs with `tools/typo-pack/build-typo-pack.sh` (see its README).