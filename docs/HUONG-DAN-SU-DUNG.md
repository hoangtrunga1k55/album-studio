# Album Studio — Hướng dẫn sử dụng

Tài liệu gồm 2 phần:
- **Phần A — Admin Tizino**: chuẩn bị thư viện, đóng gói & phát hành app.
- **Phần B — Người dùng (studio)**: cài đặt & sử dụng.

> Nguyên tắc: **app rất nhẹ (~6MB)**, KHÔNG nhồi font/typo/layout vào trong.
> Các "kho" này Tizino cấp riêng, người dùng trỏ app tới 1 lần (app tự nhớ).

---

# PHẦN A — ADMIN TIZINO

## A1. Ba "kho" cần cấp cho người dùng

| Kho | Là gì | Tạo bằng |
|-----|-------|----------|
| **Kho Font** | Bộ ~5000 font (đúng font thiết kế) | Có sẵn: `fonts-lib/5000+ FONT CHỮ` — nén lại gửi user |
| **Typo Pack** | Bộ chữ nghệ thuật chèn lên ảnh | `tools/typo-pack/build-typo-pack.sh` |
| **Layout Pack** | Nền layout **độ phân giải cao để in** | `tools/layout-pack/build-layout-pack.sh` |

App đã kèm sẵn **layout mẫu + 10 font cơ bản** để chạy thử, nhưng để dùng **đủ và in đẹp** thì cần 3 kho trên.

### Tạo Typo Pack (từ kho PSD typo)
```bash
cd tools/typo-pack
./build-typo-pack.sh <thư_mục_PSD_typo> <thư_mục_output>
# ví dụ:
./build-typo-pack.sh ../../typo ../../dist/typo-pack
```
Kết quả: folder chứa `typos.json` + ảnh preview/deco. **Gửi cả folder này cho user.**

### Tạo Layout Pack (nền in nét cao)
```bash
cd tools/layout-pack
./build-layout-pack.sh <thư_mục_PSD_layout> <thư_mục_output>
# ví dụ:
./build-layout-pack.sh ../../source-layouts-25x35 ../../dist/layout-pack-25x35
```
Kết quả: folder chứa `lay-*.bg.jpg` (nền full-res, đã ẩn chữ) + `layouts.json`.

> Cần cài Python 3. Lần đầu chạy script tự tạo môi trường (~1 phút).

## A2. Phát hành app

### macOS (.dmg)
Trên máy Mac có cài Rust + Node + pnpm:
```bash
cd app
pnpm install
pnpm tauri build
```
File ra: `app/src-tauri/target/release/bundle/dmg/Album Studio_x.y.z_aarch64.dmg`

### Windows (.exe) — qua GitHub Actions (không cần máy Windows)
Đẩy 1 tag phiên bản, GitHub tự build + tạo Release:
```bash
git tag v0.1.1
git push origin v0.1.1
```
Sau ~10 phút, file `.exe`/`.msi` xuất hiện tại:
`https://github.com/hoangtrunga1k55/album-studio/releases`

Muốn build thử không tạo Release: vào tab **Actions → Build Windows → Run workflow**.

## A3. Bộ giao cho người dùng
Đóng gói gửi user (qua Google Drive / USB):
1. **File cài**: `.dmg` (Mac) hoặc `.exe` (Windows).
2. **Kho Font** (folder, nén .zip).
3. **Typo Pack** (folder).
4. **Layout Pack** (folder).
5. File hướng dẫn (Phần B bên dưới).

## A4. Lưu ý phiên bản hiện tại
- App **chưa ký số** → máy user sẽ cảnh báo lần đầu (xem B1). Bình thường, vẫn cài được.
- Bản **Windows chưa đọc ảnh HEIC** (ảnh iPhone) — dùng JPG/PNG. Bản Mac đọc HEIC bình thường.

---

# PHẦN B — NGƯỜI DÙNG (STUDIO)

## B1. Cài đặt

### macOS
1. Mở file `.dmg` → kéo **Album Studio** vào thư mục **Applications**.
2. Lần đầu mở: **chuột phải** vào app → **Open** → **Open** (bỏ qua cảnh báo "chưa xác định nhà phát triển").

### Windows
1. Chạy file `.exe` (bộ cài).
2. Nếu hiện màn xanh "Windows protected your PC": bấm **More info → Run anyway**.
3. Cài xong mở app từ Start Menu.

## B2. Cấu hình lần đầu (chỉ làm 1 lần — app tự nhớ)

Tizino gửi bạn 3 folder: **Kho Font**, **Typo Pack**, **Layout Pack**. Copy vào máy rồi trỏ app tới:

| Kho | Trong app | Thao tác |
|-----|-----------|----------|
| **Font** | Panel trái → tab **Font** | Bấm **"Thêm thư mục font (kho)"** → chọn folder Kho Font |
| **Typo** | Panel trái → tab **Typo** | Bấm **"Thêm thư mục typo (kho)"** → chọn folder Typo Pack |
| **Layout in nét cao** | Nút **Xuất album** → mục "Layout in nét cao" | Bấm **"Nạp…"** → chọn folder Layout Pack |

> Nạp Font quan trọng nhất: nếu không, chữ trong thiết kế sẽ hiện sai kiểu.

## B3. Làm một cuốn album

1. **Tạo album** → chọn **khổ** (25×35 dọc — có sẵn nhiều layout).
2. **Chọn ảnh**: tab **Ảnh** → **Chọn ảnh** (chọn nhiều file cùng lúc).
   - **Số ảnh bạn chọn quyết định layout**: chọn 3 ảnh → app bốc layout 3 ô.
3. **Đổi layout**: nhấn phím **SPACE** để xoay vòng các layout cùng số ô.
4. **Nhiều trang (spread)**: dùng dải phim ở dưới để **thêm / xoá / chuyển** spread.
5. **Ảnh trong ô**:
   - Kéo thả ảnh từ panel vào ô.
   - **Cuộn chuột** = phóng to/thu nhỏ ảnh trong ô.
   - **Kéo** = chỉnh khung; **double-click** = đặt lại.
   - **Chuột phải** vào ô: Lấp đầy / Vừa khít / Đặt lại / Gỡ ảnh.
   - **R** = xáo trộn/đổi chỗ ảnh giữa các ô.
6. **Chỉnh chữ** (click vào chữ trên thiết kế):
   - Sửa **nội dung, font, màu, cỡ** ở panel phải.
   - **Kéo thân chữ** = di chuyển.
   - **8 tay kéo** quanh chữ: kéo **góc** = to/nhỏ giữ tỉ lệ; kéo **cạnh** = rộng/hẹp hoặc cao/thấp.
   - **↺ Khôi phục chữ gốc** = trả chữ về như thiết kế ban đầu.
7. **Chèn typo**: tab **Typo** → bấm mẫu để chèn lên spread → di chuyển & kéo resize như chữ.
8. **Auto Design**: chọn mật độ (Thưa/Cân/Dày) → **Auto Design** để app tự dàn cả album theo thứ tự thời gian ảnh.

## B4. Lưu & mở lại
- **Lưu**: nút **Lưu** (hoặc Cmd/Ctrl + S) → file `.album`.
- **Mở**: nút **Mở** (hoặc Cmd/Ctrl + O) → chọn file `.album`.

> File `.album` chỉ lưu thiết kế + đường dẫn ảnh (rất nhẹ). Đừng di chuyển/đổi tên ảnh gốc sau khi lưu.

## B5. Xuất album (để in)
1. Bấm **Xuất album** (hoặc Cmd/Ctrl + E).
2. Chọn **định dạng** (JPG / PDF / cả hai), **DPI 300** (để in), chất lượng.
3. (Khuyến nghị) mục **Layout in nét cao** → **Nạp** folder Layout Pack → nền + chữ in sắc nét.
4. Chọn thư mục lưu → **Xuất**. File ra trong `Export_YYYY-MM-DD/`.

## B6. Phím tắt

| Phím | Chức năng |
|------|-----------|
| **SPACE** | Đổi layout (cùng số ô) |
| **R** | Đổi chỗ / xáo ảnh |
| **← →** | Chuyển spread |
| **Delete** | Xoá phần đang chọn |
| **Esc** | Bỏ chọn / huỷ đổi chỗ |
| **Cmd/Ctrl + S** | Lưu |
| **Cmd/Ctrl + O** | Mở |
| **Cmd/Ctrl + E** | Xuất album |

## B7. Sự cố thường gặp

| Hiện tượng | Cách xử lý |
|-----------|-----------|
| Chữ hiện sai kiểu font | Chưa nạp Kho Font → tab **Font** → Thêm thư mục font |
| In ra nền/chữ bị mờ | Chưa nạp Layout Pack → hộp thoại Xuất → Nạp layout in nét cao; và chọn **DPI 300** |
| Không thấy typo nào | Chưa nạp Typo Pack → tab **Typo** → Thêm thư mục typo |
| Ảnh iPhone (.HEIC) không mở (Windows) | Bản Windows chưa hỗ trợ HEIC → chuyển ảnh sang JPG trước |
| Mac báo "không mở được vì chưa xác định nhà phát triển" | Chuột phải app → **Open** |
| Windows chặn (màn xanh SmartScreen) | **More info → Run anyway** |