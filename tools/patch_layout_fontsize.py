#!/usr/bin/env python3
"""Patch layout JSONs with the *true* font size (`fontSizeFrac`).

The original extraction stored only `fontSizeRaw` (the engine base size) and a
bbox. But PSD text layers carry a transform scale, so the visual size is
`fontSizeRaw × transform.scale`. Without it the app had to guess size from the
bbox — which is loose (leading/wrapping) — so edited text jumped in size.

This reads each `lay-<N>.json` in the app assets, opens the matching source PSD
`1 (<N>).psd`, and writes `fontSizeFrac = fontSizeRaw × scale / canvasHeight`
onto every text (a resolution-independent fraction the app multiplies by the
render height). Idempotent — safe to re-run.

Usage:
  python patch_layout_fontsize.py --json <layouts_json_dir> --psd <psd_dir>
"""

from __future__ import annotations

import argparse
import glob
import json
import math
import os
import re
import sys

from psd_tools import PSDImage


def engine_font_size(layer) -> float | None:
    try:
        sr = layer.engine_dict["StyleRun"]["RunArray"][0]["StyleSheet"]["StyleSheetData"]
        return float(sr.get("FontSize", 0)) or None
    except Exception:
        return None


def collect_type_layers(layer, out: list) -> None:
    if getattr(layer, "kind", "") == "type":
        try:
            b = layer.bbox
        except Exception:
            b = None
        if b and b != (0, 0, 0, 0):
            fsraw = engine_font_size(layer)
            # Effective scale = magnitude of the transform's first column, so it
            # is correct whether the text is plain-scaled or rotated+scaled.
            try:
                t = layer.transform
                scale = math.hypot(float(t[0]), float(t[1]))
                if scale < 0.01:
                    scale = 1.0
            except Exception:
                scale = 1.0
            out.append({"fsraw": fsraw, "scale": scale})
    if getattr(layer, "is_group", lambda: False)():
        for child in layer:
            collect_type_layers(child, out)


def patch_one(json_path: str, psd_dir: str) -> tuple[int, int]:
    base = os.path.splitext(os.path.basename(json_path))[0]  # lay-11
    m = re.search(r"(\d+)$", base)
    if not m:
        return (0, 0)
    psd_path = os.path.join(psd_dir, f"1 ({m.group(1)}).psd")
    if not os.path.exists(psd_path):
        print(f"  ⚠ {base}: không thấy PSD {os.path.basename(psd_path)} — bỏ qua", file=sys.stderr)
        return (0, 0)

    data = json.load(open(json_path, encoding="utf-8"))
    texts = data.get("texts", [])
    if not texts:
        return (0, 0)

    psd = PSDImage.open(psd_path)
    H = psd.height
    layers: list = []
    for l in psd:
        collect_type_layers(l, layers)

    patched = 0
    aligned = len(layers) == len(texts)
    for i, t in enumerate(texts):
        eff = None
        if aligned and layers[i]["fsraw"]:
            eff = layers[i]["fsraw"] * layers[i]["scale"]
        else:
            # Fallback: match by closest engine fsraw to the stored fontSizeRaw.
            raw = t.get("fontSizeRaw")
            if raw:
                cand = [x for x in layers if x["fsraw"]]
                if cand:
                    best = min(cand, key=lambda x: abs(x["fsraw"] - raw))
                    eff = best["fsraw"] * best["scale"]
        if eff:
            t["fontSizeFrac"] = round(eff / H, 5)
            patched += 1

    json.dump(data, open(json_path, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    flag = "" if aligned else " (khớp theo fsraw)"
    print(f"  ✓ {base}: {patched}/{len(texts)} chữ{flag}")
    return (patched, len(texts))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", required=True, help="Thư mục chứa lay-*.json")
    ap.add_argument("--psd", required=True, help="Thư mục chứa 1 (N).psd nguồn")
    args = ap.parse_args()

    files = sorted(glob.glob(os.path.join(args.json, "lay-*.json")))
    if not files:
        print(f"Không thấy lay-*.json trong {args.json}", file=sys.stderr)
        return 1

    total_p = total_t = 0
    for f in files:
        p, t = patch_one(f, args.psd)
        total_p += p
        total_t += t
    print(f"\n✓ Vá {total_p}/{total_t} chữ trong {len(files)} layout.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())