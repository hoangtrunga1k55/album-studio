# Báo cáo Phase "SmartAlbum Base" — Album Studio v0.2

**Ngày:** 09/07/2026 · **Bản build:** v0.2.2 · **Người thực hiện:** Trung (+ AI pair-programming)
**Tài liệu gốc đối chiếu:** `SmartAlbum_Phan_Tich_Chi_Tiet.docx` (nghiên cứu Pixellu SmartAlbum, 18 chương)

## 1. Mục tiêu phase

Xây **project mới (`app2/`)** mô phỏng SmartAlbum cả UI lẫn chức năng làm nền sản phẩm,
đồng thời giữ toàn bộ tính năng riêng đã có (kho font Việt, typo, layout Tizino, export in nét).
Nền tảng: Tauri 2 (Rust) + React + Konva — app nhẹ ~6–7MB, chạy offline hoàn toàn, dữ liệu ở máy user.

## 2. Bảng đối chiếu theo chương tài liệu

| Chương doc | Nội dung | Trạng thái | Đã làm trong app |
|---|---|---|---|
| **§3** Khởi tạo project | New Album, chọn khổ, số trang, lưu file, backup | ✅ 100% | Welcome + wizard (tên, khổ preset **25×35/30×30** + **custom W×H theo cm/inch/px** quy đổi tự động); file `.album` tạo ngay trên máy; **autosave 1.5s**; **backup xoay vòng 5 bản mỗi 5 phút** (`.backup-1..5`, mở lại để khôi phục); trường **số spread ban đầu** (mặc định 10 = 20 trang chuẩn lab); danh sách project gần đây |
| **§4** Import & quản lý ảnh | Panel Photos, sort/filter, rating, label, reject | ✅ 100% | Import file lẻ + **cả thư mục**; sort ngày EXIF/tên/sao; filter Tất cả/Đã dùng/Chưa dùng/★/Loại + **lọc theo 4 nhãn màu**; slider cỡ thumbnail 80–200px; **rating 1–5** (phím số), **nhãn màu 6–9**, **loại X**; badge số lần dùng; thumbnail nguyên ảnh không crop; chọn nhiều (Cmd/Shift); tất cả lưu vào file project |
| **§5** Auto Design | 1 nút ra cả album | ✅ 100% | Dialog **⌘D**: nguồn ảnh (tất cả/đang chọn/có sao), thứ tự (thời gian/tên), mật độ Thưa/Cân/Dày, **% spread full-bleed** — ảnh gắn sao ★ được ưu tiên vào spread 1-ảnh; ước lượng số spread trước khi chạy |
| **§6** Chỉnh sửa spread | Menu chuột phải, swap, crop, margin | ✅ 100% | Menu ô ảnh: **đặt làm nền full-bleed**, xoay 90°, lật ngang/dọc, lấp đầy/vừa khít, đặt lại, gỡ; menu spread: **redesign ⌘⇧D**, ±1 ô, nhân đôi, thêm sau, xoá, lưu mẫu; **kéo-thả 3 loại** (panel→ô, panel→spread nhiều ảnh, **ô↔ô đổi chỗ** có ghost); double-click = chế độ crop (pan/zoom); margin + padding + áp dụng cả album; **khung ảnh chỉnh tự do 8 tay kéo như text + xoay 360°** (icon ↻, hít góc 45°) |
| **§7** Spread Designer | Chế độ thiết kế thủ công | ✅ 100% | Tool **vẽ khung ảnh mới** trên canvas; **thước cm + guides kéo thả (⌘R)** + snap vào guide/mép/tâm; nhập **toạ độ X/Y/W/H chính xác theo cm**; **"Lưu layout thành mẫu"** → thư viện Mẫu của tôi dùng lại được |
| **§8** Layout Library | Thư viện layout | ✅ | Gallery **3 tab**: **Cơ bản** (18 layout khung trơn tự sinh 1–8 ô, chạy mọi khổ — không copy layout SmartAlbum) · **Tizino** (15 layout bóc từ PSD độc quyền, còn 23 PSD chưa bóc) · **Mẫu của tôi** (user lưu); SPACE xoay vòng layout cùng số ô |
| **§9** Typography | Điểm yếu của SmartAlbum | ✅ **vượt** | Đây là lợi thế của ta: **kho 5168 font Việt** (index + nạp theo nhu cầu, khớp tên PostScript), chữ template sửa trực tiếp (đúng font gốc, cỡ chuẩn từ PSD), typo pack chèn/resize/đổi màu/**xoay 360°**, chữ kéo-giãn-**xoay tự do**, thêm chữ mới, snippet câu Việt — SmartAlbum không làm được mảng này |
| **§10** Quality check | Cảnh báo in ấn | ✅ 100% | **Bleed** khung đỏ 3mm (⌘B) · **gutter gáy** dải mờ 12mm giữa spread · **cảnh báo DPI thấp** (⚠ vàng <200, đỏ <150, tính theo cỡ in thật + zoom, cập nhật trực tiếp) |
| **§11** SmartProofing | Khách duyệt online | ⏸ chưa | Cần server/cloud — đề xuất làm sau khi chốt hạ tầng (có thể tích hợp Zalo — lợi thế local mà SmartAlbum không có) |
| **§12** Export | Xuất file in | ✅ 100% | **Preset 5 lab VN** (Hồng Quân, WhiteHouse, Saigon Lab, Hùng Hương 5mm, Hà Nội Lab) tự set DPI+bleed; JPG theo **spread** hoặc **trang đơn** (tự cắt đôi); PDF; DPI 150–600; **bleed thật 0/3/5mm + crop marks**; quality 80–100; **layout pack in nét cao** (nền full-res + chữ vector) |
| **§13** Cloud sync | | ⏸ chưa | Chiến lược local-first (đúng khoảng trống 2 của doc — studio VN sợ subscription khoá file) |
| **§14** Shortcuts | Phím tắt | ✅ 100% | ⌘N/⌘O/⌘S/⌘D/⌘⇧D/⌘E/⌘B/⌘R/⌘+/⌘−/⌘0/Space/PgUp-PgDn/←→/1–5/6–9/0/X/Enter/Esc — đủ bảng §14.1 · trên Windows toàn bộ ⌘ = **Ctrl** (tooltip tự hiển thị đúng theo hệ điều hành) |

**Tổng:** 10/12 chương chức năng làm được offline đã hoàn thành 100%; 2 chương (§11, §13) cần hạ tầng server, chủ động để sau.

## 3. Ngoài tài liệu — tính năng riêng đã tích hợp sẵn

- **Kho font Việt 5168 font** — quét thư mục 1 lần, nạp theo nhu cầu, khớp font PSD tự động (khoảng trống 1 của doc)
- **Typo pack** (bóc từ PSD kho typo) — chèn, kéo, resize, đổi màu, chữ vector sắc nét
- **Layout pack in nét cao** — nền full-res 300DPI + chữ render vector khi xuất
- **Khổ tuỳ chỉnh** đúng cm thật từ thiết kế đến file in (SmartAlbum Custom Lab tương đương)
- Toàn bộ **tiếng Việt**, chạy **offline**, **không subscription** (khoảng trống 2)

## 4. Chưa làm (roadmap tiếp)

| Hạng mục | Ghi chú |
|---|---|
| AI Copy Design (§4.5 spec LIORE) | USP chính — bóc style từ album mẫu; cần pipeline CV/ONNX |
| Bìa album (cover) | Khổ riêng + gáy; cần thiết trước khi giao khách thật |
| SmartProofing (§11) | Cần server; cơ hội tích hợp Zalo |
| Bóc nốt 23/38 PSD layout Tizino | Chạy tool sẵn có, thêm dần |
| Ký số app (Mac notarize / Win cert) | Trước launch chính thức — hiện cài được nhưng OS cảnh báo |
| HEIC trên Windows | Mac đọc HEIC OK; Windows tạm dùng JPG/PNG |

## 5. Bản build để test

| Nền tảng | File | Nguồn |
|---|---|---|
| **Windows 10/11 x64** | `Album Studio 2_x64-setup.exe` (bản mới nhất) | https://github.com/hoangtrunga1k55/album-studio/releases/latest |
| macOS (Apple Silicon) | `Album Studio 2_0.2.0_aarch64.dmg` | build local (`app2/src-tauri/target/release/bundle/dmg/`) |

**Setup test (1 lần):** cài app → trỏ 3 thư mục do team cấp: ① kho font (tab Font) ② typo pack (tab Typo) ③ layout pack in nét (hộp thoại Xuất album). App nhớ vĩnh viễn.

**Lưu ý khi cài:** app chưa ký số → Windows SmartScreen bấm *More info → Run anyway*; Mac chuột phải → *Open*.

## 6. Kịch bản test đề xuất cho leader (15 phút)

1. Tạo album mới → thử khổ **custom** (vd 28×30cm, đổi đơn vị inch/px) → số spread 10.
2. Import 1 thư mục ~50 ảnh → chấm sao 5 cho 5 ảnh đẹp (phím 5) → gán nhãn màu (6–9) → lọc thử.
3. **⌘D** Auto Design: Dày + 40% full-bleed → kiểm tra ảnh 5★ nằm spread 1-ảnh-lớn.
4. Duyệt spread (PgUp/PgDn), **SPACE** đổi layout, kéo ảnh đổi chỗ giữa 2 ô, double-click crop.
5. Chuột phải ảnh → *Đặt làm nền*; chuột phải nền → *±1 ô*, *nhân đôi spread*.
6. Click chữ trên layout Tizino → sửa nội dung/đổi font từ kho → kéo/resize → **xoay bằng icon ↻** (hít 45°); xoay thử cả ô ảnh và typo.
7. **⌘R** bật thước → kéo guide → kéo khung ảnh thấy hít vào guide; vẽ khung mới (nút ＋); lưu layout thành mẫu → xem tab *Mẫu của tôi*.
8. **⌘B** xem bleed/gáy; kéo ảnh nhỏ vào ô to xem cảnh báo DPI.
9. **⌘E** xuất: preset *Hùng Hương* (bleed 5mm) + crop marks + JPG trang đơn + nạp layout pack → mở file kiểm tra nét, kích thước, vạch xén.
10. Đóng app mở lại → project trong *Gần đây*, mọi thứ (sao, nhãn, layout, chữ đã sửa) còn nguyên; kiểm tra file `.backup-N` sau 5 phút làm việc.