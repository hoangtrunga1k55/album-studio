import { useState } from "react";
import { ALBUM_SIZES, parseSizeCm } from "../engine/templates";
import { saveCustomDefaults, useAlbum, type AlbumSettings } from "../store/album";

const CUSTOM_MIN_CM = 5;
const CUSTOM_MAX_CM = 60;

/** Album-wide config (khổ/tỷ lệ, khoảng cách, viền, DPI) — lives in the right
 *  panel's Layout tab. Custom-size albums remember their edits for next time. */
export function AlbumConfig() {
  const size = useAlbum((s) => s.size);
  const settings = useAlbum((s) => s.settings);
  const setSettings = useAlbum((s) => s.setSettings);
  const setSize = useAlbum((s) => s.setSize);

  const isCustomSize = !!size && !ALBUM_SIZES.some((a) => a.id === size);
  const [customMode, setCustomMode] = useState(isCustomSize);
  const [wCm, setWCm] = useState(() => String(parseSizeCm(size)?.w ?? 25));
  const [hCm, setHCm] = useState(() => String(parseSizeCm(size)?.h ?? 35));

  if (!size) return null;

  function patchSettings(patch: Partial<AlbumSettings>) {
    setSettings(patch);
    // custom albums remember their settings for the next custom album
    if (isCustomSize) saveCustomDefaults({ ...settings, ...patch });
  }

  function applySize(next: string, label: string) {
    if (!next || next === size) return;
    if (
      !window.confirm(
        `Change album size to ${label}?\n\nSpreads whose layout doesn't fit the new size will ` +
          `be relaid out (photos kept, but manual frames/alignment may change).`
      )
    )
      return;
    setSize(next);
  }

  function onSizeSelect(v: string) {
    if (v === "__custom__") {
      setCustomMode(true);
      return;
    }
    setCustomMode(false);
    applySize(v, ALBUM_SIZES.find((a) => a.id === v)?.label ?? v);
  }

  function applyCustomSize() {
    const w = Math.round(parseFloat(wCm) * 10) / 10;
    const h = Math.round(parseFloat(hCm) * 10) / 10;
    const ok = (n: number) => Number.isFinite(n) && n >= CUSTOM_MIN_CM && n <= CUSTOM_MAX_CM;
    if (!ok(w) || !ok(h)) {
      window.alert(`One-page size must be ${CUSTOM_MIN_CM}–${CUSTOM_MAX_CM} cm.`);
      return;
    }
    applySize(`${w}x${h}`, `${w}×${h} cm (custom)`);
  }

  return (
    <div className="prop-group">
      <div className="prop-label">Album size &amp; settings</div>
      <div className="set-cfg-grid">
        <label className="set-cfg">
          <span>Size / ratio</span>
          <select
            className="input"
            value={customMode || isCustomSize ? "__custom__" : size}
            onChange={(e) => onSizeSelect(e.target.value)}
          >
            {ALBUM_SIZES.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
            <option value="__custom__">Custom (enter values)…</option>
          </select>
        </label>
        {(customMode || isCustomSize) && (
          <label className="set-cfg" style={{ gridColumn: "1 / -1" }}>
            <span>One page (cm) · W × H</span>
            <div className="prop-row" style={{ gap: 6 }}>
              <input
                className="input"
                type="number"
                min={CUSTOM_MIN_CM}
                max={CUSTOM_MAX_CM}
                step={0.5}
                value={wCm}
                onChange={(e) => setWCm(e.target.value)}
                style={{ width: 64 }}
              />
              <span style={{ alignSelf: "center" }}>×</span>
              <input
                className="input"
                type="number"
                min={CUSTOM_MIN_CM}
                max={CUSTOM_MAX_CM}
                step={0.5}
                value={hCm}
                onChange={(e) => setHCm(e.target.value)}
                style={{ width: 64 }}
              />
              <button className="btn" onClick={applyCustomSize}>
                Apply
              </button>
            </div>
          </label>
        )}
        <label className="set-cfg">
          <span>Photo border (pt)</span>
          <input
            className="input"
            type="number"
            min={0}
            step={1}
            value={settings.borderPt}
            onChange={(e) => patchSettings({ borderPt: Math.max(0, +e.target.value || 0) })}
          />
        </label>
        <label className="set-cfg">
          <span>Border color</span>
          <input
            className="input"
            type="color"
            value={settings.borderColor}
            onChange={(e) => patchSettings({ borderColor: e.target.value })}
            style={{ height: 34, padding: 2 }}
          />
        </label>
      </div>
      <div className="hint-sm">
        Applies immediately{isCustomSize ? " · remembered for custom albums." : "."}
      </div>
    </div>
  );
}
