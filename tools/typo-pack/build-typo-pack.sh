#!/usr/bin/env bash
# Build an Album Studio typo pack. Sets up an isolated venv on first run,
# then extracts every PSD in the input folder into a ready-to-ship pack.
#
# Usage:
#   ./build-typo-pack.sh <psd_folder> <output_pack_folder>
# Example:
#   ./build-typo-pack.sh ../../typo ../../dist/typo-pack
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$SCRIPT_DIR/.venv"

if [[ $# -ne 2 ]]; then
  echo "Cách dùng: $0 <thư_mục_PSD> <thư_mục_pack_output>" >&2
  exit 64
fi
SRC="$1"
OUT="$2"

# Pick a Python 3 interpreter.
PY="${PYTHON:-python3}"
if ! command -v "$PY" >/dev/null 2>&1; then
  echo "Không tìm thấy python3. Cài Python 3 rồi chạy lại." >&2
  exit 1
fi

# Create the venv + install deps once.
if [[ ! -d "$VENV" ]]; then
  echo "→ Tạo venv + cài psd-tools/Pillow/aggdraw (chỉ lần đầu)…"
  "$PY" -m venv "$VENV"
  "$VENV/bin/pip" install --quiet --upgrade pip
  "$VENV/bin/pip" install --quiet -r "$SCRIPT_DIR/requirements.txt"
fi

"$VENV/bin/python" "$SCRIPT_DIR/build_typo_pack.py" --in "$SRC" --out "$OUT"