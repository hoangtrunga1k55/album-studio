# Báo cáo Phase "SmartAlbum Base" — Album Studio v0.7

**Ngày:** 19/07/2026 · **Bản build:** v0.7.1 · **Người thực hiện:** Trung (+ AI pair-programming)
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
| **§6** Chỉnh sửa spread | Menu chuột phải, swap, crop, margin | ✅ 100% | Menu ô ảnh: **đặt làm nền full-bleed**, xoay 90°, lật ngang/dọc, lấp đầy/vừa khít, đặt lại, gỡ; menu spread: **redesign ⌘⇧D**, ±1 ô, nhân đôi, thêm sau, xoá, lưu mẫu; **kéo-thả 3 loại** (panel→ô, panel→spread nhiều ảnh, **ô↔ô đổi chỗ** có ghost); double-click = chế độ crop (pan/zoom); margin + padding + áp dụng cả album; khung ảnh chỉnh tự do 8 tay kéo; **v0.3: panel Ảnh kiểu SmartAlbums** (xem mục 3) — xoay tự do bằng slider Góc, swap phím S |
| **§7** Spread Designer | Chế độ thiết kế thủ công | ✅ 100% | Tool **vẽ khung ảnh mới** trên canvas; **thước cm + guides kéo thả (⌘R)** + snap vào guide/mép/tâm; nhập **toạ độ X/Y/W/H chính xác theo cm**; **"Lưu layout thành mẫu"** → thư viện Mẫu của tôi dùng lại được |
| **§8** Layout Library | Thư viện layout | ✅ | **v0.3: dock layout kiểu SmartAlbums** — nút Layout mở dải ngang đẩy canvas xuống, tab **Tất cả/Cơ bản/Tizino/Mẫu của tôi**, **lọc theo số ảnh của spread**, **hover = xem trước trực tiếp trên spread**, click = áp dụng; **v0.6: kho Tizino có thumbnail, chia nhóm, lọc thêm theo khổ album, tự cập nhật từ GitHub Release** (xem mục 6); nguồn: Cơ bản (18 layout tự sinh 1–8 ô) · Tizino (37 mẫu 25×35 đã publish) · Mẫu của tôi; SPACE xoay vòng layout cùng số ô |
| **§9** Typography | Điểm yếu của SmartAlbum | ✅ **vượt** | Đây là lợi thế của ta: **kho 5168 font Việt** (index + nạp theo nhu cầu, khớp tên PostScript), chữ template sửa trực tiếp (đúng font gốc, cỡ chuẩn từ PSD), typo pack chèn/resize/đổi màu/**xoay 360°**, chữ kéo-giãn-**xoay tự do**, thêm chữ mới, snippet câu Việt — SmartAlbum không làm được mảng này |
| **§10** Quality check | Cảnh báo in ấn | ✅ 100% | **Bleed** khung đỏ 3mm (⌘B) · **gutter gáy** dải mờ 12mm giữa spread · **cảnh báo DPI thấp** (⚠ vàng <200, đỏ <150, tính theo cỡ in thật + zoom, cập nhật trực tiếp) |
| **§11** SmartProofing | Khách duyệt online | ⏸ chưa | Cần server/cloud — đề xuất làm sau khi chốt hạ tầng (có thể tích hợp Zalo — lợi thế local mà SmartAlbum không có) |
| **§12** Export | Xuất file in | ✅ 100% | **Preset 5 lab VN** (Hồng Quân, WhiteHouse, Saigon Lab, Hùng Hương 5mm, Hà Nội Lab) tự set DPI+bleed; JPG theo **spread** hoặc **trang đơn** (tự cắt đôi); PDF; DPI 150–600; **bleed thật 0/3/5mm + crop marks**; quality 80–100; **layout pack in nét cao** (nền full-res + chữ vector) |
| **§13** Cloud sync | | ⏸ chưa | Chiến lược local-first (đúng khoảng trống 2 của doc — studio VN sợ subscription khoá file) |
| **§14** Shortcuts | Phím tắt | ✅ 100% | ⌘N/⌘O/⌘S/⌘D/⌘⇧D/⌘E/⌘B/⌘R/⌘+/⌘−/⌘0/Space/PgUp-PgDn/←→/**⟨ ⟩ chuyển spread**/1–5/6–9/0/X/**S đổi chỗ ảnh**/**Delete xoá ảnh chọn**/R/Enter/Esc — đủ bảng §14.1 · trên Windows toàn bộ ⌘ = **Ctrl** (tooltip tự hiển thị đúng theo hệ điều hành) |

**Tổng:** 10/12 chương chức năng làm được offline đã hoàn thành 100%; 2 chương (§11, §13) cần hạ tầng server, chủ động để sau.

## 3. Mới trong v0.3.0 — Workspace kiểu SmartAlbums (theo feedback leader)

Đại tu bố cục làm việc cho giống SmartAlbums, đối chiếu trực tiếp screenshot SmartAlbums:

- **Bố cục màn hình**: canvas nền xám sáng ở giữa (spread trắng nổi khối) · vùng **"Thả ảnh → nền tràn spread"** nét đứt bên trái · **spread kế tiếp thu nhỏ** bên phải (click chuyển, thả ảnh để thêm) · **khay ảnh nằm ngang dưới cùng** · dải spread ngay dưới canvas.
- **Wizard tạo album 2 bước / 1 modal**: bước 1 khổ (select + hình minh hoạ spread theo tỉ lệ; chọn *Tuỳ chỉnh* mới hiện đơn vị cm/inch/px, DPI, kích thước spread, vùng an toàn, trim) → bước 2 trang trí (màu nền, **viền quanh ảnh mm + màu**, **khoảng cách giữa ảnh mm**, bộ layout gợi ý). Toàn bộ lưu trong file `.album`, viền/khoảng cách áp dụng cả khi in.
- **Dock layout**: nút Layout mở dải mẫu ngang **đẩy canvas xuống** (không che), lọc theo số ảnh, **hover mẫu nào spread đổi thử theo mẫu đó**, click áp dụng, bấm lại đóng.
- **Click model tối giản**: click **ảnh** → panel Ảnh; click **nền spread** → panel Layout (đổi layout, vẽ khung, màu nền, khoảng cách, thêm chữ, chèn typo); click **khung trống** → panel Khung (X/Y/W/H cm); không chọn gì → panel ẩn, canvas rộng tối đa.
- **Panel Ảnh kiểu SmartAlbums**: preview **khung vàng cố định — kéo Scale ảnh phóng to phía sau**, kéo ảnh trong preview để chỉnh vị trí, lưới ⅓, **vạch đỏ trim**, slider **Scale 100–600%** + **Góc xoay ±180°** (nút × reset), xoay 90°/lật, **PPI hiệu dụng** (vàng khi <200), số lần dùng.
- **Khay ảnh**: xoá ảnh đã chọn khỏi album (nút/Delete — file gốc không mất); kéo cao/thấp khay; panel phải kéo rộng/hẹp (app nhớ kích thước).
- **Dải spread**: cuộn bằng kéo chuột/lăn/phím **⟨ ⟩**; badge tím "Spread N" trên canvas khớp thumbnail viền tím bên dưới; **kéo thumbnail đổi thứ tự spread**; card nét đứt cuối dải **"Thêm spread / thả ảnh vào đây"** (thả ảnh = tạo spread kèm ảnh luôn).

## 4. Mới trong v0.4.0 — Bìa album + công cụ chỉnh sửa chuyên sâu (theo feedback leader v0.3)

**Bìa album (mới hoàn toàn):**
- Album mới có **spread "Bìa" ghim ở vị trí đầu** — chỉnh sửa y hệt spread (thả ảnh, layout, chữ, typo, nền tràn); không xoá/không đổi vị trí được; đánh số Bìa, Spread 1, 2…
- **Khổ bìa 1 trang** (bìa trước) hoặc **2 trang** (bìa ôm trải trước + sau) — canvas và file in đổi kích thước theo, gáy giữa chỉ hiện bản 2 trang
- **Bộ layout bìa riêng** (5 mẫu cơ bản: tràn, giữa, chừa tiêu đề, mặt trước phải, bìa đôi) — không lẫn với layout spread; sẵn chỗ nạp pack bìa Tizino
- Album mới khởi tạo **trang trắng** (không ép layout) — thả ảnh vào mới tự chọn mẫu khớp số ảnh

**Chỉnh ảnh chuyên sâu (panel Ảnh):**
- **Tông màu: Sáng / Tương phản** (−100…+100) — xem trực tiếp trên spread + preview, in ra đúng như nhìn thấy
- Preview kiểu SmartAlbums: khung vàng cố định, kéo Scale ảnh phóng to phía sau, lưới ⅓, vạch đỏ trim, **PPI hiệu dụng** cảnh báo in mờ

**Sắp xếp & căn chỉnh (chế độ sửa layout — click nền spread):**
- **Thước cm đánh số** + kéo guide; **smart guides**: kéo khung tự hít vào tâm/¼/½/¾ trang và mép/tâm khung khác (vạch tím sáng lên)
- **Căn theo trang** (6 nút) + **khung mốc ⚓** (phím G): căn ảnh khác vào giữa/trên/dưới/trái/phải mốc
- **Arrange thống nhất**: ảnh/chữ/typo chung một hệ lớp — đưa chữ/typo xuống DƯỚI ảnh được; 4 lệnh (trên cùng/lên/xuống/dưới cùng)
- **Chế độ tập trung**: vào sửa layout thì 2 vùng bên + dải spread ẩn đi, nút ← Quay lại và ⭳ Lưu mẫu ở 2 góc

**Nhóm nhiều phần tử:**
- **Quây chuột (marquee)** hoặc Shift-click để gom ảnh/chữ/typo thành nhóm; chỉnh **Sáng/Tương phản/Phủ kín/Trọn ảnh cho cả nhóm**; di chuyển cả nhóm (trong chế độ sửa layout)

**Phân tách thao tác rõ ràng (quy tắc mới):** di chuyển vị trí khung = CHỈ trong chế độ sửa layout; bên ngoài = kéo ảnh đổi chỗ giữa các ô + chỉnh sửa cơ bản. Panel phải luôn hiển thị, nội dung theo thứ đang chọn.

**Khác:** ảnh đã dùng mờ đi trong khay (✓/số lần dùng); xoá ảnh chọn khỏi album (Delete); lăn chuột trên dải spread = chuyển từng spread; kéo thumbnail đổi thứ tự spread; xoá spread bằng Delete; fix nền full-bleed hiển thị đúng ở thumbnail.

## 5. Mới trong v0.5.0 — Font lấy trực tiếp từ máy tính + hoàn thiện

**Font — thay đổi cách bàn giao (quan trọng với leader):**
- App **không còn đóng gói font sẵn** và **không cần trỏ thư mục kho font** nữa. Thay vào đó app **tự quét thư mục font của hệ điều hành** khi khởi động (macOS `~/Library/Fonts`, Windows `C:\Windows\Fonts`, kể cả font cài riêng cho user).
- Cách dùng: **cài font pack Tizino vào máy** (Mac: kéo vào Font Book / `~/Library/Fonts`; Windows: chọn tất cả → chuột phải → *Install*) → mở app là dùng được ngay. Cài thêm font sau thì bấm **⟳ Quét lại font máy**.
- Tab **Font** làm lại: tìm kiếm, lọc **font có dấu tiếng Việt**, xem trước từng font, và **cảnh báo danh sách font mẫu chưa cài trên máy** để biết cần cài thêm gì.
- Lợi ích: font dùng chung với Photoshop/Illustrator trên cùng máy, không nhân bản kho font, bản cài app nhẹ hơn.

**Đơn vị in ấn:**
- **Viền quanh ảnh** và **khoảng cách giữa ảnh** đổi sang **pt** (chuẩn nhà in) — mặc định **viền 8pt · khoảng cách 12pt**; project cũ tự quy đổi.
- **Đường canh in ấn** (đỏ = mép xén, xanh = vùng an toàn) giờ **chỉnh được trong panel Layout** cho mọi khổ (trước chỉ đặt được ở wizard khổ tuỳ chỉnh).

**Thao tác & hiệu năng:**
- **Double-click bất kỳ đâu trên spread → vào chế độ sửa layout** (kể cả khi ảnh phủ kín toàn trang — trước không có chỗ để click).
- **Thu ảnh nền full-bleed về khung** (chuột phải hoặc panel) để thu nhỏ/chỉnh như ảnh thường.
- Trong chế độ sửa layout, **click ảnh có đủ bộ công cụ sửa ảnh** (Scale, góc xoay, tông màu…) chứ không chỉ khung.
- **Thước cm nằm sát mép vùng làm việc** (kiểu Photoshop) thay vì ôm mép trang.
- **Chuyển spread mượt hơn**: ảnh hiện ngay bằng bản nhẹ rồi thay bằng ảnh nét; ảnh của spread trước/sau được tải sẵn.
- Căn theo **khung mốc ⚓** làm lại đúng chuẩn: chỉ tịnh tiến một trục, trục kia giữ nguyên.

## 6. Mới trong v0.6.0 — Kho layout/typo có thumbnail + tự cập nhật từ xa

**Kho tài nguyên có ảnh xem trước, chia nhóm (thay cho layout đóng gói sẵn):**
- Trình chọn layout & typo giờ hiển thị **thumbnail thật của từng mẫu**, chia **nhóm (category)** theo tên thư mục khi đóng gói: layout `layout-25x35` / `layout-30x30` / `cover-25x35`…, typo `vn` / `korea` / `fashion`…
- Kho layout hiện dưới **một tab "Tizino"**, và **tự lọc theo khổ album** đang chọn (album 25x35 chỉ thấy mẫu 25x35) **và theo số ảnh của spread** (spread 2 ảnh chỉ thấy layout 2 ô) — giống hệt pool layout cơ bản.
- **Hover xem trước trực tiếp trên spread**, click mới áp dụng; ảnh và chữ mẫu của layout được nạp đúng vào ô, chữ render **vector sắc nét** (không phụ thuộc ảnh nền), sửa được ngay.
- Thumbnail đọc thẳng từ đĩa (asset protocol, tải lười) nên mở trình chọn nhẹ; file JSON "sịn" chỉ parse khi user thật sự chọn mẫu.

**Tự cập nhật kho từ GitHub Release (không cần cài lại app):**
- Kho đặt trên **GitHub Release + `manifest.json`** (mỗi file kèm SHA-256), repo `hoangtrunga1k55/album-studio-packs` (tag `pack-layout` / `pack-typo`). Trong app: **⚙ Cài đặt → dán link kho → ⟳ Cập nhật** — app **chỉ tải file đổi hash**, xoá file đã gỡ, không kéo lại toàn bộ.
- Admin cập nhật kho không phải build lại app: chỉ cần **train thêm layout/typo → đóng gói → đẩy lên release**, user bấm cập nhật là có mẫu mới.

**Album Pack Builder — app riêng để đóng gói & phát hành kho (repo `album-pack-builder`):**
- Công cụ build kho tách hẳn khỏi app chính thành **app desktop riêng** (Tauri + sidecar Python), bản cài double-click `.dmg`/`.exe` ở Releases — admin không cần Python/terminal.
- Mở app → dán token (lưu **OS keychain**) + repo → kéo thả thư mục PSD → **Build + Publish**: tự bóc **JSON ô ảnh + chữ, thumbnail, nền in 300DPI (đã tách chữ để render vector)** rồi đẩy lên GitHub Release; máy user bấm ⟳ Cập nhật là có mẫu mới.
- PSD nguồn tổ chức "**mỗi thư mục con = một nhóm**" (`source-layouts/layout-25x35/…`, `source-typos/vn/…`); nhóm quyết định khổ và bìa/spread trong app.
- Kho hiện tại (**65 layout + 6 typo**): `github.com/hoangtrunga1k55/album-studio-packs`.

## 7. Mới trong v0.7.0 — Hoàn thiện chỉnh sửa layout + Auto Build (theo feedback leader v0.6)

**Khoảng cách & sắp xếp chính xác (feedback gap 16pt):**
- **Gap hiển thị đúng như setup** — trước đây app cộng thêm khoảng đệm lên khoảng cách thiết kế sẵn của layout nên 8pt thành 16pt; nay ảnh lấp đầy khung, spacing là của layout.
- **Snap theo gap, vạch vàng**: kéo khung lại gần ảnh khác → hít đúng khoảng cách đã setup (vd 8pt) và hiện **vạch vàng** dễ canh; căn mép/tâm/lưới giữ guide tím như cũ.
- **Click ảnh chỉ còn 1 viền mảnh** (bỏ glow/viền chồng) — giao diện chọn giống SmartAlbums.

**Màn sửa layout kiểu SmartAlbums:**
- **Thanh công cụ** giữa mép trên: Chọn · Vẽ khung · Thêm chữ · **Bàn tay** (kéo vùng nhìn) · **Kính lúp** (click phóng to, Alt+click thu nhỏ, chuột phải ra menu Fit / 100% / In / Out).
- **Phím tắt zoom cấp hệ điều hành**: ⌘/Ctrl +, −, 0 (vừa khung), 1 (**kích thước in thật**) — đăng ký native (menu "Xem" trên macOS, hotkey trên Windows) nên **bộ gõ tiếng Việt không nuốt phím**.
- Bỏ chữ mẫu mặc định ("Mãi mãi bên nhau"…) và các nút trùng lặp ở panel phải.

**Chỉnh ảnh sâu hơn (per ảnh):** **Viền (pt + màu riêng) · Bo góc (pt) · Độ đục (%)** — hiển thị và **file in ra giống hệt** (bo góc cắt thật, viền vẽ ở 300DPI).

**Auto Design → "Auto Build" như SmartAlbums (⌘D):**
- 2 thẻ số xem trước: **số spread (× 2 trang)** và **khoảng ảnh mỗi spread**.
- Slider **số spread mong muốn** (biên tự tính theo số ảnh); nhóm ảnh **Thông minh** hoặc **tự chọn khoảng bằng slider 2 đầu** kèm preset **Thưa (1–2) / Cân (3–4) / Dày (5–8)**.
- **Mức lặp layout**: Thấp (đa dạng nhất) / Vừa / Cao — thuật toán phạt điểm layout đã dùng.
- Đang import ảnh thì **Auto Design tự khoá** đến khi nạp xong (hết cảnh số nhảy loạn).

**Xuất album như SmartAlbums:** mọi lựa chọn thành **select** gọn; thêm **phạm vi xuất** (`1,2,5-7`), **kèm/không kèm bìa**, **JPG trang đơn** (bìa 1 trang không bị cắt đôi); **tên file giữ số spread gốc** (xuất 5–7 ra `Spread_05..07` — lab in lại khớp số ngay).

**Menu bar chuẩn desktop (macOS & Windows):**
- **Tệp**: Dự án mới (⌘/Ctrl+N) · Mở dự án (⌘/Ctrl+O) · **Mở gần đây** (danh sách project, tự cập nhật) · Lưu (⌘/Ctrl+S) · **Lưu thành bản sao** (⌘/Ctrl+Shift+S — Save As).
- **Xem**: Phóng to / Thu nhỏ / Vừa khung / 100% kích thước in thật. macOS thêm menu **Sửa** (Hoàn tác, Làm lại, Cut/Copy/Paste).

**Undo / Redo toàn app (mới):** **⌘Z / ⌘⇧Z** (Windows: Ctrl+Z / Ctrl+Y) hoàn tác **mọi thao tác thiết kế** — áp layout, di khung, thả/xoá ảnh, chữ, typo, sắp lớp, thêm/xoá spread…; một lần kéo slider = một bước undo; giữ 50 bước; trong ô nhập chữ ⌘Z vẫn là undo gõ chữ.

**Trải nghiệm:** **tooltip đẹp hiện nhanh** trên mọi icon (thay tooltip chậm của hệ điều hành); **phím tắt Mac ↔ Windows đã rà tương đương 100%** (kể cả khi bật bộ gõ tiếng Việt).

**Sửa lỗi:** nhân đôi spread rồi click ảnh không còn nhảy nhầm vào chế độ sửa layout / dính ghost kéo-thả; **Delete xoá spread hết bị "câm"** khi khay ảnh còn selection (chọn trên canvas tự bỏ chọn khay), Delete xoá được khung vẽ tay trong layout mode; **panel chỉnh sửa bên phải đóng/mở được** (nhớ trạng thái, canvas tự căn lại); tab **"Tất cả"** trong danh sách layout gộp cả kho Tizino với hover preview.

## 7b. Ngoài tài liệu — tính năng riêng đã tích hợp sẵn

- **Kho font Việt** — cài vào máy, app tự nhận và khớp tên font PSD tự động (khoảng trống 1 của doc)
- **Typo pack** (bóc từ PSD kho typo) — chèn, kéo, resize, đổi màu, chữ vector sắc nét
- **Layout pack in nét cao** — nền full-res 300DPI + chữ render vector khi xuất
- **Khổ tuỳ chỉnh** đúng cm thật từ thiết kế đến file in (SmartAlbum Custom Lab tương đương)
- Toàn bộ **tiếng Việt**, chạy **offline**, **không subscription** (khoảng trống 2)

## 8. Chưa làm (roadmap tiếp)

| Hạng mục | Ghi chú |
|---|---|
| AI Copy Design (§4.5 spec LIORE) | USP chính — bóc style từ album mẫu; cần pipeline CV/ONNX |
| SmartProofing (§11) | Cần server; cơ hội tích hợp Zalo |
| Train thêm layout 30x30 + typo korea/fashion | Đã có quy trình + thư mục nguồn sẵn; đổ PSD vào là đóng gói được |
| Ký số app (Mac notarize / Win cert) | Trước launch chính thức — hiện cài được nhưng OS cảnh báo |
| HEIC trên Windows | Mac đọc HEIC OK; Windows tạm dùng JPG/PNG |

## 9. Bản build để test

| Nền tảng | File | Nguồn |
|---|---|---|
| **Windows 10/11 x64** | `Album Studio 2_0.7.1_x64-setup.exe` | https://github.com/hoangtrunga1k55/album-studio/releases/latest |
| macOS (Apple Silicon) | `Album Studio 2_0.7.1_aarch64.dmg` | build local (`app2/src-tauri/target/release/bundle/dmg/`) |

**Setup test (1 lần):**
1. **Cài font pack Tizino vào máy** (Mac: Font Book / kéo vào `~/Library/Fonts` · Windows: chọn tất cả file font → chuột phải → *Install*) — app tự nhận, không cần trỏ folder.
2. Cài app → **⚙ Cài đặt → dán link kho layout/typo → ⟳ Cập nhật** (link: `.../releases/tag/pack-layout` và `.../tag/pack-typo`). App tải thumbnail + mẫu về máy, nhớ vĩnh viễn; lần sau chỉ tải phần đổi.

**Lưu ý khi cài:** app chưa ký số → Windows SmartScreen bấm *More info → Run anyway*; Mac chuột phải → *Open*.

## 10. Kịch bản test đề xuất cho leader (15 phút)

1. Tạo album mới — **wizard 2 bước**: bước 1 chọn khổ (thử *Tuỳ chỉnh* xem DPI/đơn vị/kích thước spread/vùng an toàn/trim) → bước 2 giữ mặc định **viền 8pt · khoảng cách 12pt** → tạo. Album mới có **spread Bìa** ghim đầu (thử đổi 1 trang / 2 trang).
2. Import 1 thư mục ~50 ảnh vào **khay ngang dưới** → chấm sao 5 (phím 5) → nhãn màu (6–9) → lọc; thử **kéo mép trên khay** cho cao lên, chọn vài ảnh bấm **Xoá** thử.
3. **⌘D** Auto Design: Dày + 40% full-bleed → ảnh 5★ nằm spread 1-ảnh-lớn.
4. Duyệt spread bằng phím **⟨ ⟩** — badge tím trên canvas khớp thumbnail viền tím dưới; **kéo thumbnail đổi thứ tự spread**; kéo ảnh thả vào card nét đứt *"Thêm spread"* cuối dải.
5. Bấm nút **Layout** trên topbar → dock mẫu trượt xuống. Tab **Tizino** hiện **thumbnail thật**, đã lọc theo khổ album + số ảnh của spread; **hover từng mẫu xem spread đổi thử trực tiếp** (ảnh vào đúng ô, chữ mẫu hiện dạng vector), click áp dụng, bấm Layout đóng.
6. **Click nền spread** → panel Layout (đổi màu nền, khoảng cách, thêm chữ, chèn typo); **click ảnh** → panel Ảnh: kéo **Scale** xem ảnh phóng to sau khung vàng đứng yên, kéo ảnh trong preview chỉnh vị trí, kéo **Góc xoay**, xem **PPI hiệu dụng** đổi vàng khi zoom sâu; phím **S** đổi chỗ 2 ảnh.
7. Mở tab **Font**: xem app đã nhận font đã cài trên máy (tìm kiếm, lọc *Có dấu*); nếu có cảnh báo **font mẫu chưa cài** thì cài thêm rồi bấm *Quét lại*. Click chữ trên layout Tizino → sửa nội dung/đổi font → kéo/resize/xoay ↻.
8. **⌘R** thước + guides; vẽ khung mới (panel Layout → *Vẽ khung*); lưu layout thành mẫu → dock tab *Mẫu của tôi*; **⌘B** bleed/safe/gáy.
9. Thử **double-click vào ảnh phủ kín trang** → vào chế độ sửa layout; chuột phải → *Thu ảnh nền về khung*. **⌘E** xuất: preset *Hùng Hương* (bleed 5mm) + crop marks + JPG trang đơn + nạp layout pack → kiểm tra **viền ảnh 8pt** ra đúng trên file in.
10. Đóng app mở lại → project trong *Gần đây*, mọi thứ còn nguyên (kể cả settings wizard, thứ tự spread mới, kích thước panel đã kéo).