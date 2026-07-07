import { useState } from "react";
import { ALBUM_SIZES, type AlbumSize } from "../engine/templates";
import { createProject, openProject } from "../flows/projectIO";
import { loadRecents, forgetRecent, type RecentProject } from "../store/project";
import "./Welcome.css";

/** SmartAlbums-style welcome: New Album / Open Album + recent projects. */
export function Welcome() {
  const [recents, setRecents] = useState<RecentProject[]>(loadRecents());
  const [wizard, setWizard] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleOpen(path?: string) {
    setBusy(true);
    try {
      await openProject(path);
    } catch (e) {
      alert("Không mở được project: " + String(e));
      if (path) {
        forgetRecent(path);
        setRecents(loadRecents());
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="welcome">
      <div className="welcome-card">
        <div className="welcome-brand">
          <div className="welcome-mark">A</div>
          <h1>Album Studio</h1>
          <p className="welcome-sub">Thiết kế album ảnh cưới chuyên nghiệp</p>
        </div>

        <div className="welcome-actions">
          <button className="w-btn primary" onClick={() => setWizard(true)} disabled={busy}>
            + Tạo album mới
          </button>
          <button className="w-btn" onClick={() => handleOpen()} disabled={busy}>
            Mở album…
          </button>
        </div>

        {recents.length > 0 && (
          <div className="welcome-recents">
            <div className="recents-title">Gần đây</div>
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

/** SmartAlbums-style "New Album": name + size (presets or custom W×H + unit),
 *  then pick where the file lives. */
function NewAlbumWizard({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [size, setSize] = useState<AlbumSize>("25x35");
  const [custom, setCustom] = useState(false);
  const [cw, setCw] = useState("30");
  const [ch, setCh] = useState("30");
  const [unit, setUnit] = useState<Unit>("cm");
  const [busy, setBusy] = useState(false);

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
    setCw(conv(cw));
    setCh(conv(ch));
    setUnit(next);
  }

  function customSize(): AlbumSize | null {
    const toCm = UNITS.find((u) => u.id === unit)!.toCm;
    const round1 = (v: number) => Math.round(v * 10) / 10;
    const w = round1(toCm(parseFloat(cw)));
    const h = round1(toCm(parseFloat(ch)));
    const ok = (v: number) => Number.isFinite(v) && v >= CUSTOM_MIN_CM && v <= CUSTOM_MAX_CM;
    if (!ok(w) || !ok(h)) return null;
    return `${w}x${h}`;
  }

  async function finish() {
    const chosen = custom ? customSize() : size;
    if (!chosen) {
      alert(`Kích thước tuỳ chỉnh phải từ ${CUSTOM_MIN_CM}–${CUSTOM_MAX_CM} cm.`);
      return;
    }
    setBusy(true);
    try {
      const ok = await createProject(name, chosen);
      if (ok) onClose();
    } catch (e) {
      alert("Không tạo được project: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  const cwNum = parseFloat(cw);
  const chNum = parseFloat(ch);
  const customRatio =
    Number.isFinite(cwNum) && Number.isFinite(chNum) && cwNum > 0 && chNum > 0
      ? `${cwNum} / ${chNum}`
      : "1 / 1";

  return (
    <div className="wizard-overlay" onClick={busy ? undefined : onClose}>
      <div className="wizard" onClick={(e) => e.stopPropagation()}>
        <h2>Album mới</h2>

        <label className="wz-label">Tên album</label>
        <input
          className="wz-input"
          placeholder="VD: Hiền & Hiếu 2026"
          value={name}
          autoFocus
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && finish()}
        />

        <label className="wz-label">Khổ album</label>
        <div className="wz-sizes">
          {ALBUM_SIZES.map((s) => (
            <button
              key={s.id}
              className={"wz-size" + (!custom && size === s.id ? " active" : "")}
              onClick={() => {
                setCustom(false);
                setSize(s.id);
              }}
            >
              <span
                className="wz-size-shape"
                style={{ aspectRatio: s.id === "30x30" ? "1 / 1" : "25 / 35" }}
              />
              <span className="wz-size-label">{s.label}</span>
              <span className="wz-size-note">{s.note}</span>
            </button>
          ))}
          <button
            className={"wz-size" + (custom ? " active" : "")}
            onClick={() => setCustom(true)}
          >
            <span className="wz-size-shape" style={{ aspectRatio: customRatio }} />
            <span className="wz-size-label">Tuỳ chỉnh</span>
            {custom ? (
              <span className="wz-custom" onClick={(e) => e.stopPropagation()}>
                <input
                  className="wz-cm"
                  type="number"
                  value={cw}
                  onChange={(e) => setCw(e.target.value)}
                />
                <span className="wz-x">×</span>
                <input
                  className="wz-cm"
                  type="number"
                  value={ch}
                  onChange={(e) => setCh(e.target.value)}
                />
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
              </span>
            ) : (
              <span className="wz-size-note">Rộng × cao · cm / inch / px</span>
            )}
          </button>
        </div>

        <div className="wz-foot">
          <button className="w-btn" onClick={onClose} disabled={busy}>
            Huỷ
          </button>
          <button className="w-btn primary" onClick={finish} disabled={busy}>
            {busy ? "Đang tạo…" : "Tạo & chọn nơi lưu"}
          </button>
        </div>
        <div className="wz-hint">Project sẽ được lưu thành file .album — tự động lưu khi bạn thiết kế.</div>
      </div>
    </div>
  );
}