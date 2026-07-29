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

/** VN lab presets (§12.5) — DPI + bleed per lab; always confirm with the lab. */
const LAB_PRESETS: { id: string; label: string; dpi: number; bleedMm: number }[] = [
  { id: "custom", label: "Custom…", dpi: 300, bleedMm: 0 },
  { id: "hongquan", label: "Hồng Quân (HN)", dpi: 300, bleedMm: 3 },
  { id: "whitehouse", label: "WhiteHouse (HCM)", dpi: 300, bleedMm: 3 },
  { id: "saigonlab", label: "Saigon Lab", dpi: 300, bleedMm: 3 },
  { id: "hunghuong", label: "Hùng Hương (HCM)", dpi: 300, bleedMm: 5 },
  { id: "hanoilab", label: "Hà Nội Lab", dpi: 300, bleedMm: 3 },
];
const DPI_OPTIONS = [150, 200, 300, 400, 600];

/** "1,2,5-7" → [1,2,5,6,7] clamped to 1..max; null = invalid/empty. */
function parseRange(text: string, max: number): number[] | null {
  const out = new Set<number>();
  const parts = text.split(",").map((c) => c.trim()).filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(part);
    if (!m) return null;
    const a = parseInt(m[1], 10);
    const b = m[2] ? parseInt(m[2], 10) : a;
    if (a < 1 || b < a || a > max) return null;
    for (let k = a; k <= Math.min(b, max); k++) out.add(k);
  }
  return out.size ? [...out].sort((x, y) => x - y) : null;
}

export function ExportDialog({ onClose }: { onClose: () => void }) {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const bgColor = useAlbum((s) => s.bgColor);
  const size = useAlbum((s) => s.size);
  const settings = useAlbum((s) => s.settings);
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
        alert("Folder has no layout backgrounds (lay-*.bg.jpg). Choose a valid layout pack folder.");
        return;
      }
      saveLayoutFolder(path);
      setLayoutFolder(path);
      setLayoutCount(n);
    } catch (e) {
      alert("Load layout pack failed: " + String(e));
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
  // SmartAlbums output options: range (all / "1,2,5-7"), include cover.
  const [rangeMode, setRangeMode] = useState<"all" | "range">("all");
  const [rangeText, setRangeText] = useState("");
  const [includeCover, setIncludeCover] = useState(true);
  // Default from the album's wizard setting (still overridable per export).
  const [dpi, setDpi] = useState(settings.dpi);
  const [quality, setQuality] = useState(95);
  const [prefix, setPrefix] = useState("Spread_");
  const [folder, setFolder] = useState<string>("");
  const [lab, setLab] = useState("custom");
  const [pageMode, setPageMode] = useState<"spread" | "page">("spread");
  const [bleedMm, setBleedMm] = useState(0);
  const [cropMarks, setCropMarks] = useState(false);

  function pickLab(id: string) {
    setLab(id);
    const p = LAB_PRESETS.find((l) => l.id === id);
    if (p && id !== "custom") {
      setDpi(p.dpi);
      setBleedMm(p.bleedMm);
    }
  }
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
      alert("Choose a save folder first.");
      return;
    }
    if (!exportSet || exportSet.length === 0) {
      alert("Invalid spread range — e.g. 1,2,5-7");
      return;
    }
    cancelRef.current = { cancelled: false };
    setStatus("running");
    setProgress({ done: 0, total: exportSet.length });
    try {
      const dir = await exportAlbum(
        exportSet.map((e) => e.sp),
        images,
        bgColor,
        {
          format, dpi, quality, prefix, folder,
          pageCm: parseSizeCm(size), pageMode, bleedMm, cropMarks,
          borderPt: settings.borderPt, borderColor: settings.borderColor,
          names: exportSet.map((e) => e.name),
        },
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

  // Content spreads are numbered 1..N (the cover is NOT a number — it is the
  // "Kèm bìa" option), so "5-7" means the same spreads the user sees.
  const cover = spreads.find((sp) => sp.isCover);
  const content = spreads.filter((sp) => !sp.isCover);
  const picked = rangeMode === "all" ? content.map((_, i) => i + 1) : parseRange(rangeText, content.length);
  const exportSet = picked
    ? [
        ...(includeCover && cover ? [{ sp: cover, name: "Bia" }] : []),
        ...picked.map((n) => ({ sp: content[n - 1], name: String(n).padStart(2, "0") })),
      ]
    : null;

  return (
    <div className="modal-overlay" onClick={running ? undefined : onClose}>
      <div className="modal" style={{ width: "min(460px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Export album · {exportSet ? exportSet.length : 0} items</h2>
          <button className="btn icon" title="Close" onClick={onClose} disabled={running}><IconClose /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="prop-label">Print lab (§12.5 — always confirm with the lab before large print runs)</div>
            <select
              className="input"
              value={lab}
              onChange={(e) => pickLab(e.target.value)}
              style={{ width: "100%" }}
            >
              {LAB_PRESETS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                  {l.id !== "custom" ? ` · ${l.dpi} DPI · bleed ${l.bleedMm}mm · sRGB` : ""}
                </option>
              ))}
            </select>
          </div>

          <div className="seg-2">
            <div>
              <div className="prop-label">Export range</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={rangeMode}
                onChange={(e) => setRangeMode(e.target.value as "all" | "range")}
              >
                <option value="all">All spreads ({content.length})</option>
                <option value="range">Select range…</option>
              </select>
              {rangeMode === "range" && (
                <>
                  <input
                    className="input"
                    style={{ marginTop: 6, width: "100%" }}
                    value={rangeText}
                    onChange={(e) => setRangeText(e.target.value)}
                    placeholder="e.g. 1,2,5-7"
                  />
                  {rangeText.trim() !== "" && !picked && (
                    <div className="err-msg" style={{ marginTop: 4 }}>Invalid — format 1,2,5-7 (1–{content.length})</div>
                  )}
                </>
              )}
            </div>
            <div>
              <div className="prop-label">Album cover</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={includeCover ? "yes" : "no"}
                onChange={(e) => setIncludeCover(e.target.value === "yes")}
                disabled={!cover}
              >
                <option value="yes">Include cover</option>
                <option value="no">No cover</option>
              </select>
            </div>
          </div>

          <div className="seg-2">
            <div>
              <div className="prop-label">Format</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={format}
                onChange={(e) => setFormat(e.target.value as ExportFormat)}
              >
                <option value="jpg">JPG</option>
                <option value="pdf">PDF</option>
                <option value="both">JPG + PDF</option>
              </select>
            </div>
            <div>
              <div className="prop-label">JPG file type</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={pageMode}
                onChange={(e) => setPageMode(e.target.value as "spread" | "page")}
                disabled={format === "pdf"}
              >
                <option value="spread">Per spread (2 pages joined)</option>
                <option value="page">Single page (split spread)</option>
              </select>
            </div>
          </div>

          <div className="seg-2">
            <div>
              <div className="prop-label">DPI</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={dpi}
                onChange={(e) => { setDpi(parseInt(e.target.value, 10)); setLab("custom"); }}
              >
                {DPI_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d} DPI</option>
                ))}
              </select>
            </div>
            <div>
              <div className="prop-label">JPG quality</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={quality}
                onChange={(e) => setQuality(parseInt(e.target.value, 10))}
              >
                {[80, 90, 95, 100].map((q) => (
                  <option key={q} value={q}>{q}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="seg-2">
            <div>
              <div className="prop-label">Bleed (trim margin)</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={bleedMm}
                onChange={(e) => {
                  const b = parseInt(e.target.value, 10);
                  setBleedMm(b);
                  setLab("custom");
                  if (b === 0) setCropMarks(false);
                }}
              >
                <option value={0}>None</option>
                <option value={3}>3mm</option>
                <option value={5}>5mm</option>
              </select>
            </div>
            <div>
              <div className="prop-label">Crop marks</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={cropMarks ? "on" : "off"}
                onChange={(e) => setCropMarks(e.target.value === "on")}
                disabled={bleedMm === 0}
                title={bleedMm === 0 ? "Needs bleed > 0" : ""}
              >
                <option value="off">Off</option>
                <option value="on">On</option>
              </select>
            </div>
          </div>

          <div>
            <div className="prop-label">Filename prefix</div>
            <input className="input" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
          </div>

          <div>
            <div className="prop-label">Save folder</div>
            <div className="prop-row">
              <input className="input" value={folder} placeholder="Not selected…" readOnly />
              <button className="btn" onClick={pickFolder} disabled={running}>Choose…</button>
            </div>
            <div className="hint-sm">Creates subfolder Export_YYYY-MM-DD/ · sRGB color</div>
          </div>

          <div>
            <div className="prop-label">High-res print layout (optional)</div>
            <div className="prop-row">
              <input
                className="input"
                value={layoutFolder ? `${layoutFolder}${layoutCount != null ? `  ·  ${layoutCount} backgrounds` : ""}` : ""}
                placeholder="Not loaded — will use preview backgrounds (low quality at large print sizes)"
                readOnly
              />
              <button className="btn" onClick={importLayoutPack} disabled={running}>
                {layoutFolder ? "Change…" : "Load…"}
              </button>
            </div>
            <div className="hint-sm">
              Load layout pack (full-res backgrounds) → sharp backgrounds + text in print. Text renders as vector from the font library.
            </div>
            {layoutFolder && missingFonts.size > 0 && (
              <div className="font-warn-sm">
                ⚠ {missingFonts.size} layout fonts not loaded → text will use fallback fonts in print. Load the font library for correct styling.
              </div>
            )}
          </div>

          {running && (
            <div className="ip-progress" style={{ padding: 0 }}>
              <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
              <span>{progress.done}/{progress.total} — {pct}%</span>
            </div>
          )}
          {status === "done" && <div className="ok-msg">✓ Exported to: {result}</div>}
          {status === "error" && <div className="err-msg">Error: {result}</div>}
        </div>

        <div className="modal-foot">
          {running ? (
            <button className="btn" onClick={() => (cancelRef.current.cancelled = true)}>Cancel</button>
          ) : (
            <>
              <button className="btn" onClick={onClose}>Close</button>
              <button className="btn primary" onClick={run} disabled={!exportSet || exportSet.length === 0}>Export album</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
