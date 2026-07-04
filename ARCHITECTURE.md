# Album Studio — Tài liệu Kiến trúc Kỹ thuật

> Bản kiến trúc cho MVP. Bám sát `Album_Studio_Spec.docx` (v1.0, 06/2026).
> Triết lý đã chốt: **local-first, mua đứt, offline AI** + **ưu tiên hiệu năng tối đa** →
> đẩy phần nặng (ảnh, AI) xuống **Rust backend**, webview chỉ lo UI/canvas.
>
> Trạng thái: *Plan kiến trúc* — chưa viết code. Mọi số version đánh dấu ⚠️PIN cần
> kiểm tra lại trên crates.io/npm tại thời điểm `cargo add` / `pnpm add`.

---

## 0. Nguyên tắc chỉ đạo (kế thừa từ spec §6)

1. **"Thiếu nó sản phẩm có chết không?"** — không chết thì cắt khỏi MVP.
2. **Local-first tuyệt đối** — không cloud, không account, không backend cho tới khi có 50 user trả tiền.
3. **Hiệu năng là feature** — studio chạy album 40 spread × ảnh full-res; lag = churn.
4. **App nhẹ** — mục tiêu installer ~150–200MB (chủ yếu là model AI + font bundled, không phải runtime).
5. **Tách rời update**: app / font pack / layout pack update độc lập nhau.

---

## 1. Quyết định kiến trúc lớn nhất: việc gì chạy ở đâu

Đây là điểm tôi **sửa khác spec gốc**. Spec đề xuất nhồi nhiều thứ vào webview
(Sharp qua "Node sidecar", ONNX Runtime **Web**, Tesseract.js WASM). Với ưu tiên
hiệu năng + ổn định, ranh giới đúng là:

```
┌──────────────────────────────────────────────────────────────┐
│  WEBVIEW  (React + TS + Konva)  — chỉ UI & tương tác          │
│  • Canvas editor (Konva), drag/drop, layout shuffle           │
│  • Hiển thị thumbnail (đọc từ cache do Rust tạo)              │
│  • Properties panel, font picker, snippets                    │
│  • Gọi backend qua invoke(), nhận tiến độ qua Channel/Event   │
└───────────────────────────┬──────────────────────────────────┘
                            │  Tauri IPC (invoke / channel)
┌───────────────────────────┴──────────────────────────────────┐
│  RUST BACKEND (src-tauri)  — mọi thứ nặng & cần ổn định        │
│  • Image I/O: decode jpg/png/tif/heic, EXIF, thumbnail        │
│  • Resize chuẩn DPI (SIMD), ICC color convert, embed metadata │
│  • Export: render → JPG/PDF, progress, cancel                 │
│  • AI pipeline: ONNX (ort), OCR, pose, CLIP — đa luồng (rayon)│
│  • Font scan 5000 file: metadata + phát hiện dấu Việt         │
│  • Đọc/ghi file project .album, quản lý cache                 │
└───────────────────────────────────────────────────────────────┘
```

**Lý do bỏ "Sharp via Node sidecar":** Tauri backend là **Rust, không phải Node**.
Nhúng cả Node runtime chỉ để chạy Sharp = +vài chục MB, native binary phải build
riêng cho mac arm64/x64 + win, startup chậm, IPC thừa một tầng, bảo trì khổ.
Rust có đủ crate native nhanh hơn. → **Loại sidecar, dùng Rust-native.**

**Lý do bỏ "ONNX Runtime Web":** chạy model trong WASM ở webview chậm hơn nhiều
so với `ort` (ONNX Runtime native) trong Rust, lại khó dùng nhiều luồng/SIMD/threads
ổn định. AI pipeline cần ~8s/80 ảnh → phải native. → **Dùng `ort` crate ở backend.**

> Ngoại lệ hợp lý: những thao tác *nhẹ và gắn UI* (ví dụ eyedropper lấy màu, preview
> tức thời) vẫn làm ở webview cho mượt. Quy tắc: **nặng/CPU-bound → Rust; gắn con trỏ/tương tác → webview.**

---

## 2. Tech Stack (đã hiệu chỉnh so với spec §5)

| Thành phần | Spec gốc | **Chốt** | Ghi chú |
|---|---|---|---|
| App shell | Tauri | **Tauri 2.11.x** ⚠️PIN | 2.11.3 (06/2026) là bản ổn định mới nhất; line khoẻ, chưa có v3 |
| UI | React + TS | **React 18 + TS + Vite** | Giữ nguyên; dev VN dễ tuyển |
| Canvas | Konva.js | **Konva + react-konva** | Giữ nguyên; xem §6.1 chiến lược multi-canvas |
| State | Zustand | **Zustand** | Giữ nguyên |
| **Image proc** | Sharp (Node sidecar) | **Rust: `image` + `fast_image_resize` + `kamadak-exif` + `lcms2` + `libheif-rs`** | **Thay đổi lớn** — xem §3 |
| **AI runtime** | ONNX Runtime **Web** | **Rust `ort` (ONNX Runtime native, CPU EP)** | **Thay đổi lớn** — xem §7 |
| OCR | Tesseract.js (WASM) | **Rust binding Tesseract (`leptess`/`rusty-tesseract`)** ⚠️PIN, có `vie` traineddata | Native nhanh & ổn hơn; fallback gõ tay vẫn giữ |
| CV (Canny/contour) | opencv.js | **`imageproc` (pure Rust)**, hoặc `opencv` binding nếu cần | MVP-Lite gần như không cần — xem §7 |
| PDF | PDF-LIB (JS) | **Rust `printpdf`/`lopdf`** ⚠️PIN (cân nhắc giữ PDF-LIB nếu render ở JS) | Quyết theo nơi render — xem §6.6 |
| Font scan | fontkit (JS) | **Rust `ttf-parser` + `rustybuzz`** | Scan 5000 font ở backend, phát hiện dấu Việt qua cmap |
| File storage | JSON `.album` | **JSON `.album` (thư mục, không phải 1 file)** | Xem §5 |
| Auto-update | Tauri Updater + R2 | **`tauri-plugin-updater` 2.10.x + Cloudflare R2** ⚠️PIN | Manifest tĩnh JSON trên R2, ký artifact |
| Plugins | — | `tauri-plugin-fs` 2.5.x, `-dialog` 2.7.x, `-store` 2.4.x ⚠️PIN | **Version độc lập nhau**, không cùng 2.0 |

> **Lưu ý quan trọng từ research:** các plugin Tauri **không cùng version** với core
> và với nhau. Pin từng cái riêng.

---

## 3. Image processing — pipeline Rust-native

Thay thế hoàn toàn Sharp. Phân vai từng crate:

| Việc | Crate | Vì sao |
|---|---|---|
| Decode JPG/PNG/TIFF | `image` ⚠️PIN | Chuẩn ngành Rust, đủ format spec yêu cầu |
| Decode HEIC (.heic) | `libheif-rs` ⚠️PIN | **Phụ thuộc lib hệ thống `libheif`** → phải bundle/cài kèm; đây là điểm rủi ro đóng gói, xem §10 |
| Resize chuẩn DPI | `fast_image_resize` ⚠️PIN | SIMD, nhanh hơn resize của `image` nhiều lần — quan trọng cho thumbnail hàng loạt + export 3543px |
| Đọc EXIF (ngày chụp, orientation) | `kamadak-exif` ⚠️PIN | Đọc tốt; dùng để sort theo thời gian (Auto Layout) & xoay đúng chiều |
| Ghi/embed metadata | `little_exif` / `img-parts` ⚠️PIN | Nhúng metadata vào file export |
| Color profile (sRGB/Adobe RGB/ICC) | `lcms2` (binding Little-CMS) ⚠️PIN | Chuẩn công nghiệp in; `qcms` là phương án nhẹ hơn nếu chỉ cần sRGB↔display |

**Đa luồng:** dùng `rayon` để generate thumbnail song song khi import >100 ảnh
(spec yêu cầu UI không treo). Mỗi ảnh: decode → auto-orient theo EXIF → resize ~thumbnail → ghi cache.

**Rủi ro đã biết:**
- HEIC là điểm yếu duy nhất — `libheif` là dependency C. Cần kiểm thử đóng gói trên cả mac & win sớm (M1). Nếu vướng, fallback: yêu cầu user export JPG (spec vốn đã ghi "chỉ nhận JPG đã export sẵn" cho RAW — HEIC có thể xếp cùng nhóm "nice-to-have").

---

## 4. Cấu trúc thư mục dự án (mở rộng từ spec §5)

```
album-studio/
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/           # #[tauri::command] — biên giới IPC
│   │   │   ├── import.rs        # scan folder, thumbnail, EXIF
│   │   │   ├── export.rs        # render → JPG/PDF, progress channel
│   │   │   ├── fonts.rs         # scan font, build .font_index.json
│   │   │   ├── project.rs       # đọc/ghi .album
│   │   │   └── copy_design.rs   # AI pipeline entrypoints
│   │   ├── image/              # decode, resize, color, exif (module thuần)
│   │   ├── ai/                 # ort sessions, clip, pose, ocr, color-mood
│   │   ├── font/              # ttf-parser, phát hiện dấu Việt
│   │   └── project/           # model + serde cho .album
│   ├── capabilities/          # Tauri 2: permission scoped theo window
│   └── tauri.conf.json
├── src/                        # Webview React
│   ├── components/             # UI nhỏ, nhiều file (theo coding-style)
│   ├── canvas/                 # Konva: Stage/Layer/slot, handles, text edit
│   ├── engine/
│   │   ├── layout/             # áp layout JSON vào spread (logic nhẹ ở JS)
│   │   └── copy-design/        # gọi backend + orchestrate UI bước 1..6
│   ├── store/                  # Zustand slices: project, spreads, images, ui
│   ├── ipc/                    # wrapper invoke() + types dùng chung
│   └── assets/
│       ├── layouts/            # 200 layout JSON
│       ├── fonts/              # 30 font bundled
│       └── snippets/           # câu thoại Việt
├── models/                     # ONNX: MobileCLIP, pose, ... (tải/bundle)
└── ARCHITECTURE.md             # file này
```

Tuân thủ coding-style: **nhiều file nhỏ 200–400 dòng**, tách theo feature/domain.

---

## 5. Mô hình dữ liệu — file project `.album`

Spec nói "JSON `.album` local, file tổng <1MB cho 40 spread". Đề xuất: **`.album` là một
THƯ MỤC** (package) chứ không phải 1 file, để tách project JSON nhỏ khỏi cache nặng:

```
MyWedding.album/
├── project.json          # toàn bộ state: spreads, slot, text, ref ảnh (ID, đường dẫn tương đối)
├── .cache/               # thumbnail (~50KB/ảnh) — spec §4.2; regenerate được
│   └── thumbs/
├── .font_index.json      # cache metadata font (spec §4.4.1)
└── exports/              # Export_YYYY-MM-DD/ (spec §4.6)
```

**Nguyên tắc immutability (coding-style):** state trong Zustand & project.json luôn
cập nhật bằng cách tạo object mới, không mutate. Mỗi spread lưu dạng JSON nhẹ:
vị trí + ID ảnh tham chiếu (không nhúng pixel) → giữ project.json <1MB.

`project.json` schema (phác thảo):
```jsonc
{
  "version": 1,
  "albumSize": { "wMm": 300, "hMm": 300, "dpi": 300 },   // → 3543×3543 px
  "images": [{ "id": "img_001", "path": "../photos/a.jpg", "exifTime": "...", "ratio": "3:4" }],
  "spreads": [{
    "id": "sp_01", "layoutId": "L_4up_a",
    "slots": [{ "imageId": "img_001", "x": .., "y": .., "w": .., "h": .., "zoom": 1, "panX": 0, "panY": 0 }],
    "texts": [{ "content": "...", "fontId": "...", "sizePt": 48, "x": .., "y": .., "vertical": false }]
  }]
}
```

---

## 6. Kiến trúc theo từng tính năng MVP

### 6.1 Canvas dàn ảnh — chiến lược multi-canvas (điểm hiệu năng then chốt)

Vấn đề: 40 spread, mỗi spread "logic" là 3543×3543 px. **KHÔNG** mount 40 Konva Stage cùng lúc (nổ RAM).

**Chiến lược:**
- Chỉ **mount 1 Konva Stage cho spread đang chọn**. Sidebar hiển thị **thumbnail tĩnh** (ảnh PNG nhỏ) cho các spread khác.
- Canvas **không** hiển thị ảnh full-res; dùng **display-res** (ảnh đã downscale, ví dụ ~1500px) cho mượt; **full-res chỉ dùng khi export** (do Rust load lại từ file gốc).
- Konva: bật `image.cache()` cho ảnh tĩnh, tách `Layer` cố định vs `Layer` tương tác, dùng `pixelRatio` hợp lý.
- Thumbnail sidebar: khi spread thay đổi, debounce → `stage.toDataURL({ pixelRatio nhỏ })` để cập nhật preview.

6 thao tác đúng spec §4.1 (kéo-thả, 8 handle resize, double-click zoom/pan trong slot, right-click menu, slider Margin, Space đổi layout). Pan = chuột giữa/Space-drag; Zoom = Ctrl+scroll. **KHÔNG** làm snap-to-grid phức tạp, layer panel, vector shape (spec đã loại).

### 6.2 Import ảnh
- Webview: drag folder / nút Import → gọi `commands::import::scan_folder(path)`.
- Rust: scan đệ quy (.jpg/.png/.jpeg/.tif/.heic), đọc EXIF, generate thumbnail song song (`rayon`), ghi `.cache/thumbs/`, trả về metadata (id, path, ratio, exifTime).
- Tiến độ trả về webview qua **Tauri Channel** (stream), UI không treo.
- Lần mở sau: đọc cache → instant.
- Grid 80/120/160px, filter All/Used/Unused, search theo tên (xử lý ở webview trên list metadata).

### 6.3 Auto Layout
- 200 layout JSON (`assets/layouts/`), mỗi layout = mảng slot có ratio.
- Thuật toán (chạy ở JS, nhẹ — chỉ sắp xếp, không pixel): sort ảnh theo EXIF time → mỗi spread lấy N ảnh kế tiếp theo Density slider (Thưa/Cân/Dày) → match ngang↔ngang, dọc↔dọc → crop nhẹ khớp ratio.
- "Auto Design" mục tiêu <60s. Vì chỉ là sắp xếp + tham chiếu ID (không xử lý pixel), JS thừa sức nhanh. Render full-res để xem là việc của canvas (display-res).
- Space = shuffle layout cùng số slot. **Chưa cần AI ở v1** (spec §4.3).

### 6.4 Typography & Font system → xem §8

### 6.5 AI Copy Design → xem §7

### 6.6 Export
- **Quyết định nơi render:** vì ưu tiên hiệu năng + chất lượng in, **render ở Rust** là lựa chọn ổn định nhất (kiểm soát DPI, ICC, bộ nhớ). Nhưng Konva giữ "nguồn chân lý" về layout/text.
- **Phương án A (đề xuất):** webview xuất mỗi spread ra **layout description** (đã có trong project.json) → Rust dựng lại ảnh full-res: load ảnh gốc, resize `fast_image_resize`, vẽ text bằng `rustybuzz`+raster, ghép theo slot → JPG (`image`) → đính vào PDF (`printpdf`). ICC convert bằng `lcms2`. **Ưu: kiểm soát hoàn toàn, không giới hạn canvas, đa luồng.** Nhược: phải tự render text/khung ở Rust (công sức M2+).
- **Phương án B (đơn giản, MVP M1):** Konva `stage.toDataURL({ pixelRatio: targetDPI/72 })` render ở webview → gửi buffer cho Rust chỉ để ghi file/PDF/ICC. **Ưu: nhanh ra M1.** Nhược: rủi ro RAM webview ở 3543px × 40 spread, chất lượng text phụ thuộc canvas.
- **Khuyến nghị:** M1 dùng **B** để có export sớm; M2–M4 chuyển dần sang **A** cho chất lượng in & độ ổn định. Progress bar + cancel qua Channel.
- Settings đúng spec §4.6 (JPG/PDF/cả hai, 150/300 DPI, sRGB/Adobe RGB, quality, bleed 0/3/5mm, naming `Spread_`, output `Export_YYYY-MM-DD/`). **KHÔNG** làm Lab API / CMYK pro ở MVP.

---

## 7. AI Copy Design — kiến trúc pipeline (USP)

**Chốt runtime: `ort` (ONNX Runtime native) ở Rust backend, CPU Execution Provider.**
Không dùng ONNX Runtime Web. Lý do: nhanh hơn nhiều trên CPU, dễ đa luồng, ổn định,
tách khỏi vòng đời webview.

Pipeline 6 bước (spec §4.5), nơi chạy & công nghệ:

| Bước | Việc | Công nghệ (chốt) | Nơi chạy |
|---|---|---|---|
| 1 | Layout extraction | **MVP-Lite: bỏ bóc thật.** Dùng CLIP similarity so ảnh mẫu với 200 layout preset → gợi ý 3 layout gần nhất | Rust (`ort` + embeddings) |
| 2 | Color mood | K-means + histogram matching → tạo preset màu/LUT | Rust (`image` + ndarray/tự code) |
| 3 | Typography | **MVP-Lite: KHÔNG ID font.** Chỉ trích vị trí+size+màu chữ; user chọn từ 30 preset Việt. OCR text bằng Tesseract `vie` (fallback gõ tay) | Rust (`leptess`) |
| 4 | Pose & crop criteria | Pose/Face detection → tiêu chí chọn/crop ảnh | Rust (`ort` — model pose/face ONNX) |
| 5 | Photo matching | **MobileCLIP embeddings + Hungarian** ghép ảnh user ↔ slot. Mục tiêu ~8s/80 ảnh | Rust (`ort` + thuật toán Hungarian) |
| 6 | Anti-plagiarism | MVP-Lite: mirror + shift nhẹ (parametric) | Rust (`image`) |

**Model bundled** (spec §4.5, ~160MB, $0 license) — đặt ở `models/`, định dạng **ONNX**:
- MobileCLIP (image+text embedding) — ⚠️PIN cần xác minh bản ONNX sẵn có; nếu vướng, phương án thay: SigLIP nhỏ / OpenCLIP ViT-B-32 ONNX.
- Pose/Face: **MediaPipe gốc không chạy thẳng qua ONNX**. ⚠️ Cần thay bằng model ONNX tương đương (BlazeFace/face-detection ONNX, hoặc YOLO-pose nhỏ). Đây là **rủi ro cần xác minh sớm** trước M3.
- Tesseract `vie` traineddata (~khác model ONNX, chạy qua `leptess`).

**Triết lý spec (giữ nguyên):** không dùng AI nặng cho mọi bước. Album cưới đa phần khung
chữ nhật → CV cổ điển (Canny/contour qua `imageproc`) đủ & nhanh hơn cho bước layout khi
cần. AI chỉ ở 2 chỗ thật cần: **pose (bước 4)** & **matching (bước 5)**.

**MVP-Lite v1 (spec): ship trong ~2 tháng thay vì 6** — làm đầy đủ bước 2 (color) + bước
4–5 (matching), đơn giản hoá 1/3/6. Đúng "80% giá trị, 20% chi phí".

**Rủi ro (spec §4.5 + bổ sung):**
- OCR Việt sai dấu → fallback gõ tay, không block flow.
- MediaPipe → ONNX không 1:1 → cần spike kỹ thuật ở M2 chọn model pose/face ONNX thay thế.
- Layout VN khác Tây → cần thu thập data (5000 ảnh album VN có label) cho bản fine-tune sau MVP.
- Bản quyền ảnh training & anti-plagiarism → TOS ghi rõ user chịu trách nhiệm output.

---

## 8. Font System — 3 lớp song song (spec §4.4.1)

Scan & index ở **Rust backend** (5000 font cần tốc độ + đa luồng):

- **Lớp 1 Bundled** (`assets/fonts/`, 30–50 font, ~10–20MB): license rõ ràng (Google Fonts open source). Dùng được ngay.
- **Lớp 2 System font:** Rust scan `C:\Windows\Fonts` / `~/Library/Fonts` (+ `/Library/Fonts`, `/System/Library/Fonts` trên mac).
- **Lớp 3 Custom folder:** Settings → thêm thư mục → scan đệ quy `.ttf/.otf/.woff2`, **KHÔNG cài vào OS**.

**Font Index & phát hiện dấu Việt:**
- Crate: **`ttf-parser`** đọc metadata (tên, family, style) + đọc bảng **cmap** để kiểm tra glyph coverage cho các ký tự dấu Việt (`Á À Ã Ả Ạ ơ ư ế ố` …). Thiếu glyph → gắn tag **[KHÔNG CÓ DẤU]**. Render shaping dùng `rustybuzz` nếu cần preview chính xác.
- Cache `.font_index.json`: lần đầu 5000 font ~1–2 phút → lần sau khởi động tức thì (spec).
- Auto tag Serif/Sans/Script/Display/Handwritten (heuristic từ metadata + tên).

**Render font trong canvas (webview):** nạp file font local qua **FontFace API**
(`new FontFace(name, url)` với asset URL Tauri trỏ tới file thật) → `document.fonts.add`.
Vertical text (Hán-Nôm) cho text box dọc theo spec §4.4. Diacritics phải kiểm thử kỹ.

**Pack font chia sẻ** (spec): 8 pack theo chủ đề trên CDN (R2). App chỉ trỏ folder,
không phân phối font trong app → pháp lý sạch.

---

## 9. Chiến lược hiệu năng (đáp ứng "tốc độ cao, ổn định")

| Khu vực | Chiến lược |
|---|---|
| Import hàng loạt | Thumbnail song song `rayon`, stream progress, cache đĩa |
| Canvas | 1 Stage active; display-res không full-res; `image.cache()`; tách Layer |
| RAM ảnh | Không giữ full-res trong webview; Rust load gốc chỉ khi export |
| Export | Render/ICC ở Rust, đa luồng từng spread, cancel được |
| AI | `ort` native CPU, đa luồng; chạy nền, không block UI |
| Font | Scan + index một lần ở Rust, cache JSON |
| File project | JSON nhẹ (ref ID), <1MB; cache tách riêng |

Min spec rõ ràng trên website (spec §8): cảnh báo máy yếu, cho **tắt AI matching** dùng manual.

---

## 10. Đóng gói & phân phối (từ research Tauri 2.11)

> **Quyết định đã chốt: phân phối local trực tiếp (tải file / gửi installer), KHÔNG lên store, ưu tiên phương pháp FREE.**
> Lưu ý phân biệt 2 loại "ký" — đây là điểm hay nhầm:
>
> | Loại ký | Free? | Mục đích |
> |---|---|---|
> | **Tauri updater signing** (minisign) | ✅ Free | **Bắt buộc** để auto-update chạy. Tự sinh keypair, không liên quan OS. |
> | **OS code signing / notarization** | 💰 Có phí | Chỉ để **gỡ cảnh báo doạ user lúc cài** (Gatekeeper / SmartScreen). |
>
> → **Build + cài + auto-update = free 100%.** Tiền chỉ cần nếu muốn gỡ cảnh báo lúc cài.

**Đường FREE (chốt cho M1–M5, dev + beta):**
- **macOS:** bundle `.app` + `.dmg`, ký ad-hoc (free). Hệ quả: máy khác báo **"App bị hỏng / Apple không kiểm tra được"** → hướng dẫn user **chuột phải → Open** (hoặc `xattr -dr com.apple.quarantine <app>`). Trông như lỗi nhưng vẫn chạy.
- **Windows:** NSIS (`-setup.exe`) không ký. Hệ quả: **SmartScreen "Unknown publisher"** → user bấm **More info → Run anyway**. Đỡ tệ hơn Mac.
- **Auto-update vẫn bật bình thường** (minisign free).

**Nâng cấp ký khi bán thật (trước M6 — tuỳ doanh thu):**
- **macOS: Apple Developer $99/năm + notarization** — **khuyên không skip khi launch bán**, vì cảnh báo "damaged" của Mac quá nặng, dễ mất khách lần đầu. Đây là khoản đáng chi nhất.
- **Windows: Azure Trusted Signing (~$10/tháng)** gỡ SmartScreen dần; hoặc EV cert (đắt + token HSM nhưng có uy tín ngay). Có thể hoãn lâu hơn Mac.
- ⚠️ Cert Windows OV mới (sau 06/2023) buộc HSM/cloud key — không ký bằng `.pfx` đơn giản nữa.

- **WebView2 (Windows):** đa số máy đã có sẵn. Mặc định `downloadBootstrapper` (+0MB, cần net lúc cài) là đủ; chỉ chọn `offlineInstaller`/`fixedVersion` nếu cần air-gap.
- **Auto-update:** `tauri-plugin-updater` 2.10.x, manifest JSON tĩnh + artifact ký minisign (free), host trên Cloudflare R2 (~$20/tháng, không cần backend) — đúng spec.
- **libheif (HEIC):** dependency C — phải verify đóng gói trên cả 2 OS ở M1. Đây là rủi ro đóng gói lớn nhất của stack imaging.
- **Bundled models ~160MB:** cân nhắc tải sau lần cài đầu (để installer nhẹ) thay vì nhồi hết vào installer — phù hợp triết lý "app nhẹ + update tách rời".

---

## 11. Khác biệt chính so với spec gốc (tóm tắt để review)

| # | Spec gốc | Đề xuất sửa | Lý do |
|---|---|---|---|
| 1 | Sharp via Node sidecar | Rust-native imaging stack | Tauri backend là Rust; nhanh hơn, gọn hơn, ít rủi ro đóng gói |
| 2 | ONNX Runtime **Web** | `ort` native ở Rust | CPU inference nhanh & ổn hơn nhiều |
| 3 | Tesseract.js / opencv.js (WASM) | Rust binding / `imageproc` | Hiệu năng + ổn định |
| 4 | `.album` là 1 file | `.album` là thư mục package | Tách project JSON nhẹ khỏi cache nặng |
| 5 | (ngầm) MediaPipe qua ONNX | **Cần spike**: thay bằng model pose/face ONNX | MediaPipe không chạy thẳng qua ONNX |
| 6 | Render export ở webview | M1 webview → M2+ chuyển sang Rust | Chất lượng in + RAM ở 3543px |

> Các thay đổi này **tăng tỉ trọng Rust** → cần đảm bảo tuyển được dev Rust hoặc
> fullstack senior chịu học Rust (spec §7 mới chỉ ghi "Tauri + React + Konva + TS").
> Đây là đánh đổi của lựa chọn "hiệu năng tối đa". Nếu nhân sự Rust là rào cản,
> phương án B (giữ JS/WASM nhiều hơn) vẫn khả thi nhưng chậm hơn.

---

## 12. Ánh xạ Roadmap (spec §6) theo kiến trúc này

| Mốc | Spec | Việc kiến trúc trọng tâm |
|---|---|---|
| **M1** | Shell + Canvas + Import + Export JPG | Tauri 2.11 scaffold, capabilities/fs scope; Rust import+thumbnail+EXIF; Konva 1-Stage; export JPG (phương án B); **verify đóng gói libheif + signing pipeline sớm** |
| **M2** | Auto Layout 200 preset + Typography + Font + PDF | Layout engine JS; font scan Rust + dấu Việt; FontFace render; PDF; bắt đầu chuyển export sang Rust (A); **spike model pose/face ONNX** |
| **M3** | AI Copy Design Lite (color + matching) | `ort` sessions; MobileCLIP embeddings; Hungarian; color mood; channel progress |
| **M4** | Polish + anti-plagiarism + 50 layout VN | perturbation; tối ưu canvas/RAM; beta 5 studio |
| **M5** | Bugfix + perf + Smart Snippets | profiling; cache; ổn định |
| **M6** | Launch + onboarding + auto-update | updater + R2; docs; min-spec |

---

## 13. Quyết định

**Đã chốt:**
1. ✅ **Plan kiến trúc only** — chưa viết code.
2. ✅ **Hiệu năng tối đa → Rust-heavy** — ảnh + AI chạy Rust. Hệ quả: cần dev Rust (hoặc fullstack chịu học Rust). Chấp nhận đánh đổi tuyển dụng.
3. ✅ **HEIC cần ngay ở MVP** — phải xử lý đóng gói `libheif` (dep C trên Mac+Win) ngay từ M1. Đây là rủi ro đóng gói cần verify sớm nhất.
4. ✅ **Phân phối local trực tiếp, đường FREE** — không lên store, không ký trả phí ở giai đoạn dev/beta. Auto-update vẫn bật (minisign free). Nâng cấp notarize Mac ($99/năm) + ký Windows trước khi launch bán (M6), tuỳ doanh thu. Xem §10.

**Spike kỹ thuật (làm POC rồi mới chốt — KHÔNG chặn việc bắt đầu):**
5. **Model pose/face ONNX thay MediaPipe** — chọn BlazeFace? YOLO-pose-n? → spike ở M2.
6. **MobileCLIP ONNX** — xác minh bản ONNX sẵn có hay phải tự convert; fallback OpenCLIP.

**Đã có default (không cần quyết thêm):**
7. **Export render** — M1 dùng phương án B (webview), M2+ chuyển sang A (Rust). Xem §6.6.
```