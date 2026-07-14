#!/usr/bin/env python3
"""Build an Album Studio *layout library* from PSD files.

Output layout (the app indexes it by CATEGORY = sub-folder name):

  <out>/<category>/<id>.json        slots + texts (normalized 0..1)  ← file "sịn"
  <out>/<category>/<id>.thumb.jpg   small preview shown in the picker
  <out>/<category>/<id>.bg.jpg      full-res plate: background + decoration ONLY
                                    (no text, no photo placeholders — the app
                                    draws the user's photos and vector text there)

A category folder starting with ``cover``/``bia`` is treated as a COVER layout
by the app (only offered on the cover spread); everything else is a spread
layout. Input can be either

  a) one folder of PSDs        → --category is required (all go there), or
  b) a folder of sub-folders   → each sub-folder becomes a category.

Usage:
  python build_layout_library.py --in <psd_root> --out <library_folder>
  python build_layout_library.py --in <psd_folder> --out <lib> --category layout-25x35
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

from PIL import Image
from psd_tools import PSDImage

from manifest import write_manifest

BG_MAX = 4000      # px, long edge of the hi-res print plate
THUMB_MAX = 520    # px, long edge of the picker thumbnail
JPEG_Q_BG = 88
JPEG_Q_THUMB = 82

_TRIM = r"^[\s'\"’‘“”]+|[\s'\"’‘“”]+$"


def clean_font(name: str | None) -> str | None:
    return re.sub(_TRIM, "", name) if name else name


def layout_id(psd_path: str) -> str:
    """`1 (11).psd` -> `lay-11`; else a sanitized basename."""
    base = os.path.splitext(os.path.basename(psd_path))[0]
    m = re.search(r"\((\d+)\)", base)
    if m:
        return f"lay-{m.group(1)}"
    return re.sub(r"[^A-Za-z0-9]+", "-", base).strip("-").lower() or "lay"


def is_up_to_date(psd_path: str, out_dir: str) -> bool:
    """A layout is cached when its JSON + plate exist and are newer than the PSD,
    so a re-run only rebuilds mẫu mới / mẫu vừa sửa (much faster)."""
    lid = layout_id(psd_path)
    outs = [os.path.join(out_dir, f"{lid}.json"), os.path.join(out_dir, f"{lid}.bg.jpg")]
    if not all(os.path.isfile(o) for o in outs):
        return False
    src_mtime = os.path.getmtime(psd_path)
    return all(os.path.getmtime(o) >= src_mtime for o in outs)


def iter_layers(layer):
    yield layer
    if getattr(layer, "is_group", lambda: False)():
        for child in layer:
            yield from iter_layers(child)


def hide_layers(layer, drop: set[int]) -> None:
    """Hide every text layer + the layers that became photo slots, so the plate
    keeps only the background and decoration."""
    for l in iter_layers(layer):
        if getattr(l, "kind", "") == "type" or id(l) in drop:
            try:
                l.visible = False
            except Exception:
                pass


def text_style(layer) -> dict:
    """content + font + color + raw font size of a type layer's first run."""
    out: dict = {}
    try:
        out["content"] = layer.text
    except Exception:
        out["content"] = ""
    try:
        run = layer.engine_dict["StyleRun"]["RunArray"][0]["StyleSheet"]["StyleSheetData"]
        font_set = layer.resource_dict["FontSet"]
        idx = int(run.get("Font", 0))
        out["font"] = clean_font(str(font_set[idx]["Name"]))
        out["fontSizeRaw"] = float(run.get("FontSize", 0)) or None
        if "FillColor" in run:
            vals = run["FillColor"]["Values"]  # [a, r, g, b] 0..1
            r, g, b = (int(round(v * 255)) for v in vals[1:4])
            out["color"] = "#%02x%02x%02x" % (r, g, b)
    except Exception:
        pass
    return out


def is_photo_slot(layer) -> bool:
    """Smart-object / raster placeholders are the photo slots."""
    kind = getattr(layer, "kind", "")
    if kind in ("smartobject", "pixel", "shape"):
        name = (layer.name or "").lower()
        # skip obvious decoration/background layers
        if any(k in name for k in ("background", "bg", "deco", "logo", "frame line")):
            return False
        return True
    return False


def covers_canvas(box: dict) -> bool:
    """A layer spanning the whole page is the PSD's background, not a photo slot."""
    return (
        box["w"] >= 0.995
        and box["h"] >= 0.995
        and box["x"] <= 0.005
        and box["y"] <= 0.005
    )


def norm_box(layer, w: int, h: int) -> dict | None:
    try:
        x1, y1, x2, y2 = layer.bbox
    except Exception:
        return None
    if x2 <= x1 or y2 <= y1:
        return None
    return {
        "x": round(x1 / w, 5),
        "y": round(y1 / h, 5),
        "w": round((x2 - x1) / w, 5),
        "h": round((y2 - y1) / h, 5),
    }


def flatten_white(img: Image.Image) -> Image.Image:
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        rgba = img.convert("RGBA")
        bg.paste(rgba, mask=rgba.split()[-1])
        return bg
    return img.convert("RGB")


def resized(img: Image.Image, long_max: int) -> Image.Image:
    scale = min(1.0, long_max / max(img.size))
    if scale >= 1.0:
        return img
    return img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))))


def process_psd(path: str, out_dir: str) -> dict | None:
    lid = layout_id(path)
    try:
        psd = PSDImage.open(path)
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ {os.path.basename(path)}: mở PSD lỗi — {e}", file=sys.stderr)
        return None

    w, h = psd.width, psd.height
    if not w or not h:
        return None

    # ---- 1. metadata (slots + texts), normalized to 0..1
    slots, texts = [], []
    slot_layers: set[int] = set()  # placeholder layers → hidden in the plate
    for layer in psd:
        for l in iter_layers(layer):
            if getattr(l, "kind", "") == "type":
                box = norm_box(l, w, h)
                if not box:
                    continue
                st = text_style(l)
                fs_raw = st.pop("fontSizeRaw", None)
                item = {**box, **st}
                if fs_raw:
                    # true size as a fraction of canvas height (app renders with this)
                    item["fontSizeFrac"] = round(fs_raw / h, 5)
                texts.append(item)
            elif is_photo_slot(l):
                box = norm_box(l, w, h)
                if not box or box["w"] <= 0.04 or box["h"] <= 0.04:
                    continue
                if covers_canvas(box):
                    continue  # page background layer, not a slot
                box["ratioWH"] = round((box["w"] * w) / (box["h"] * h), 4)
                slots.append(box)
                slot_layers.add(id(l))

    if not slots:
        print(f"  ⚠ {lid}: không thấy ô ảnh nào (bỏ qua)", file=sys.stderr)
        return None

    data = {
        "canvas": {"w": w, "h": h, "ratioWH": round(w / h, 4)},
        "photoSlots": slots,
        "texts": texts,
    }
    with open(os.path.join(out_dir, f"{lid}.json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)

    # ---- 2. thumbnail WITH text (what the user recognises in the picker)
    full = psd.composite()
    if full is not None:
        thumb = resized(flatten_white(full), THUMB_MAX)
        thumb.save(os.path.join(out_dir, f"{lid}.thumb.jpg"), "JPEG", quality=JPEG_Q_THUMB)

    # ---- 3. hi-res plate: no text, no photo placeholders. The placeholders are
    # opaque blocks in the PSD; leaving them in paints black boxes under every
    # photo slot (and shows through wherever a slot is empty).
    for layer in psd:
        hide_layers(layer, slot_layers)
    plate = psd.composite()
    if plate is not None:
        bg = resized(flatten_white(plate), BG_MAX)
        bg.save(os.path.join(out_dir, f"{lid}.bg.jpg"), "JPEG", quality=JPEG_Q_BG)

    print(f"  ✓ {lid} · {len(slots)} ô · {len(texts)} chữ · {w}x{h}px")
    return {"id": lid, "slots": len(slots), "texts": len(texts)}


def main() -> int:
    ap = argparse.ArgumentParser(description="Đóng gói kho layout cho Album Studio.")
    ap.add_argument("--in", dest="src", required=True, help="Thư mục PSD (hoặc thư mục chứa các thư mục con = category)")
    ap.add_argument("--out", dest="out", required=True, help="Thư mục kho layout xuất ra")
    ap.add_argument("--category", help="Tên category khi --in chỉ là 1 thư mục PSD (vd: layout-25x35, cover-30x30)")
    ap.add_argument("--force", action="store_true", help="Build lại tất cả (bỏ qua cache, kể cả file chưa đổi)")
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        print(f"Không thấy thư mục nguồn: {args.src}", file=sys.stderr)
        return 2

    # Which (category, psd folder) pairs to process?
    jobs: list[tuple[str, str]] = []
    subdirs = [d for d in sorted(os.listdir(args.src)) if os.path.isdir(os.path.join(args.src, d))]
    root_psds = glob.glob(os.path.join(args.src, "*.psd"))
    if root_psds:
        cat = args.category or "layout"
        jobs.append((cat, args.src))
    for d in subdirs:
        if glob.glob(os.path.join(args.src, d, "*.psd")):
            jobs.append((d, os.path.join(args.src, d)))

    if not jobs:
        print(f"Không thấy file .psd nào trong {args.src}", file=sys.stderr)
        return 1

    total = 0
    skipped = 0
    for cat, folder in jobs:
        out_dir = os.path.join(args.out, cat)
        os.makedirs(out_dir, exist_ok=True)
        psds = sorted(glob.glob(os.path.join(folder, "*.psd")))
        print(f"\n[{cat}] {len(psds)} PSD → {out_dir}")
        ok = 0
        for p in psds:
            if not args.force and is_up_to_date(p, out_dir):
                ok += 1
                skipped += 1
                continue
            if process_psd(p, out_dir):
                ok += 1
        total += ok
        print(f"[{cat}] xong {ok}/{len(psds)}")

    if skipped and not args.force:
        print(f"\n(bỏ qua {skipped} mẫu chưa đổi — dùng --force để build lại tất cả)")

    write_manifest(args.out, kind="layout")
    print(f"\n✓ Kho layout: {total} mẫu → {args.out}")
    print("  Mở app → ⚙ Cài đặt → 'Nạp kho layout…' → chọn thư mục này.")
    print("  Phát hành: python publish_pack.py --pack <thư mục này> --tag pack-layout-vN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())