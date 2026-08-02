import { useEffect, useState } from "react";
import {
  ALBUM_SIZES,
  parseSizeCm,
  type AlbumSize,
  type LayoutSourceFilter,
} from "../engine/templates";
import { createProject, openProject } from "../flows/projectIO";
import { newFromAlbumTemplate } from "../flows/albumTemplate";
import { loadRecents, forgetRecent, useProject, type RecentProject } from "../store/project";
import { DEFAULT_SETTINGS, loadCustomDefaults, saveCustomDefaults } from "../store/album";
import "./Welcome.css";

/** SmartAlbums-style welcome: New Album / Open Album + recent projects. */
export function Welcome() {
  const [recents, setRecents] = useState<RecentProject[]>(loadRecents());
  // ⌘N from the editor lands here with the wizard already open.
  const [wizard, setWizard] = useState(() => {
    const requested = useProject.getState().wizardRequested;
    if (requested) useProject.getState().requestWizard(false);
    return requested;
  });
  const [busy, setBusy] = useState(false);

  async function handleOpen(path?: string) {
    setBusy(true);
    try {
      await openProject(path);
    } catch (e) {
      alert("Could not open project: " + String(e));
      if (path) {
        forgetRecent(path);
        setRecents(loadRecents());
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleFromTemplate() {
    setBusy(true);
    try {
      await newFromAlbumTemplate();
    } catch (e) {
      alert("Could not create from template: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      {/* the card hides while the wizard is up — only ONE modal on screen */}
      {!wizard && (
        <div className="welcome-card">
          <div className="welcome-brand">
            <div className="welcome-mark">A</div>
            <h1>Chưa tạo album</h1>
            <p className="welcome-sub">Vui lòng tạo album để bắt đầu.</p>
          </div>

          <div className="welcome-actions">
            <button className="w-btn primary" onClick={() => setWizard(true)} disabled={busy}>
              ＋ Tạo album mới
            </button>
            <button className="w-btn" onClick={() => handleFromTemplate()} disabled={busy}>
              New from template…
            </button>
            <button className="w-btn" onClick={() => handleOpen()} disabled={busy}>
              Open album…
            </button>
          </div>

          {recents.length > 0 && (
            <div className="welcome-recents">
              <div className="recents-title">Recent</div>
              {recents.map((r) => (
                <button key={r.path} className="recent-row" onClick={() => handleOpen(r.path)} disabled={busy}>
                  <span className="recent-name">{r.name}</span>
                  <span className="recent-meta">{r.size}</span>
                  <span className="recent-path">{r.path}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {wizard && <NewAlbumWizard onClose={() => setWizard(false)} />}
    </div>
  );
}

const CUSTOM_MIN_CM = 10;
const CUSTOM_MAX_CM = 100;
/** px inputs are interpreted at print resolution (300 DPI), like album specs. */
const PX_DPI = 300;

/** Measurement units for custom size, SmartAlbums-style (cm / inch / px).
 *  Internally the app always works in cm — inputs convert on create. */
type Unit = "cm" | "in" | "px";
const UNITS: { id: Unit; label: string; toCm: (v: number) => number }[] = [
  { id: "cm", label: "cm", toCm: (v) => v },
  { id: "in", label: "inch", toCm: (v) => v * 2.54 },
  { id: "px", label: "px", toCm: (v) => (v / PX_DPI) * 2.54 },
];

const DPI_CHOICES = [150, 200, 300, 400, 600];
const LAYOUT_SETS: { id: LayoutSourceFilter; label: string }[] = [
  { id: "all", label: "All layout sets" },
  { id: "basic", label: "Basic (SmartAlbums)" },
  { id: "tizino", label: "Tizino (PSD)" },
  { id: "custom", label: "My templates" },
];

/** Parse a mm field: empty/garbage → 0, clamped to [0, max]. */
function mmVal(s: string, max = 30): number {
  const v = parseFloat(s);
  return Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : 0;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

/** SmartAlbums-style "New Album" — ONE modal, two steps:
 *  1. Khổ album (custom → unit/DPI/output dimensions/safe zone/trim) + số spread
 *  2. Trang trí: background color, border & gap quanh ảnh, bộ layout. */
export function NewAlbumWizard({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [size, setSize] = useState<AlbumSize>("25x35");
  const [custom, setCustom] = useState(false);
  // Custom "output dimensions" are the SPREAD (2 pages), like SmartAlbums.
  const [sw, setSw] = useState("60");
  const [sh, setSh] = useState("30");
  const [unit, setUnit] = useState<Unit>("cm");
  const [spreadCount, setSpreadCount] = useState("10"); // 20 trang = 10 spread (chuẩn lab)
  const [busy, setBusy] = useState(false);

  // Custom-only print settings (presets keep the defaults).
  const [dpi, setDpi] = useState(DEFAULT_SETTINGS.dpi);
  const [safeMm, setSafeMm] = useState(String(DEFAULT_SETTINGS.safeMm));
  const [trimMm, setTrimMm] = useState(String(DEFAULT_SETTINGS.trimMm));

  // Step 2 — decoration.
  const [bgColor, setBgColor] = useState("#ffffff");
  const [borderPt, setBorderPt] = useState(String(DEFAULT_SETTINGS.borderPt));
  const [borderColor, setBorderColor] = useState(DEFAULT_SETTINGS.borderColor);
  const [gapPt, setGapPt] = useState(String(DEFAULT_SETTINGS.gapPt));
  const [layoutSource, setLayoutSource] = useState<LayoutSourceFilter>(
    DEFAULT_SETTINGS.layoutSource
  );

  // Preset sizes keep the factory defaults; custom sizes remember the last-used
  // settings (trim/safe/border/gap) so the next custom album starts from them.
  useEffect(() => {
    const src = custom ? loadCustomDefaults() : DEFAULT_SETTINGS;
    setDpi(src.dpi);
    setSafeMm(String(src.safeMm));
    setTrimMm(String(src.trimMm));
    setBorderPt(String(src.borderPt));
    setBorderColor(src.borderColor);
    setGapPt(String(src.gapPt));
    setLayoutSource(src.layoutSource);
  }, [custom]);

  function switchUnit(next: Unit) {
    // Keep the physical size when switching units (convert the field values).
    const from = UNITS.find((u) => u.id === unit)!;
    const conv = (s: string) => {
      const v = parseFloat(s);
      if (!Number.isFinite(v)) return s;
      const cmv = from.toCm(v);
      const out = next === "cm" ? cmv : next === "in" ? cmv / 2.54 : (cmv / 2.54) * PX_DPI;
      return String(Math.round(out * 100) / 100);
    };
    setSw(conv(sw));
    setSh(conv(sh));
    setUnit(next);
  }

  /** Custom size id "WxH" (page, cm) from the spread dimensions — null if out of range. */
  function customSize(): AlbumSize | null {
    const toCm = UNITS.find((u) => u.id === unit)!.toCm;
    const w = round1(toCm(parseFloat(sw)) / 2); // spread → page
    const h = round1(toCm(parseFloat(sh)));
    const ok = (v: number) => Number.isFinite(v) && v >= CUSTOM_MIN_CM && v <= CUSTOM_MAX_CM;
    if (!ok(w) || !ok(h)) return null;
    return `${w}x${h}`;
  }

  function validSize(): AlbumSize | null {
    return custom ? customSize() : size;
  }

  function next() {
    if (!validSize()) {
      alert(
        `Page size must be ${CUSTOM_MIN_CM}–${CUSTOM_MAX_CM} cm ` +
          `(spread width ${CUSTOM_MIN_CM * 2}–${CUSTOM_MAX_CM * 2} cm).`
      );
      return;
    }
    setStep(2);
  }

  async function finish() {
    const chosen = validSize();
    if (!chosen) {
      setStep(1);
      return;
    }
    const spreads = Math.min(50, Math.max(1, parseInt(spreadCount, 10) || 1));
    const settings = {
      dpi,
      trimMm: mmVal(trimMm),
      safeMm: mmVal(safeMm),
      borderPt: mmVal(borderPt, 200),
      borderColor,
      gapPt: mmVal(gapPt, 200),
      layoutSource,
    };
    // Remember custom-album settings for next time (presets stay factory).
    if (custom) saveCustomDefaults(settings);
    setBusy(true);
    try {
      const ok = await createProject(name, chosen, spreads, {
        settings,
        bgColor,
      });
      if (ok) onClose();
    } catch (e) {
      alert("Could not create project: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  // Page size in cm of whatever is selected — drives the live illustration.
  const toCm = UNITS.find((u) => u.id === unit)!.toCm;
  const rawCm = custom
    ? { w: toCm(parseFloat(sw)) / 2, h: toCm(parseFloat(sh)) }
    : parseSizeCm(size);
  const pageCm =
    rawCm && Number.isFinite(rawCm.w) && Number.isFinite(rawCm.h) && rawCm.w > 0 && rawCm.h > 0
      ? rawCm
      : { w: 1, h: 1 };

  return (
    <div className="wizard-overlay" onClick={busy ? undefined : onClose}>
      <div className="wizard" onClick={(e) => e.stopPropagation()}>
        <div className="wz-head">
          <h2>New album</h2>
          <span className="wz-step">Step {step}/2 · {step === 1 ? "Album size" : "Decoration"}</span>
          <button className="wz-close" title="Close" onClick={onClose} disabled={busy}>
            ✕
          </button>
        </div>

        {step === 1 ? (
          <>
            <label className="wz-label">Album name</label>
            <input
              className="wz-input"
              placeholder="e.g. Hien & Hieu 2026"
              value={name}
              autoFocus
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && next()}
            />

            <label className="wz-label">Album size</label>
            <div className="wz-size-row">
              <select
                className="wz-input"
                value={custom ? "custom" : size}
                onChange={(e) => {
                  if (e.target.value === "custom") setCustom(true);
                  else {
                    setCustom(false);
                    setSize(e.target.value);
                  }
                }}
              >
                {ALBUM_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {s.note}
                  </option>
                ))}
                <option value="custom">Custom…</option>
              </select>
              {/* live illustration: the 2-page spread at the chosen ratio */}
              <div className="wz-size-preview">
                <div
                  className="wz-spread"
                  style={{ aspectRatio: `${pageCm.w * 2} / ${pageCm.h}` }}
                >
                  <span className="wz-spine" />
                </div>
                <span className="wz-size-note">
                  2-page spread · {round1(pageCm.w * 2)} × {round1(pageCm.h)} cm
                </span>
              </div>
            </div>

            {custom && (
              <div className="wz-adv">
                <div className="wz-grid">
                  <div className="wz-field">
                    <span className="wz-field-name">Unit</span>
                    <select
                      className="wz-unit-sel"
                      value={unit}
                      onChange={(e) => switchUnit(e.target.value as Unit)}
                    >
                      {UNITS.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="wz-field">
                    <span className="wz-field-name">Print DPI</span>
                    <select
                      className="wz-unit-sel"
                      value={dpi}
                      onChange={(e) => setDpi(parseInt(e.target.value, 10))}
                    >
                      {DPI_CHOICES.map((d) => (
                        <option key={d} value={d}>
                          {d} DPI
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="wz-field wz-field-wide">
                    <span className="wz-field-name">Spread size (width × height)</span>
                    <span className="wz-mm-wrap">
                      <input
                        className="wz-cm"
                        type="number"
                        value={sw}
                        onChange={(e) => setSw(e.target.value)}
                      />
                      <span className="wz-x">×</span>
                      <input
                        className="wz-cm"
                        type="number"
                        value={sh}
                        onChange={(e) => setSh(e.target.value)}
                      />
                      <span className="wz-mm-unit">{unit === "in" ? "inch" : unit}</span>
                    </span>
                  </div>
                  <div className="wz-field">
                    <span className="wz-field-name">Safe zone</span>
                    <span className="wz-mm-wrap">
                      <input
                        className="wz-cm"
                        type="number"
                        min={0}
                        max={30}
                        value={safeMm}
                        onChange={(e) => setSafeMm(e.target.value)}
                      />
                      <span className="wz-mm-unit">mm</span>
                    </span>
                  </div>
                  <div className="wz-field">
                    <span className="wz-field-name">Trim (edge cut)</span>
                    <span className="wz-mm-wrap">
                      <input
                        className="wz-cm"
                        type="number"
                        min={0}
                        max={30}
                        value={trimMm}
                        onChange={(e) => setTrimMm(e.target.value)}
                      />
                      <span className="wz-mm-unit">mm</span>
                    </span>
                  </div>
                </div>
              </div>
            )}

            <label className="wz-label">Initial spreads</label>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <input
                className="wz-input"
                type="number"
                min={1}
                max={50}
                value={spreadCount}
                onChange={(e) => setSpreadCount(e.target.value)}
                style={{ width: 90 }}
              />
              <span className="wz-size-note">
                = {(parseInt(spreadCount, 10) || 1) * 2} pages · lab minimum 20 pages
              </span>
            </div>

            <div className="wz-foot">
              <button className="w-btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button className="w-btn primary" onClick={next} disabled={busy}>
                Continue →
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="wz-label">Layout background</label>
            <div className="wz-field">
              <span className="wz-field-name">Page background color</span>
              <span className="wz-mm-wrap">
                <input
                  className="wz-color"
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                />
                <span className="wz-mm-unit">{bgColor}</span>
              </span>
            </div>

            <label className="wz-label">Photos on the page</label>
            <div className="wz-grid">
              <div className="wz-field">
                <span className="wz-field-name">Border around photos</span>
                <span className="wz-mm-wrap">
                  <input
                    className="wz-cm"
                    type="number"
                    min={0}
                    max={200}
                    step={1}
                    value={borderPt}
                    onChange={(e) => setBorderPt(e.target.value)}
                  />
                  <span className="wz-mm-unit">pt</span>
                  <input
                    className="wz-color"
                    type="color"
                    value={borderColor}
                    title="Border color"
                    onChange={(e) => setBorderColor(e.target.value)}
                  />
                </span>
              </div>
              <div className="wz-field">
                <span className="wz-field-name">Gap between photos</span>
                <span className="wz-mm-wrap">
                  <input
                    className="wz-cm"
                    type="number"
                    min={0}
                    max={200}
                    step={1}
                    value={gapPt}
                    onChange={(e) => setGapPt(e.target.value)}
                  />
                  <span className="wz-mm-unit">pt</span>
                </span>
              </div>
            </div>

            <label className="wz-label">Suggested layout set</label>
            <select
              className="wz-input"
              value={layoutSource}
              onChange={(e) => setLayoutSource(e.target.value as LayoutSourceFilter)}
            >
              {LAYOUT_SETS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>

            <div className="wz-foot">
              <button className="w-btn" onClick={() => setStep(1)} disabled={busy}>
                ← Back
              </button>
              <button className="w-btn primary" onClick={finish} disabled={busy}>
                {busy ? "Creating…" : "Create & choose save location"}
              </button>
            </div>
          </>
        )}

        <div className="wz-hint">The project is saved as a .album file — auto-saved as you design.</div>
      </div>
    </div>
  );
}