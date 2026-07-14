# Đóng gói kho layout & typo (Album Studio v0.6+)

Hai script này biến PSD của Tizino thành **kho** mà Album Studio nạp trực tiếp:
app chỉ đọc **thumbnail + metadata** khi mở picker, file gốc (JSON/nền hi-res/
deco) chỉ đọc khi user thật sự chọn → kho vài nghìn mẫu vẫn nhẹ.

## Cài đặt (1 lần)

```bash
cd tools/pack-library
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## 1. Kho layout

**Nguồn**: thư mục PSD, chia sẵn theo nhóm (tên thư mục = category trong app):

```
psd-layout/
├── cover-25x35/    ← thư mục bắt đầu bằng "cover"/"bia" = layout BÌA
├── cover-30x30/
├── layout-25x35/
└── layout-30x30/
```

```bash
python build_layout_library.py --in psd-layout --out kho-layout
# hoặc 1 thư mục PSD phẳng:
python build_layout_library.py --in psd/ --out kho-layout --category layout-25x35
```

**Kết quả** (`kho-layout/<category>/`):

| File | Vai trò |
|---|---|
| `<id>.json` | slots + chữ (toạ độ chuẩn hoá 0–1) — **file sịn**, chỉ đọc khi click |
| `<id>.thumb.jpg` | ảnh preview (~520px) hiện trong picker |
| `<id>.bg.jpg` | nền full-res **đã ẩn chữ** — dùng khi xuất in nét cao |

Trong app: panel **Layout** → **Nạp kho layout…** → chọn `kho-layout/`.
Mỗi thư mục con thành một tab trong dock layout.

## 2. Kho typo

**Nguồn**: thư mục PSD chia theo nhóm (`vn`, `korea`, `fashion`…):

```bash
python build_typo_library.py --in psd-typo --out kho-typo
python build_typo_library.py --in psd/ --out kho-typo --category vn
```

**Kết quả** (`kho-typo/<category>/`): `typos.json` + `<id>.preview.png` +
`<id>.deco.png`, kèm `kho-typo/fonts-can-cai.txt` — **danh sách font mà user
phải cài vào máy** (app quét font hệ điều hành, không nạp font từ kho).

Trong app: panel **Layout** → **Nạp kho typo…** → chọn `kho-typo/`.

## Lưu ý

- Ô ảnh trong PSD = layer smart-object/pixel/shape; layer tên chứa
  `background`/`bg`/`deco`/`logo` bị bỏ qua (không tính là ô ảnh).
- Chữ trong PSD được bóc thành text vector (font, cỡ, màu) — user sửa được
  trong app, và khi in chữ render sắc nét từ font **đã cài trên máy**.
- Layout không có ô ảnh nào sẽ bị bỏ qua (thường là trang trí thuần).
## 3. Phát hành kho lên GitHub Release (user tự cập nhật)

Sau khi build kho (đã có `manifest.json` — hash SHA-256 từng file):

```bash
# cách 1: GitHub CLI
brew install gh && gh auth login
python publish_pack.py --pack kho-layout --tag pack-layout

# cách 2: token (không cần cài gì)
export GITHUB_TOKEN=ghp_...
python publish_pack.py --pack kho-layout --tag pack-layout --repo hoangtrunga1k55/album-studio
python publish_pack.py --pack kho-typo   --tag pack-typo   --repo hoangtrunga1k55/album-studio
```

Mỗi file của kho thành **một asset** của release (`layout-25x35/lay-6.json` →
`layout-25x35__lay-6.json`), kèm `manifest.json`.

**User cập nhật**: app → ⚙ Cài đặt → dán link release vào ô *Link kho trên mạng*
→ **⟳ Cập nhật**. App tải `manifest.json`, so hash với kho đang có, **chỉ tải
file mới/đã đổi**, xoá file đã gỡ. Lần sau bấm lại chỉ mất vài giây.

**Cập nhật kho**: thêm PSD → chạy lại `build_*_library.py` → chạy lại
`publish_pack.py` **cùng tag** (release được ghi đè). User bấm ⟳ là có mẫu mới.
