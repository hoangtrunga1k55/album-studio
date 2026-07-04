#!/usr/bin/env python3
"""Album Studio — Layout Editor (standalone template-authoring tool).

A tiny local server that lets a designer review auto-extracted templates,
fix / draw photo slots and text boxes over the preview, and save corrected
JSON back to disk. No build step, no Tauri — open in a browser.

Run:  python3 tools/layout-editor/server.py
Then: http://localhost:8765
"""
import json
import os
import posixpath
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

HERE = os.path.dirname(os.path.abspath(__file__))
PROJECT = os.path.abspath(os.path.join(HERE, "..", ".."))
EXTRACTED = os.path.join(PROJECT, "Extracted")   # contains 30x30/ and 25x35/
PORT = 8765

MIME = {".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json",
        ".html": "text/html; charset=utf-8"}


def list_templates():
    """Scan Extracted/<size>/*.json into a flat list of template descriptors."""
    items = []
    if not os.path.isdir(EXTRACTED):
        return items
    for size in sorted(os.listdir(EXTRACTED)):
        sdir = os.path.join(EXTRACTED, size)
        if not os.path.isdir(sdir):
            continue
        for fn in sorted(os.listdir(sdir)):
            if not fn.endswith(".json") or fn == "index.html":
                continue
            base = fn[:-5]
            try:
                d = json.load(open(os.path.join(sdir, fn)))
            except Exception:
                continue
            slots = d.get("photoSlots", [])
            items.append({
                "id": f"{size}/{base}",
                "size": size,
                "base": base,
                "slots": len(slots),
                "texts": len(d.get("texts", [])),
                "edited": bool(d.get("edited")),
                "preview": f"/files/{size}/{base}.preview.png",
            })
    return items


def safe_path(rel):
    """Resolve a request path under EXTRACTED, blocking traversal."""
    rel = unquote(rel).lstrip("/")
    full = os.path.normpath(os.path.join(EXTRACTED, rel))
    if not full.startswith(EXTRACTED):
        return None
    return full


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass  # quiet

    def _send(self, code, body, ctype="application/json"):
        if isinstance(body, (dict, list)):
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
        elif isinstance(body, str):
            body = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urlparse(self.path)
        path, q = u.path, parse_qs(u.query)

        if path == "/" or path == "/index.html":
            return self._send(200, open(os.path.join(HERE, "editor.html")).read(),
                              "text/html; charset=utf-8")

        if path == "/api/list":
            return self._send(200, list_templates())

        if path == "/api/template":
            tid = (q.get("id") or [""])[0]
            fp = safe_path(tid + ".json")
            if not fp or not os.path.isfile(fp):
                return self._send(404, {"error": "not found"})
            data = json.load(open(fp))
            data["_preview"] = "/files/" + tid + ".preview.png"
            return self._send(200, data)

        if path.startswith("/files/"):
            fp = safe_path(path[len("/files/"):])
            if not fp or not os.path.isfile(fp):
                return self._send(404, {"error": "not found"})
            ext = os.path.splitext(fp)[1].lower()
            with open(fp, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", MIME.get(ext, "application/octet-stream"))
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            return self.wfile.write(body)

        return self._send(404, {"error": "no route"})

    def do_POST(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path == "/api/save":
            tid = (q.get("id") or [""])[0]
            fp = safe_path(tid + ".json")
            if not fp:
                return self._send(400, {"error": "bad id"})
            n = int(self.headers.get("Content-Length", 0))
            payload = json.loads(self.rfile.read(n) or b"{}")
            payload["edited"] = True
            with open(fp, "w") as f:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            return self._send(200, {"ok": True})
        return self._send(404, {"error": "no route"})


if __name__ == "__main__":
    print(f"Layout Editor → http://localhost:{PORT}")
    print(f"Templates from: {EXTRACTED}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()