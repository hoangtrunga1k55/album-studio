#!/usr/bin/env python3
"""Build an Album Studio *typo library* from PSD files.

Output layout (the app indexes it by CATEGORY = sub-folder name):

  <out>/<category>/typos.json        manifest: id, ratioWH, texts, deco flag
  <out>/<category>/<id>.preview.png  thumbnail shown in the Typo panel
  <out>/<category>/<id>.deco.png     decoration overlay (loaded when placed)

Input can be either

  a) one folder of PSDs        → --category is required (all go there), or
  b) a folder of sub-folders   → each sub-folder becomes a category (vn, korea,
     fashion…).

The app never parses PSD itself (heavy + needs fonts installed) — it only reads
this pre-processed library, and the fonts the typos reference must be INSTALLED
on the user's machine (Album Studio scans the OS font folders).

Usage:
  python build_typo_library.py --in <psd_root> --out <library_folder>
  python build_typo_library.py --in <psd_folder> --out <lib> --category vn
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

from psd_tools import PSDImage

from manifest import write_manifest

PREVIEW_MAX = 600   # px, long edge of the panel thumbnail
DECO_MAX = 1400     # px, long edge of the decoration overlay

_TRIM = r"^[\s'\"’‘“”]+|[\s'\"’‘“”]+$"


def clean_font(name: str | None) -> str | None:
    return re.sub(_TRIM, "", name) if name else name


def text_style(layer) -> dict:
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
        if "FillColor" in run:
            vals = run["FillColor"]["Values"]  # [a, r, g, b] 0..1
            r, g, b = (int(round(v * 255)) for v in vals[1:4])
            out["color"] = "#%02x%02x%02x" % (r, g, b)
    except Exception:
        pass
    return out


def norm_bbox(bbox, w: int, h: int) -> dict:
    left, top, right, bottom = bbox
    return dict(
        x=round(left / w, 4),
        y=round(top / h, 4),
        w=round((right - left) / w, 4),
        h=round((bottom - top) / h, 4),
    )


def collect_texts(layer, w: int, h: int, texts: list, type_layers: list) -> None:
    if getattr(layer, "kind", "") == "type":
        try:
            bbox = layer.bbox
        except Exception:
            bbox = None
        if bbox and bbox != (0, 0, 0, 0):
            entry = norm_bbox(bbox, w, h)
            entry.update(text_style(layer))
            texts.append(entry)
            type_layers.append(layer)
    if getattr(layer, "is_group", lambda: False)():
        for child in layer:
            collect_texts(child, w, h, texts, type_layers)


def resized_save(img, max_edge: int, path: str) -> None:
    scale = min(1.0, max_edge / max(img.size))
    if scale < 1.0:
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))))
    img.save(path)


def typo_id(path: str) -> str:
    base = os.path.splitext(os.path.basename(path))[0]
    return "typo-" + re.sub(r"[^A-Za-z0-9]+", "-", base).strip("-").lower()


def process_psd(path: str, out_dir: str) -> dict | None:
    tid = typo_id(path)
    try:
        psd = PSDImage.open(path)
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ {os.path.basename(path)}: mở PSD lỗi — {e}", file=sys.stderr)
        return None

    w, h = psd.width, psd.height
    if not w or not h:
        return None

    texts: list = []
    type_layers: list = []
    for layer in psd:
        collect_texts(layer, w, h, texts, type_layers)

    full = psd.composite()
    if full is None:
        print(f"  ✗ {tid}: composite rỗng", file=sys.stderr)
        return None
    resized_save(full.convert("RGBA"), PREVIEW_MAX, os.path.join(out_dir, f"{tid}.preview.png"))

    # decoration overlay = everything except the type layers
    for tl in type_layers:
        try:
            tl.visible = False
        except Exception:
            pass
    has_deco = False
    deco = psd.composite()
    if deco is not None:
        deco = deco.convert("RGBA")
        if deco.getbbox() is not None:
            resized_save(deco, DECO_MAX, os.path.join(out_dir, f"{tid}.deco.png"))
            has_deco = True

    print(f"  ✓ {tid} · {len(texts)} chữ{' · deco' if has_deco else ''}")
    return dict(id=tid, ratioWH=round(w / h, 3), texts=texts, deco=has_deco)


def main() -> int:
    ap = argparse.ArgumentParser(description="Đóng gói kho typo cho Album Studio.")
    ap.add_argument("--in", dest="src", required=True, help="Thư mục PSD (hoặc thư mục chứa các thư mục con = category)")
    ap.add_argument("--out", dest="out", required=True, help="Thư mục kho typo xuất ra")
    ap.add_argument("--category", help="Tên category khi --in chỉ là 1 thư mục PSD (vd: vn, korea, fashion)")
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        print(f"Không thấy thư mục nguồn: {args.src}", file=sys.stderr)
        return 2

    jobs: list[tuple[str, str]] = []
    if glob.glob(os.path.join(args.src, "*.psd")):
        jobs.append((args.category or "khac", args.src))
    for d in sorted(os.listdir(args.src)):
        sub = os.path.join(args.src, d)
        if os.path.isdir(sub) and glob.glob(os.path.join(sub, "*.psd")):
            jobs.append((d, sub))

    if not jobs:
        print(f"Không thấy file .psd nào trong {args.src}", file=sys.stderr)
        return 1

    total = 0
    fonts: set[str] = set()
    for cat, folder in jobs:
        out_dir = os.path.join(args.out, cat)
        os.makedirs(out_dir, exist_ok=True)
        psds = sorted(glob.glob(os.path.join(folder, "*.psd")))
        print(f"\n[{cat}] {len(psds)} PSD → {out_dir}")
        manifest = []
        for p in psds:
            entry = process_psd(p, out_dir)
            if entry:
                manifest.append(entry)
                for t in entry["texts"]:
                    if t.get("font"):
                        fonts.add(t["font"])
        with open(os.path.join(out_dir, "typos.json"), "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=1)
        total += len(manifest)
        print(f"[{cat}] xong {len(manifest)}/{len(psds)}")

    # the fonts these typos need — must be installed on the user's machine
    if fonts:
        with open(os.path.join(args.out, "fonts-can-cai.txt"), "w", encoding="utf-8") as f:
            f.write("\n".join(sorted(fonts)))
        print(f"\n  ⓘ {len(fonts)} font được dùng — xem fonts-can-cai.txt (user phải CÀI vào máy)")

    write_manifest(args.out, kind="typo")
    print(f"\n✓ Kho typo: {total} mẫu → {args.out}")
    print("  Mở app → ⚙ Cài đặt → 'Nạp kho typo…' → chọn thư mục này.")
    print("  Phát hành: python publish_pack.py --pack <thư mục này> --tag pack-typo-vN")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())