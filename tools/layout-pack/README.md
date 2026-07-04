# Layout Pack Builder (hi-res, print-quality)

Album Studio bundles only a **light preview** of each layout (~2600px, text baked in)
so on-screen editing stays fast and the installer stays ~6MB. That preview is **too
soft to print large** (a 25×35 spread at 300 DPI needs ~5906px).

This tool produces the **hi-res layout pack**: full-resolution backgrounds with the
**text removed**. At export the app draws this crisp background, then re-renders the
text as **sharp vector** from the layout JSON + the user's font kho.

## Chạy

```bash
cd tools/layout-pack
./build-layout-pack.sh <thư_mục_PSD> <thư_mục_pack_output>

# ví dụ (bóc layout nguồn 25×35 trong repo):
./build-layout-pack.sh ../../source-layouts-25x35 ../../dist/layout-pack-25x35
```

Lần đầu tự tạo venv + cài `psd-tools/Pillow`.

## Kết quả (folder = "layout pack")

```
layout-pack/
├── layouts.json     # manifest (id + kích thước PSD)
└── lay-<N>.bg.jpg   # nền full-res, ĐÃ ẨN CHỮ (decoration only)
```

`id` khớp template trong app: `1 (11).psd` → `lay-11` (app đọc `lay-11.bg.jpg`).

## User dùng thế nào

1. Tải layout pack về máy.
2. Album Studio → **Xuất album** → **“Nạp layout in nét cao”** → trỏ tới folder pack.
3. App nhớ đường dẫn. Khi export: nền lấy bản hi-res, chữ render vector.

## Lưu ý

- **Cần kho font**: chữ render vector nên font trong layout phải có trong kho font
  đã import, nếu không chữ sẽ dùng font thay thế (app cảnh báo ở hộp thoại Xuất).
- Chưa nạp layout pack → app vẫn export được nhưng dùng nền preview (nhẹ, kém nét khi in to).
- Đổi cap độ phân giải: sửa `LONG_MAX` trong `build_layout_pack.py`.