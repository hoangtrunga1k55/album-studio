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
        `Đổi khổ album sang ${label}?\n\nCác spread có layout không hợp khổ mới sẽ ` +
          `được dàn lại (giữ ảnh, nhưng khung/căn chỉnh tay có thể thay đổi).`
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
      window.alert(`Kích thước 1 trang phải từ ${CUSTOM_MIN_CM}–${CUSTOM_MAX_CM} cm.`);
      return;
    }
    applySize(`${w}x${h}`, `${w}×${h} cm (tuỳ chỉnh)`);
  }

  return (
    <div className="prop-group">
      <div className="prop-label">Khổ &amp; thông số album</div>
      <div className="set-cfg-grid">
        <label className="set-cfg">
          <span>Khổ / tỷ lệ</span>
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
            <option value="__custom__">Tuỳ chỉnh (nhập số)…</option>
          </select>
        </label>
        {(customMode || isCustomSize) && (
          <label className="set-cfg" style={{ gridColumn: "1 / -1" }}>
            <span>Khổ 1 trang (cm) · Rộng × Cao</span>
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
                Áp dụng
              </button>
            </div>
          </label>
        )}
        <label className="set-cfg">
          <span>Viền ảnh (pt)</span>
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
          <span>Màu viền</span>
          <input
            className="input"
            type="color"
            value={settings.borderColor}
            onChange={(e) => patchSettings({ borderColor: e.target.value })}
            style={{ height: 32, padding: 2 }}
          />
        </label>
      </div>
      <div className="hint-sm">
        Đổi ở đây áp dụng ngay cho album đang mở
        {isCustomSize ? " và được nhớ cho album tuỳ chỉnh lần sau." : "."}
      </div>
    </div>
  );
}
