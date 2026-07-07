import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";
import { useAlbum } from "../store/album";
import { useFonts } from "../store/fonts";
import { exportAlbum, type CancelRef, type ExportFormat } from "../engine/exportAlbum";
import { getTemplate, parseSizeCm } from "../engine/templates";
import { fontAliases } from "../ipc/fonts";
import {
  pickLayoutFolder,
  saveLayoutFolder,
  savedLayoutFolder,
  scanLayoutPack,
} from "../ipc/layouts";
import { IconClose } from "../icons";

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const bgColor = useAlbum((s) => s.bgColor);
  const size = useAlbum((s) => s.size);
  const fonts = useFonts((s) => s.fonts);

  const [layoutFolder, setLayoutFolder] = useState<string | null>(savedLayoutFolder());
  const [layoutCount, setLayoutCount] = useState<number | null>(null);

  useEffect(() => {
    if (layoutFolder) scanLayoutPack(layoutFolder).then(setLayoutCount).catch(() => setLayoutCount(0));
  }, [layoutFolder]);

  async function importLayoutPack() {
    const path = await pickLayoutFolder();
    if (!path) return;
    try {
      const n = await scanLayoutPack(path);
      if (n === 0) {
        alert("Thư mục không có nền layout (lay-*.bg.jpg). Chọn đúng folder layout pack.");
        return;
      }
      saveLayoutFolder(path);
      setLayoutFolder(path);
      setLayoutCount(n);
    } catch (e) {
      alert("Nạp layout pack lỗi: " + String(e));
    }
  }

  // Template fonts referenced but not loaded — vector text would fall back.
  const loadedSet = new Set(fonts.flatMap((f) => fontAliases(f)));
  const missingFonts = new Set<string>();
  for (const sp of spreads) {
    const t = getTemplate(sp.templateId);
    t?.texts.forEach((tx, i) => {
      const f = sp.textEdits[i]?.font ?? tx.font;
      if (f && !loadedSet.has(f)) missingFonts.add(f);
    });
  }

  const [format, setFormat] = useState<ExportFormat>("both");
  const [dpi, setDpi] = useState(300);
  const [quality, setQuality] = useState(95);
  const [prefix, setPrefix] = useState("Spread_");
  const [folder, setFolder] = useState<string>("");
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [result, setResult] = useState("");
  const cancelRef = useRef<CancelRef>({ cancelled: false });

  async function pickFolder() {
    const p = await open({ directory: true, multiple: false });
    if (typeof p === "string") setFolder(p);
  }

  async function run() {
    if (!folder) {
      alert("Chọn thư mục lưu trước.");
      return;
    }
    cancelRef.current = { cancelled: false };
    setStatus("running");
    setProgress({ done: 0, total: spreads.length });
    try {
      const dir = await exportAlbum(
        spreads,
        images,
        bgColor,
        { format, dpi, quality, prefix, folder, pageCm: parseSizeCm(size) },
        (done, total) => setProgress({ done, total }),
        cancelRef.current
      );
      setResult(dir);
      setStatus("done");
    } catch (err) {
      if ((err as Error).message === "cancelled") setStatus("idle");
      else {
        setResult(String(err));
        setStatus("error");
      }
    }
  }

  const running = status === "running";
  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="modal-overlay" onClick={running ? undefined : onClose}>
      <div className="modal" style={{ width: "min(460px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Xuất album · {spreads.length} spread</h2>
          <button className="btn icon" onClick={onClose} disabled={running}><IconClose /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="prop-label">Định dạng</div>
            <div className="seg-row">
              {(["jpg", "pdf", "both"] as ExportFormat[]).map((f) => (
                <button key={f} className={"seg" + (format === f ? " active" : "")} onClick={() => setFormat(f)}>
                  {f === "both" ? "JPG + PDF" : f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="seg-2">
            <div>
              <div className="prop-label">DPI</div>
              <div className="seg-row">
                {[150, 300].map((d) => (
                  <button key={d} className={"seg" + (dpi === d ? " active" : "")} onClick={() => setDpi(d)}>{d}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="prop-label">Chất lượng</div>
              <div className="seg-row">
                {[80, 90, 95, 100].map((q) => (
                  <button key={q} className={"seg" + (quality === q ? " active" : "")} onClick={() => setQuality(q)}>{q}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div className="prop-label">Tiền tố tên file</div>
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </div>

          <div>
            <div className="prop-label">Thư mục lưu</div>
            <div className="prop-row">
              <input className="input" value={folder} placeholder="Chưa chọn…" readOnly />
              <button className="btn" onClick={pickFolder} disabled={running}>Chọn…</button>
            </div>
            <div className="hint-sm">Sẽ tạo thư mục con Export_YYYY-MM-DD/ · màu sRGB</div>
          </div>

          <div>
            <div className="prop-label">Layout in nét cao (tuỳ chọn)</div>
            <div className="prop-row">
              <input
                className="input"
                value={layoutFolder ? `${layoutFolder}${layoutCount != null ? `  ·  ${layoutCount} nền` : ""}` : ""}
                placeholder="Chưa nạp — sẽ dùng nền preview (kém nét khi in to)"
                readOnly
              />
              <button className="btn" onClick={importLayoutPack} disabled={running}>
                {layoutFolder ? "Đổi…" : "Nạp…"}
              </button>
            </div>
            <div className="hint-sm">
              Nạp layout pack (nền full-res) → nền + chữ in sắc nét. Chữ render vector từ font kho.
            </div>
            {layoutFolder && missingFonts.size > 0 && (
              <div className="font-warn-sm">
                ⚠ {missingFonts.size} font layout chưa nạp → chữ sẽ dùng font thay thế khi in. Nạp kho font để đúng kiểu.
              </div>
            )}
          </div>

          {running && (
            <div className="ip-progress" style={{ padding: 0 }}>
              <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
              <span>{progress.done}/{progress.total} — {pct}%</span>
            </div>
          )}
          {status === "done" && <div className="ok-msg">✓ Đã xuất vào: {result}</div>}
          {status === "error" && <div className="err-msg">Lỗi: {result}</div>}
        </div>

        <div className="modal-foot">
          {running ? (
            <button className="btn" onClick={() => (cancelRef.current.cancelled = true)}>Huỷ</button>
          ) : (
            <>
              <button className="btn" onClick={onClose}>Đóng</button>
              <button className="btn primary" onClick={run} disabled={!spreads.length}>Xuất album</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
