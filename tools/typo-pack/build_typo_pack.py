#!/usr/bin/env python3
"""Build an Album Studio *typo pack* from a folder of typo PSD files.

For every ``*.psd`` in the input folder it produces, into the output folder:

  <id>.preview.png   library thumbnail (full composite, incl. text)
  <id>.deco.png      decoration-only overlay (text layers hidden) — omitted if empty
  typos.json         manifest read by the app at runtime

The app never parses PSD itself (heavy + needs the fonts installed); it only
scans this pre-processed folder. Ship the output folder as the downloadable
typo pack that users point Album Studio to (Tab Typo → "Thêm thư mục typo").

Usage:
  python build_typo_pack.py --in <psd_folder> --out <pack_folder>
"""

from __future__ import annotations

import argparse
import glob
import json
import os
import re
import sys

from psd_tools import PSDImage

PREVIEW_MAX = 600   # px, long edge of the library thumbnail
DECO_MAX = 1400     # px, long edge of the decoration overlay

_TRIM = r"^[\s'\"’‘“”]+|[\s'\"’‘“”]+$"


def clean_font(name: str | None) -> str | None:
    """Strip stray quotes/whitespace PSD wraps around font names."""
    return re.sub(_TRIM, "", name) if name else name


def text_style(layer) -> dict:
    """Extract content + font + color from a type layer's first style run."""
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
            vals = run["FillColor"]["Values"]  # [a, r, g, b] in 0..1
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
    """Recurse the layer tree, gathering type layers + their normalized boxes."""
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
        img = img.resize((int(img.width * scale), int(img.height * scale)))
    img.save(path)


def process_psd(path: str, out_dir: str) -> dict | None:
    base = os.path.splitext(os.path.basename(path))[0]
    tid = f"typo-{base}"
    try:
        psd = PSDImage.open(path)
    except Exception as e:  # noqa: BLE001
        print(f"  ✗ {base}: mở PSD lỗi — {e}", file=sys.stderr)
        return None

    w, h = psd.width, psd.height
    texts: list = []
    type_layers: list = []
    for layer in psd:
        collect_texts(layer, w, h, texts, type_layers)

    # Preview: full composite (keeps the original text look).
    resized_save(
        psd.composite().convert("RGBA"), PREVIEW_MAX,
        os.path.join(out_dir, f"{tid}.preview.png"),
    )

    # Decoration overlay: hide every type layer, composite the rest.
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
    ap = argparse.ArgumentParser(description="Build an Album Studio typo pack from PSDs.")
    ap.add_argument("--in", dest="src", required=True, help="Folder of typo *.psd files")
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

    print(f"Đang bóc {len(psds)} typo PSD → {args.out}")
    manifest = []
    for path in psds:
        entry = process_psd(path, args.out)
        if entry:
            manifest.append(entry)

    with open(os.path.join(args.out, "typos.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=2)

    print(f"\n✓ Xong: {len(manifest)}/{len(psds)} typo → {args.out}/typos.json")
    if len(manifest) < len(psds):
        print(f"  ({len(psds) - len(manifest)} file lỗi — xem cảnh báo phía trên)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())