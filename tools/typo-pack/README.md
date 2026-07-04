# Typo Pack Builder

Chuyển kho **typo PSD** của Tizino/LIORE thành **typo pack** nhẹ để ship kèm Album Studio.

App không đọc PSD thô (nặng + cần cài font). Nó chỉ quét folder pack đã xử lý sẵn.
Chạy script này **1 lần** mỗi khi kho typo đổi, rồi ship folder output cho user.

## Chạy

```bash
cd tools/typo-pack
./build-typo-pack.sh <thư_mục_PSD> <thư_mục_pack_output>

# ví dụ (bóc folder typo mẫu trong repo):
./build-typo-pack.sh ../../typo ../../dist/typo-pack
```

Lần đầu script tự tạo venv + cài `psd-tools/Pillow/aggdraw` (mất ~1 phút).
Các lần sau chạy thẳng.

## Kết quả (folder output = "typo pack")

```
typo-pack/
├── typos.json            # manifest app đọc
├── typo-<name>.preview.png   # thumbnail thư viện (có chữ)
└── typo-<name>.deco.png      # lớp trang trí (ẩn chữ) — chỉ có nếu PSD có phần không phải chữ
```

- `id` mỗi typo = `typo-<tên file PSD>`.
- `typos.json` chứa vị trí + font + màu từng đoạn chữ → app render lại **chữ vector sửa được**
  (đổi font/màu/nội dung), miễn là user đã trỏ app tới **kho font** chứa các font đó.

## User dùng thế nào

1. Tải typo pack (folder output ở trên) về máy.
2. Mở Album Studio → tab **Typo** → **"Thêm thư mục typo (kho)"** → trỏ tới folder pack.
3. App nhớ đường dẫn, lần sau tự nạp.

## Lưu ý

- Font trong typo phải có trong **kho font** user đã import, thì chữ mới đúng kiểu.
  (Cùng cơ chế matching như font template — exact + normalized.)
- Muốn đổi độ phân giải thumbnail/deco: sửa `PREVIEW_MAX` / `DECO_MAX` trong `build_typo_pack.py`.