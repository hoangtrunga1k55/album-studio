import { useEffect, useState } from "react";
import { useAlbum } from "../store/album";
import type { TemplateReuse } from "../engine/autoLayout";
import { getPreferredSource, type LayoutSourceFilter } from "../engine/templates";
import { IconClose, IconSparkle } from "../icons";

type Source = "all" | "selected" | "starred";
type Order = "date" | "name";

const LAYOUT_SOURCES: { id: LayoutSourceFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "basic", label: "Basic" },
  { id: "tizino", label: "Tizino" },
  { id: "custom", label: "My templates" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mật độ quen thuộc (topbar cũ) → khoảng ảnh/spread, dùng làm preset. */
const DENSITY_PRESETS: { id: "thua" | "can" | "day"; label: string; range: [number, number] }[] = [
  { id: "thua", label: "Sparse", range: [1, 2] },
  { id: "can", label: "Balanced", range: [3, 4] },
  { id: "day", label: "Dense", range: [5, 8] },
];

/** SmartAlbums dual-handle slider: two overlapped range inputs, one track. */
function DualRange({
  min, max, lo, hi, onChange,
}: {
  min: number;
  max: number;
  lo: number;
  hi: number;
  onChange: (lo: number, hi: number) => void;
}) {
  const span = max - min;
  const pctL = ((lo - min) / span) * 100;
  const pctR = ((hi - min) / span) * 100;
  return (
    <div className="dual-range">
      <div className="dr-track" />
      <div className="dr-fill" style={{ left: `${pctL}%`, width: `${pctR - pctL}%` }} />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={lo}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChange(Math.min(v, hi), Math.max(v, hi));
        }}
      />
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={hi}
        onChange={(e) => {
          const v = parseInt(e.target.value, 10);
          onChange(Math.min(lo, v), Math.max(lo, v));
        }}
      />
      <span className="dr-label">{lo} – {hi} photos</span>
    </div>
  );
}

/** SmartAlbums "Auto Build" (Cmd+D): chọn SỐ SPREAD mong muốn, khoảng ảnh mỗi
 *  spread (Smart / Specify range) và mức lặp layout — xem trước bằng 2 thẻ số. */
export function AutoDesignDialog({ onClose }: { onClose: () => void }) {
  const images = useAlbum((s) => s.images);
  const photoMeta = useAlbum((s) => s.photoMeta);
  const selectedPhotos = useAlbum((s) => s.selectedPhotos);
  const autoDesign = useAlbum((s) => s.autoDesign);
  const fillTemplateSlots = useAlbum((s) => s.fillTemplateSlots);
  const spreads = useAlbum((s) => s.spreads);
  const setStoreDensity = useAlbum((s) => s.setDensity);

  // Content spreads that already carry a layout (e.g. from an album template)
  // → offer "pour photos into the existing slots" instead of new layouts.
  const contentSpreads = spreads.filter((sp) => !sp.isCover).length;
  // Always open on the first tab (New layouts).
  const [mode, setMode] = useState<"build" | "fill">("build");

  const [source, setSource] = useState<Source>("all");
  const [order, setOrder] = useState<Order>("date");
  const [layoutSource, setLayoutSource] = useState<LayoutSourceFilter>(() => getPreferredSource());
  const [smart, setSmart] = useState(true);
  const [lo, setLo] = useState(1);
  const [hi, setHi] = useState(5);
  const [reuse, setReuse] = useState<TemplateReuse>("medium");
  // SmartAlbums smart grouping toggles — on by default
  const [gTime, setGTime] = useState(true);
  const [gBW, setGBW] = useState(true);
  const [gMeta, setGMeta] = useState(true);

  const usable = images.filter((i) => !photoMeta[i.id]?.rejected);
  const starred = usable.filter((i) => (photoMeta[i.id]?.rating ?? 0) > 0);
  const liveCount =
    source === "selected"
      ? selectedPhotos.length || usable.length
      : source === "starred"
        ? starred.length
        : usable.length;

  // Import streams photos in ONE BY ONE — if the dialog is open meanwhile,
  // every photo would bump the numbers (slider bounds, default spread count)
  // and the whole modal jitters. Settle on the count only after it stops
  // changing for a moment; while it is moving, lock the Build button.
  const [count, setCount] = useState(liveCount);
  useEffect(() => {
    const t = setTimeout(() => setCount(liveCount), 400);
    return () => clearTimeout(t);
  }, [liveCount]);
  const importStreaming = useAlbum((s) => s.importing);
  const importing = importStreaming || liveCount !== count;

  // Range in effect: Smart lets the planner breathe across 1..8.
  const effLo = smart ? 1 : lo;
  const effHi = smart ? Math.min(8, Math.max(1, count)) : hi;
  // How many spreads the range allows for `count` photos.
  const minS = count > 0 ? Math.max(1, Math.ceil(count / effHi)) : 1;
  const maxS = count > 0 ? Math.max(minS, Math.floor(count / Math.max(1, effLo))) : 1;

  const [spreadCount, setSpreadCount] = useState(0); // 0 = "chưa đụng" → default
  const defaultS = clamp(Math.round(count / 3.5) || 1, minS, maxS);
  const S = clamp(spreadCount || defaultS, minS, maxS);

  // Photo count / range changes can shrink the bounds — keep the slider valid.
  useEffect(() => {
    if (spreadCount && (spreadCount < minS || spreadCount > maxS)) {
      setSpreadCount(clamp(spreadCount, minS, maxS));
    }
  }, [minS, maxS, spreadCount]);

  const hasWork = spreads.some((sp) => sp.imageIds.some(Boolean));

  function run() {
    if (mode === "fill") fillTemplateSlots({ source, order });
    else
      autoDesign({
        source,
        order,
        spreads: S,
        range: [effLo, effHi],
        smart,
        reuse,
        layoutSource,
        grouping: { timeBlocks: gTime, blackWhite: gBW, metadata: gMeta },
      });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(480px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Auto Design · {importing ? `importing photos… (${liveCount})` : `${count} photos`}</h2>
          <button className="btn icon" title="Close" onClick={onClose}><IconClose /></button>
        </div>

        <div className="modal-body">
          {/* mode: generate fresh layouts vs pour photos into existing ones */}
          {contentSpreads > 0 && (
            <div>
              <div className="prop-label">Build mode</div>
              <div className="seg-row">
                <button className={"seg" + (mode === "build" ? " active" : "")} onClick={() => setMode("build")}>
                  New layouts
                </button>
                <button className={"seg" + (mode === "fill" ? " active" : "")} onClick={() => setMode("fill")}>
                  Fill photos into template ({contentSpreads})
                </button>
              </div>
              {mode === "fill" && (
                <div className="hint-sm">
                  Keep the layout/text/typo/elements of {contentSpreads} spreads, just fill photos into slots in order.
                </div>
              )}
            </div>
          )}

          {mode === "build" && (
          <>
          {/* SmartAlbums preview cards */}
          <div className="ab-cards">
            <div className="ab-card">
              <div className="ab-num">{S}</div>
              <div className="ab-cap">Spreads ({S * 2} pages)</div>
            </div>
            <div className="ab-card">
              <div className="ab-num">
                {effLo}
                <span className="ab-to">to</span>
                {effHi}
              </div>
              <div className="ab-cap">Photos per spread</div>
            </div>
          </div>

          <div>
            <div className="prop-label">Target spreads · {minS}–{maxS}</div>
            <input
              type="range"
              min={minS}
              max={maxS}
              step={1}
              value={S}
              onChange={(e) => setSpreadCount(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
              disabled={count === 0 || minS === maxS}
            />
          </div>

          <div>
            <div className="prop-label">Grouping</div>
            <div className="seg-row">
              <button className={"seg" + (smart ? " active" : "")} onClick={() => setSmart(true)}>
                Smart
              </button>
              <button className={"seg" + (!smart ? " active" : "")} onClick={() => setSmart(false)}>
                Custom range
              </button>
            </div>
            {!smart && (
              <>
                {/* preset chips — mật độ quen thuộc, nay nằm ngay trong dialog */}
                <div className="seg-row" style={{ marginTop: 8 }}>
                  {DENSITY_PRESETS.map((d) => (
                    <button
                      key={d.id}
                      className={"seg" + (lo === d.range[0] && hi === d.range[1] ? " active" : "")}
                      onClick={() => {
                        setLo(d.range[0]);
                        setHi(d.range[1]);
                        setStoreDensity(d.id);
                      }}
                    >
                      {d.label} ({d.range[0]}–{d.range[1]})
                    </button>
                  ))}
                </div>
                <DualRange
                  min={1}
                  max={8}
                  lo={lo}
                  hi={hi}
                  onChange={(a, b) => {
                    setLo(a);
                    setHi(b);
                  }}
                />
              </>
            )}
          </div>
          </>
          )}

          <div className="seg-2">
            {mode === "build" && (
            <div>
              <div className="prop-label">Layout reuse</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={reuse}
                onChange={(e) => setReuse(e.target.value as TemplateReuse)}
              >
                <option value="low">Low — most varied layouts</option>
                <option value="medium">Medium</option>
                <option value="high">High — allow free reuse</option>
              </select>
            </div>
            )}
            {mode === "build" && (
            <div>
              <div className="prop-label">Layout source</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={layoutSource}
                onChange={(e) => setLayoutSource(e.target.value as LayoutSourceFilter)}
              >
                {LAYOUT_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
            )}
            <div>
              <div className="prop-label">Photo order</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={order}
                onChange={(e) => setOrder(e.target.value as Order)}
              >
                <option value="date">Capture time</option>
                <option value="name">File name</option>
              </select>
            </div>
          </div>

          {mode === "build" && (
            <div className="prop-group" style={{ marginTop: 4 }}>
              <div className="prop-label">Smart grouping</div>
              <label className="ad-check">
                <input type="checkbox" checked={gTime} onChange={(e) => setGTime(e.target.checked)} />
                <span>Blocks of time <small>— split on long time gaps</small></span>
              </label>
              <label className="ad-check">
                <input type="checkbox" checked={gBW} onChange={(e) => setGBW(e.target.checked)} />
                <span>Black &amp; White <small>— keep B&amp;W apart from colour</small></span>
              </label>
              <label className="ad-check">
                <input type="checkbox" checked={gMeta} onChange={(e) => setGMeta(e.target.checked)} />
                <span>Metadata <small>— new block each capture day</small></span>
              </label>
            </div>
          )}

          <div>
            <div className="prop-label">Photos to use</div>
            <select
              className="input"
              style={{ width: "100%" }}
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
            >
              <option value="all">All ({usable.length})</option>
              <option value="selected" disabled={selectedPhotos.length === 0}>
                Selected ({selectedPhotos.length})
              </option>
              <option value="starred" disabled={starred.length === 0}>
                Starred ★ ({starred.length})
              </option>
            </select>
            <div className="hint-sm">Single-photo spreads prefer a nearby starred ★ photo.</div>
          </div>

          {mode === "build" && hasWork && (
            <div className="hint-sm" style={{ textAlign: "center" }}>
              ⚠ The current album will be replaced with a new design (cover kept).
            </div>
          )}
          {mode === "fill" && (
            <div className="hint-sm" style={{ textAlign: "center" }}>
              Fill photos into {contentSpreads} existing spreads (keep layout · cover kept).
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={run} disabled={count === 0 || importing}>
            <IconSparkle />{" "}
            {importing
              ? "Importing photos…"
              : mode === "fill"
                ? `Fill photos into ${contentSpreads} spreads`
                : `Auto Build (${S} spreads)`}
          </button>
        </div>
      </div>
    </div>
  );
}