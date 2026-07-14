"""Shared manifest writer for Album Studio packs.

`manifest.json` is what the app downloads first when syncing a pack from a
GitHub Release: it lists every file with its size + SHA-256, so the app can
fetch ONLY what changed and delete what was removed.

    {
      "kind": "layout" | "typo",
      "version": "2026-07-14T09:12:03Z",   # build time, shown in the UI
      "files": [
        {"path": "layout-25x35/lay-6.json", "size": 2218, "sha256": "…"},
        …
      ]
    }
"""

from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone

MANIFEST_NAME = "manifest.json"


def sha256_file(path: str, chunk: int = 1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            b = f.read(chunk)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def write_manifest(root: str, kind: str) -> str:
    """Index every file in the pack (except the manifest itself)."""
    files = []
    for dirpath, _dirs, names in os.walk(root):
        for n in sorted(names):
            if n == MANIFEST_NAME or n.startswith("."):
                continue
            full = os.path.join(dirpath, n)
            rel = os.path.relpath(full, root).replace(os.sep, "/")
            files.append(
                {"path": rel, "size": os.path.getsize(full), "sha256": sha256_file(full)}
            )
    files.sort(key=lambda f: f["path"])
    data = {
        "kind": kind,
        "version": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "files": files,
    }
    out = os.path.join(root, MANIFEST_NAME)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    print(f"  ⓘ manifest: {len(files)} file → {out}")
    return out
