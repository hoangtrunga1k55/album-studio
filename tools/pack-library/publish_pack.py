#!/usr/bin/env python3
"""Publish an Album Studio pack to a GitHub Release.

The app syncs a pack by downloading `manifest.json` from the release, comparing
SHA-256 hashes against what it already has, and fetching ONLY the changed files
— so every file of the pack is uploaded as its own release asset (flat names,
`/` → `__`), next to the manifest.

    python publish_pack.py --pack kho-layout --tag pack-layout
    python publish_pack.py --pack kho-typo   --tag pack-typo --repo owner/name

Works either with the GitHub CLI (`gh auth login`) or with a token:

    export GITHUB_TOKEN=ghp_…        # Settings → Developer settings → Tokens
    python publish_pack.py --pack kho-layout --tag pack-layout --repo owner/name

Re-running on the same tag updates the release in place, so publishing an
update is just: rebuild the pack → run this again.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys

from manifest import MANIFEST_NAME

ASSET_SEP = "__"  # release assets are flat: "layout-25x35/lay-6.json" → "layout-25x35__lay-6.json"


def run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, capture_output=True, text=True)


def has_gh() -> bool:
    return run(["gh", "--version"]).returncode == 0


def api(method: str, url: str, token: str, data: bytes | None = None, ctype: str | None = None):
    """Minimal GitHub REST call (used when the gh CLI is not installed)."""
    import urllib.error
    import urllib.request

    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Accept", "application/vnd.github+json")
    if ctype:
        req.add_header("Content-Type", ctype)
    try:
        with urllib.request.urlopen(req) as r:
            body = r.read()
            return r.status, (json.loads(body) if body and r.headers.get("content-type", "").startswith("application/json") else {})
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def publish_with_token(pack: str, tag: str, repo: str, token: str, files: list[dict], manifest_path: str, title: str) -> int:
    base = f"https://api.github.com/repos/{repo}"
    status, rel = api("GET", f"{base}/releases/tags/{tag}", token)
    if status == 404:
        status, rel = api(
            "POST", f"{base}/releases", token,
            json.dumps({"tag_name": tag, "name": title, "body": "Kho tài nguyên Album Studio."}).encode(),
            "application/json",
        )
        if status >= 300:
            print(f"Tạo release lỗi {status}: {rel}", file=sys.stderr)
            return 1
        print(f"✓ Tạo release {tag}")
    rel_id = rel["id"]
    upload_base = f"https://uploads.github.com/repos/{repo}/releases/{rel_id}/assets"

    existing = {a["name"]: a["id"] for a in rel.get("assets", [])}
    uploads = [(os.path.join(pack, f["path"]), f["path"].replace("/", ASSET_SEP)) for f in files]
    uploads.append((manifest_path, MANIFEST_NAME))

    for i, (src, asset) in enumerate(uploads, 1):
        if asset in existing:  # replace
            api("DELETE", f"{base}/releases/assets/{existing[asset]}", token)
        with open(src, "rb") as fh:
            data = fh.read()
        st, _ = api("POST", f"{upload_base}?name={asset}", token, data, "application/octet-stream")
        if st >= 300:
            print(f"  ✗ {asset}: HTTP {st}", file=sys.stderr)
        elif i % 20 == 0 or i == len(uploads):
            print(f"  … {i}/{len(uploads)}")

    print(f"\n✓ Đã phát hành: https://github.com/{repo}/releases/tag/{tag}")
    print("  Trong app: ⚙ Cài đặt → dán link này vào ô 'Link kho trên mạng' → ⟳ Cập nhật.")
    return 0


def main() -> int:
    ap = argparse.ArgumentParser(description="Đẩy kho layout/typo lên GitHub Release.")
    ap.add_argument("--pack", required=True, help="Thư mục kho (đã có manifest.json)")
    ap.add_argument("--tag", required=True, help="Tag của release, vd: pack-layout · pack-typo")
    ap.add_argument("--repo", help="owner/name (mặc định: repo của thư mục hiện tại)")
    ap.add_argument("--title", help="Tiêu đề release")
    args = ap.parse_args()

    manifest_path = os.path.join(args.pack, MANIFEST_NAME)
    if not os.path.isfile(manifest_path):
        print(f"Không thấy {MANIFEST_NAME} trong {args.pack} — chạy build_*_library.py trước.", file=sys.stderr)
        return 2

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)
    files = manifest["files"]
    print(f"Kho: {args.pack} · {len(files)} file · version {manifest['version']}")

    title = args.title or f"Kho {manifest['kind']} — {manifest['version']}"
    token = os.environ.get("GITHUB_TOKEN")

    if not has_gh():
        if not token:
            print(
                "Cần một trong hai:\n"
                "  • GitHub CLI: brew install gh && gh auth login\n"
                "  • hoặc token: export GITHUB_TOKEN=ghp_… (kèm --repo owner/name)",
                file=sys.stderr,
            )
            return 2
        if not args.repo:
            print("Dùng token thì phải truyền --repo owner/name", file=sys.stderr)
            return 2
        return publish_with_token(args.pack, args.tag, args.repo, token, files, manifest_path, title)

    repo_args = ["--repo", args.repo] if args.repo else []

    # create the release once; afterwards we just re-upload assets
    exists = run(["gh", "release", "view", args.tag, *repo_args]).returncode == 0
    if not exists:
        p = run([
            "gh", "release", "create", args.tag,
            "--title", title,
            "--notes", f"Kho {manifest['kind']} cho Album Studio. App tự đồng bộ qua manifest.json.",
            *repo_args,
        ])
        if p.returncode != 0:
            print(p.stderr, file=sys.stderr)
            return 1
        print(f"✓ Tạo release {args.tag}")

    # upload every pack file (flat asset name) + the manifest last
    uploads: list[tuple[str, str]] = []
    for f in files:
        src = os.path.join(args.pack, f["path"])
        asset = f["path"].replace("/", ASSET_SEP)
        uploads.append((src, asset))
    uploads.append((manifest_path, MANIFEST_NAME))

    for i, (src, asset) in enumerate(uploads, 1):
        p = run([
            "gh", "release", "upload", args.tag, f"{src}#{asset}",
            "--clobber", *repo_args,
        ])
        if p.returncode != 0:
            print(f"  ✗ {asset}: {p.stderr.strip()}", file=sys.stderr)
        elif i % 20 == 0 or i == len(uploads):
            print(f"  … {i}/{len(uploads)}")

    url = run(["gh", "release", "view", args.tag, "--json", "url", "-q", ".url", *repo_args]).stdout.strip()
    print(f"\n✓ Đã phát hành: {url}")
    print("  Trong app: ⚙ Cài đặt → dán link release này vào ô 'Kho trên mạng' → Kiểm tra cập nhật.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
