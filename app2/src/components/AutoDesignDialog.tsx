import { useEffect, useState } from "react";
import { useAlbum } from "../store/album";
import type { TemplateReuse } from "../engine/autoLayout";
import { getPreferredSource, type LayoutSourceFilter } from "../engine/templates";
import { IconClose, IconSparkle } from "../icons";

type Source = "all" | "selected" | "starred";
type Order = "date" | "name";

const LAYOUT_SOURCES: { id: LayoutSourceFilter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "basic", label: "Cơ bản" },
  { id: "tizino", label: "Tizino" },
  { id: "custom", label: "Mẫu của tôi" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mật độ quen thuộc (topbar cũ) → khoảng ảnh/spread, dùng làm preset. */
const DENSITY_PRESETS: { id: "thua" | "can" | "day"; label: string; range: [number, number] }[] = [
  { id: "thua", label: "Thưa", range: [1, 2] },
  { id: "can", label: "Cân", range: [3, 4] },
  { id: "day", label: "Dày", range: [5, 8] },
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
      <span className="dr-label">{lo} – {hi} ảnh</span>
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
  const anyPhotos = spreads.some((sp) => sp.imageIds.some(Boolean));
  // Default to fill when the album has empty pre-built spreads (template case).
  const [mode, setMode] = useState<"build" | "fill">(
    contentSpreads > 0 && !anyPhotos ? "fill" : "build"
  );

  const [source, setSource] = useState<Source>("all");
  const [order, setOrder] = useState<Order>("date");
  const [layoutSource, setLayoutSource] = useState<LayoutSourceFilter>(() => getPreferredSource());
  const [smart, setSmart] = useState(true);
  const [lo, setLo] = useState(1);
  const [hi, setHi] = useState(5);
  const [reuse, setReuse] = useState<TemplateReuse>("medium");

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
    else autoDesign({ source, order, spreads: S, range: [effLo, effHi], smart, reuse, layoutSource });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(480px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Auto Design · {importing ? `đang nhập ảnh… (${liveCount})` : `${count} ảnh`}</h2>
          <button className="btn icon" title="Đóng" onClick={onClose}><IconClose /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {/* mode: generate fresh layouts vs pour photos into existing ones */}
          {contentSpreads > 0 && (
            <div>
              <div className="prop-label">Cách dàn</div>
              <div className="seg-row">
                <button className={"seg" + (mode === "build" ? " active" : "")} onClick={() => setMode("build")}>
                  Tạo layout mới
                </button>
                <button className={"seg" + (mode === "fill" ? " active" : "")} onClick={() => setMode("fill")}>
                  Đổ ảnh vào mẫu ({contentSpreads})
                </button>
              </div>
              {mode === "fill" && (
                <div className="hint-sm">
                  Giữ nguyên layout/chữ/typo/element của {contentSpreads} spread, chỉ đổ ảnh vào slot theo thứ tự.
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
              <div className="ab-cap">Spread ({S * 2} trang)</div>
            </div>
            <div className="ab-card">
              <div className="ab-num">
                {effLo}
                <span className="ab-to">đến</span>
                {effHi}
              </div>
              <div className="ab-cap">Ảnh mỗi spread</div>
            </div>
          </div>

          <div>
            <div className="prop-label">Số spread mong muốn · {minS}–{maxS}</div>
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
            <div className="prop-label">Nhóm ảnh</div>
            <div className="seg-row">
              <button className={"seg" + (smart ? " active" : "")} onClick={() => setSmart(true)}>
                Thông minh
              </button>
              <button className={"seg" + (!smart ? " active" : "")} onClick={() => setSmart(false)}>
                Tự chọn khoảng
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
              <div className="prop-label">Lặp layout</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={reuse}
                onChange={(e) => setReuse(e.target.value as TemplateReuse)}
              >
                <option value="low">Thấp — layout đa dạng nhất</option>
                <option value="medium">Vừa</option>
                <option value="high">Cao — cho phép lặp thoải mái</option>
              </select>
            </div>
            )}
            {mode === "build" && (
            <div>
              <div className="prop-label">Nguồn layout</div>
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
              <div className="prop-label">Thứ tự ảnh</div>
              <select
                className="input"
                style={{ width: "100%" }}
                value={order}
                onChange={(e) => setOrder(e.target.value as Order)}
              >
                <option value="date">Thời gian chụp</option>
                <option value="name">Tên file</option>
              </select>
            </div>
          </div>

          <div>
            <div className="prop-label">Ảnh sử dụng</div>
            <select
              className="input"
              style={{ width: "100%" }}
              value={source}
              onChange={(e) => setSource(e.target.value as Source)}
            >
              <option value="all">Tất cả ({usable.length})</option>
              <option value="selected" disabled={selectedPhotos.length === 0}>
                Đang chọn ({selectedPhotos.length})
              </option>
              <option value="starred" disabled={starred.length === 0}>
                Có sao ★ ({starred.length})
              </option>
            </select>
            <div className="hint-sm">Spread 1 ảnh ưu tiên ảnh có sao ★ gần đó.</div>
          </div>

          {mode === "build" && hasWork && (
            <div className="hint-sm" style={{ textAlign: "center" }}>
              ⚠ Album hiện tại sẽ được thay bằng thiết kế mới (bìa giữ nguyên).
            </div>
          )}
          {mode === "fill" && (
            <div className="hint-sm" style={{ textAlign: "center" }}>
              Đổ ảnh vào {contentSpreads} spread có sẵn (giữ layout · bìa giữ nguyên).
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" onClick={run} disabled={count === 0 || importing}>
            <IconSparkle />{" "}
            {importing
              ? "Đang nhập ảnh…"
              : mode === "fill"
                ? `Đổ ảnh vào ${contentSpreads} spread`
                : `Auto Build (${S} spread)`}
          </button>
        </div>
      </div>
    </div>
  );
}