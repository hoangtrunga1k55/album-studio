#!/usr/bin/env python3
"""Build an Album Studio *layout pack* (hi-res, text-free backgrounds) from PSDs.

The app bundles only a light ~2600px preview of each layout (with text baked in)
for fast on-screen editing. For print-quality export it needs the full-resolution
background WITHOUT text — the text is re-rendered as sharp vector at export time
from the layout JSON + the user's font kho.

This tool produces, for every ``*.psd`` in the input folder, into the output:

  <id>.bg.jpg     full-res composite with all text layers hidden (decoration only)
  layouts.json    manifest (ids + size)

``<id>`` matches the app's template id file part: ``1 (11).psd`` -> ``lay-11``.
Ship the output folder as the downloadable layout pack; users point Album Studio
to it (Export dialog -> "Nạp layout in nét cao").

Usage:
  python build_layout_pack.py --in <psd_folder> --out <pack_folder>
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

LONG_MAX = 6000  # px cap for the long edge (300 DPI for a 50cm spread ≈ 5906px)
JPEG_QUALITY = 88


def template_id(psd_path: str) -> str:
    """`1 (11).psd` -> `lay-11`; fall back to a sanitized basename."""
    base = os.path.splitext(os.path.basename(psd_path))[0]
    m = re.search(r"\((\d+)\)", base)
    if m:
        return f"lay-{m.group(1)}"
    return "lay-" + re.sub(r"[^A-Za-z0-9]+", "-", base).strip("-")


def hide_text_layers(layer) -> None:
    if getattr(layer, "kind", "") == "type":
        try:
            layer.visible = False
        except Exception:
            pass
    if getattr(layer, "is_group", lambda: False)():
        for child in layer:
            hide_text_layers(child)


def process_psd(path: str, out_dir: str) -> dict | None:
    tid = template_id(path)
    try:
        psd = PSDImage.open(path)
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ {os.path.basename(path)}: mở PSD lỗi — {e}", file=sys.stderr)
        return None

    w, h = psd.width, psd.height
    for layer in psd:
        hide_text_layers(layer)

    img = psd.composite()
    if img is None:
        print(f"  ✗ {tid}: composite rỗng", file=sys.stderr)
        return None

    # Flatten onto white (layouts are opaque; JPEG has no alpha).
    if img.mode in ("RGBA", "LA") or (img.mode == "P" and "transparency" in img.info):
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
        img = bg
    else:
        img = img.convert("RGB")

    scale = min(1.0, LONG_MAX / max(img.size))
    if scale < 1.0:
        img = img.resize((int(img.width * scale), int(img.height * scale)))

    img.save(os.path.join(out_dir, f"{tid}.bg.jpg"), "JPEG", quality=JPEG_QUALITY)
    print(f"  ✓ {tid} · {img.width}x{img.height}px")
    return dict(id=tid, w=w, h=h)


def main() -> int:
    ap = argparse.ArgumentParser(description="Build an Album Studio hi-res layout pack.")
    ap.add_argument("--in", dest="src", required=True, help="Folder of layout *.psd files")
    ap.add_argument("--out", dest="out", required=True, help="Output folder for the pack")
    args = ap.parse_args()

    if not os.path.isdir(args.src):
        print(f"Không thấy thư mục nguồn: {args.src}", file=sys.stderr)
        return 2
    os.makedirs(args.out, exist_ok=True)

    psds = sorted(glob.glob(os.path.join(args.src, "*.psd")))
    if not psds:
        print(f"Không có file .psd nào trong {args.src}", file=sys.stderr)
        return 1

    print(f"Đang bóc nền hi-res (no-text) {len(psds)} layout → {args.out}")
    manifest = []
    for path in psds:
        entry = process_psd(path, args.out)
        if entry:
            manifest.append(entry)

    with open(os.path.join(args.out, "layouts.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Xong: {len(manifest)}/{len(psds)} nền → {args.out}/layouts.json")
    if len(manifest) < len(psds):
        print(f"  ({len(psds) - len(manifest)} file lỗi — xem cảnh báo phía trên)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())