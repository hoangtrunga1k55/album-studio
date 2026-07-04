#!/usr/bin/env bash
# Build an Album Studio hi-res layout pack. Sets up an isolated venv on first
# run, then extracts a text-free full-res background for every PSD.
#
# Usage:
#   ./build-layout-pack.sh <psd_folder> <output_pack_folder>
# Example:
#   ./build-layout-pack.sh ../../source-layouts-25x35 ../../dist/layout-pack-25x35
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/.venv"

if [[ $# -ne 2 ]]; then
  echo "Cách dùng: $0 <thư_mục_PSD> <thư_mục_pack_output>" >&2
  exit 64
fi
SRC="$1"
OUT="$2"

PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "Không tìm thấy python3. Cài Python 3 rồi chạy lại." >&2
  exit 1
fi

if [[ ! -d "$VENV" ]]; then
  echo "→ Tạo venv + cài psd-tools/Pillow (chỉ lần đầu)…"
  "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r "$SCRIPT_DIR/requirements.txt"
fi

"$VENV/bin/python" "$SCRIPT_DIR/build_layout_pack.py" --in "$SRC" --out "$OUT"