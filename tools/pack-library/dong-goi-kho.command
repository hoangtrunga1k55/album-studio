#!/bin/bash
# Album Studio — đóng gói + phát hành kho layout/typo (macOS)
# Bấm đúp file này. Không cần gõ lệnh.

cd "$(dirname "$0")" || exit 1
set -u

BOLD=$'\033[1m'; DIM=$'\033[2m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'; OFF=$'\033[0m'
CONF=".pack-config"           # nhớ lựa chọn lần trước
VENV=".venv"

echo "${BOLD}=== Album Studio · Đóng gói kho ===${OFF}"
echo

# ---------- 1. môi trường Python (tự cài lần đầu) ----------
PY=""
for c in python3 python; do command -v "$c" >/dev/null 2>&1 && { PY="$c"; break; }; done
if [ -z "$PY" ]; then
  echo "${RED}Chưa có Python.${OFF} Cài tại https://www.python.org/downloads/ rồi chạy lại."
  read -r -p "Enter để đóng…" _; exit 1
fi

if [ ! -x "$VENV/bin/python" ]; then
  echo "${DIM}Lần đầu chạy — đang cài thư viện (1–2 phút)…${OFF}"
  "$PY" -m venv "$VENV" || { echo "${RED}Tạo venv lỗi${OFF}"; read -r -p "Enter…" _; exit 1; }
  "$VENV/bin/pip" install -q --upgrade pip
  "$VENV/bin/pip" install -q -r requirements.txt || { echo "${RED}Cài thư viện lỗi${OFF}"; read -r -p "Enter…" _; exit 1; }
  echo "${GREEN}✓ Đã cài xong thư viện${OFF}"; echo
fi
PYBIN="$VENV/bin/python"

# ---------- 2. chọn loại kho ----------
echo "Đóng gói kho nào?"
echo "  1) Kho LAYOUT   (PSD layout → json + thumbnail + nền in)"
echo "  2) Kho TYPO     (PSD typo → preview + deco)"
read -r -p "Chọn [1/2]: " KIND
case "$KIND" in
  1) SCRIPT="build_layout_library.py"; OUT_DEF="kho-layout"; TAG_DEF="pack-layout" ;;
  2) SCRIPT="build_typo_library.py";   OUT_DEF="kho-typo";   TAG_DEF="pack-typo" ;;
  *) echo "${RED}Chọn 1 hoặc 2.${OFF}"; read -r -p "Enter…" _; exit 1 ;;
esac
echo

# ---------- 3. thư mục PSD (kéo-thả vào cửa sổ này) ----------
echo "${BOLD}Kéo thư mục PSD vào đây rồi Enter${OFF}"
echo "${DIM}(mỗi thư mục con = 1 nhóm: cover-25x35, layout-30x30 / vn, korea…)${OFF}"
read -r -p "> " SRC
SRC="${SRC%\'}"; SRC="${SRC#\'}"; SRC="$(echo "$SRC" | xargs)"   # bỏ nháy + khoảng trắng
if [ ! -d "$SRC" ]; then
  echo "${RED}Không thấy thư mục: $SRC${OFF}"; read -r -p "Enter…" _; exit 1
fi
echo

# ---------- 4. build ----------
OUT="$OUT_DEF"
echo "${BOLD}Đang đóng gói…${OFF} (PSD lớn có thể mất vài phút)"
"$PYBIN" "$SCRIPT" --in "$SRC" --out "$OUT" || { echo "${RED}Đóng gói lỗi${OFF}"; read -r -p "Enter…" _; exit 1; }
echo
echo "${GREEN}✓ Kho đã tạo: $(pwd)/$OUT${OFF}"
echo

# ---------- 5. phát hành (tuỳ chọn) ----------
read -r -p "Đẩy kho lên GitHub cho user tự cập nhật? [y/N]: " PUB
if [ "${PUB:-n}" != "y" ] && [ "${PUB:-n}" != "Y" ]; then
  echo "${DIM}Bỏ qua. Có thể gửi thư mục $OUT cho user để họ 'Nạp kho…' thủ công.${OFF}"
  read -r -p "Enter để đóng…" _; exit 0
fi

# repo + token nhớ lại từ lần trước
REPO=""; TOKEN=""
[ -f "$CONF" ] && . "./$CONF"
if [ -z "${REPO:-}" ]; then
  read -r -p "Repo GitHub (vd hoangtrunga1k55/album-studio): " REPO
fi
if [ -z "${TOKEN:-}" ]; then
  echo "${DIM}Token GitHub (Settings → Developer settings → Personal access tokens → scope 'repo')${OFF}"
  read -r -s -p "Token: " TOKEN; echo
fi
printf 'REPO=%s\nTOKEN=%s\n' "$REPO" "$TOKEN" > "$CONF"; chmod 600 "$CONF"

echo
echo "${BOLD}Đang đẩy lên GitHub…${OFF}"
GITHUB_TOKEN="$TOKEN" "$PYBIN" publish_pack.py --pack "$OUT" --tag "$TAG_DEF" --repo "$REPO" \
  || { echo "${RED}Đẩy lên GitHub lỗi${OFF}"; read -r -p "Enter…" _; exit 1; }

echo
echo "${YEL}Gửi link release này cho user → app ⚙ Cài đặt → dán vào 'Link kho trên mạng' → ⟳ Cập nhật${OFF}"
read -r -p "Enter để đóng…" _