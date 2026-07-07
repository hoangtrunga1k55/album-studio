import { useState } from "react";
import { useAlbum } from "../store/album";
import { DENSITY_LABELS, type Density } from "../engine/autoLayout";
import { IconClose, IconSparkle } from "../icons";

type Source = "all" | "selected" | "starred";
type Order = "date" | "name";

/** Average photos/spread per density — for the spread-count estimate. */
const DENSITY_AVG: Record<Density, number> = { thua: 1.5, can: 3.5, day: 6 };
const DEFAULT_FULL_BLEED_PCT = 40;

/** SmartAlbums-style Auto Design dialog (Cmd+D): pick photos, order, density
 *  and full-bleed frequency → build the whole album in one click. */
export function AutoDesignDialog({ onClose }: { onClose: () => void }) {
  const images = useAlbum((s) => s.images);
  const photoMeta = useAlbum((s) => s.photoMeta);
  const selectedPhotos = useAlbum((s) => s.selectedPhotos);
  const density = useAlbum((s) => s.density);
  const setDensity = useAlbum((s) => s.setDensity);
  const autoDesign = useAlbum((s) => s.autoDesign);
  const spreads = useAlbum((s) => s.spreads);

  const [source, setSource] = useState<Source>("all");
  const [order, setOrder] = useState<Order>("date");
  const [fullBleed, setFullBleed] = useState(DEFAULT_FULL_BLEED_PCT);

  const usable = images.filter((i) => !photoMeta[i.id]?.rejected);
  const starred = usable.filter((i) => (photoMeta[i.id]?.rating ?? 0) > 0);
  const count =
    source === "selected"
      ? selectedPhotos.length || usable.length
      : source === "starred"
        ? starred.length
        : usable.length;
  const estimate = count > 0 ? Math.max(1, Math.round(count / DENSITY_AVG[density])) : 0;

  const hasWork = spreads.some((sp) => sp.imageIds.some(Boolean));

  function run() {
    autoDesign({ source, order, fullBleedPct: fullBleed });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(440px, 92vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Auto Design</h2>
          <button className="btn icon" onClick={onClose}><IconClose /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <div className="prop-label">Ảnh sử dụng</div>
            <div className="seg-row">
              <button className={"seg" + (source === "all" ? " active" : "")} onClick={() => setSource("all")}>
                Tất cả ({usable.length})
              </button>
              <button
                className={"seg" + (source === "selected" ? " active" : "")}
                onClick={() => setSource("selected")}
                disabled={selectedPhotos.length === 0}
              >
                Đang chọn ({selectedPhotos.length})
              </button>
              <button
                className={"seg" + (source === "starred" ? " active" : "")}
                onClick={() => setSource("starred")}
                disabled={starred.length === 0}
              >
                Có sao ★ ({starred.length})
              </button>
            </div>
          </div>

          <div>
            <div className="prop-label">Thứ tự ảnh</div>
            <div className="seg-row">
              <button className={"seg" + (order === "date" ? " active" : "")} onClick={() => setOrder("date")}>
                Thời gian chụp
              </button>
              <button className={"seg" + (order === "name" ? " active" : "")} onClick={() => setOrder("name")}>
                Tên file
              </button>
            </div>
          </div>

          <div>
            <div className="prop-label">Mật độ ảnh / spread</div>
            <div className="seg-row">
              {DENSITY_LABELS.map((d) => (
                <button
                  key={d.id}
                  className={"seg" + (density === d.id ? " active" : "")}
                  onClick={() => setDensity(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="prop-label">Spread 1 ảnh lớn (full-bleed) · {fullBleed}%</div>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={fullBleed}
              onChange={(e) => setFullBleed(parseInt(e.target.value, 10))}
              style={{ width: "100%" }}
            />
            <div className="hint-sm">Ảnh có sao ★ được ưu tiên vào các spread 1 ảnh.</div>
          </div>

          <div className="hint-sm" style={{ textAlign: "center" }}>
            {count} ảnh → khoảng <b>{estimate}</b> spread
            {hasWork && <><br />⚠ Album hiện tại sẽ được thay bằng thiết kế mới.</>}
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Huỷ</button>
          <button className="btn primary" onClick={run} disabled={count === 0}>
            <IconSparkle /> Thiết kế ({estimate} spread)
          </button>
        </div>
      </div>
    </div>
  );
}