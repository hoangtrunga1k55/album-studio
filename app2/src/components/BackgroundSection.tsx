/** F6 — Background section (Layout tab): per-spread color, A/B split, opacity
 *  and procedural noise. Absent override = inherits the album `bgColor`; the
 *  first edit seeds from it, and Reset drops back to the album default. */

import { useAlbum, resolveSpreadBg } from "../store/album";

/** 0..1 fraction → 0..100 integer for the sliders. */
const pct = (f: number) => Math.round(f * 100);

export function BackgroundSection() {
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const albumBg = useAlbum((s) => s.bgColor);
  const setSpreadBg = useAlbum((s) => s.setSpreadBg);
  const resetSpreadBg = useAlbum((s) => s.resetSpreadBg);

  const spread = spreads[currentIndex];
  if (!spread) return null;

  const bg = resolveSpreadBg(spread, albumBg);
  const overridden = !!spread.bg;

  return (
    <div className="prop-group">
      <div className="prop-label">Background</div>

      {/* color A + optional B */}
      <div className="prop-row" style={{ marginBottom: 8 }}>
        <input
          className="input"
          type="color"
          value={bg.color}
          onChange={(e) => setSpreadBg({ color: e.target.value })}
          style={{ height: 32, padding: 2, flex: 1 }}
          title="Color A"
        />
        {bg.split && (
          <input
            className="input"
            type="color"
            value={bg.colorB}
            onChange={(e) => setSpreadBg({ colorB: e.target.value })}
            style={{ height: 32, padding: 2, flex: 1 }}
            title="Color B (right half)"
          />
        )}
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, marginBottom: 10 }}>
        <input
          type="checkbox"
          checked={bg.split}
          onChange={(e) => setSpreadBg({ split: e.target.checked })}
        />
        <span>Split A / B (two halves)</span>
      </label>

      {/* opacity */}
      <div className="prop-row" style={{ marginBottom: 8 }}>
        <span style={{ width: 52, fontSize: 11, color: "var(--text-dim)" }}>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pct(bg.opacity)}
          onChange={(e) => setSpreadBg({ opacity: +e.target.value / 100 })}
          style={{ flex: 1 }}
        />
        <span style={{ width: 26, textAlign: "right", fontSize: 11 }}>{pct(bg.opacity)}</span>
      </div>

      {/* noise / grain */}
      <div className="prop-row" style={{ marginBottom: 10 }}>
        <span style={{ width: 52, fontSize: 11, color: "var(--text-dim)" }}>Noise</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pct(bg.noise)}
          onChange={(e) => setSpreadBg({ noise: +e.target.value / 100 })}
          style={{ flex: 1 }}
        />
        <span style={{ width: 26, textAlign: "right", fontSize: 11 }}>{pct(bg.noise)}</span>
      </div>

      <button
        className="btn"
        disabled={!overridden}
        onClick={() => resetSpreadBg()}
        title="Back to the album background color"
        style={{ width: "100%" }}
      >
        Reset to album background
      </button>
      {!overridden && (
        <div className="hint-sm">Using the album background. Edit above to override this spread.</div>
      )}
    </div>
  );
}