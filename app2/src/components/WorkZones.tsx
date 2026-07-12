import { useState, type DragEvent } from "react";
import { getTemplate } from "../engine/templates";
import { spreadLabel, useAlbum } from "../store/album";
import { IMAGE_DND_KEY } from "../constants";
import { IconPlus } from "../icons";

function draggedIds(e: DragEvent): string[] {
  return (e.dataTransfer.getData(IMAGE_DND_KEY) || "").split(",").filter(Boolean);
}

function acceptsImage(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(IMAGE_DND_KEY);
}

/** Left rail: the PREVIOUS spread in miniature (like the right rail shows the
 *  next one). The cover IS position 0 — standing on it, there is nothing to
 *  the left. */
export function PrevSpreadZone() {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const setCurrent = useAlbum((s) => s.setCurrent);
  const [over, setOver] = useState(false);

  // Standing on the very first item (the cover) → nothing to show on the left.
  if (currentIndex === 0) return null;

  const prev = spreads[currentIndex - 1];
  const tpl = prev ? getTemplate(prev.templateId) : undefined;
  const bg = prev?.bgImageId ? images.find((im) => im.id === prev.bgImageId) : undefined;

  return (
    <div
      className={"side-zone left" + (over ? " over" : "")}
      title="Spread trước — click để chuyển, thả ảnh để thêm"
      onClick={() => setCurrent(currentIndex - 1)}
      onDragOver={(e) => {
        if (!acceptsImage(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const ids = draggedIds(e);
        if (ids.length) useAlbum.getState().addToSpreadAt(currentIndex - 1, ids);
      }}
    >
      {prev && (
        <div className="sz-next">
          <div
            className="sz-prev"
            style={{
              aspectRatio: String(tpl?.ratioWH || 2),
              backgroundImage: tpl?.bg ? `url(${tpl.bg})` : undefined,
            }}
          >
            {bg && <img className="fs2-bg" src={bg.thumb} alt="" draggable={false} />}
            {(tpl?.slots ?? []).map((s, i) => {
              const id = prev.imageIds[i];
              const img = id ? images.find((im) => im.id === id) : undefined;
              if (!img && prev.bgImageId) return null;
              return (
                <div
                  key={i}
                  className="spread-slot"
                  style={{
                    left: `${s.x * 100}%`,
                    top: `${s.y * 100}%`,
                    width: `${s.w * 100}%`,
                    height: `${s.h * 100}%`,
                    background: img ? undefined : "#eceaf2",
                  }}
                >
                  {img && <img src={img.thumb} alt="" draggable={false} />}
                </div>
              );
            })}
          </div>
          <span className="sz-label">← {spreadLabel(spreads, currentIndex - 1)}</span>
        </div>
      )}
    </div>
  );
}

/** Right rail: the NEXT spread in miniature — click to go there, drop photos
 *  to add to it ("+" creates one at the end of the album). */
export function NextSpreadZone() {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const setCurrent = useAlbum((s) => s.setCurrent);
  const addSpread = useAlbum((s) => s.addSpread);
  const [over, setOver] = useState(false);

  const next = spreads[currentIndex + 1];
  const tpl = next ? getTemplate(next.templateId) : undefined;

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    const ids = draggedIds(e);
    if (ids.length === 0) return;
    const st = useAlbum.getState();
    if (next) {
      st.addToSpreadAt(currentIndex + 1, ids);
    } else {
      // No next spread yet → create one at the end and fill it. `st` is a
      // pre-add snapshot, so the appended spread lands at the OLD length.
      const appendedIndex = st.spreads.length;
      st.addSpread();
      st.addToSpreadAt(appendedIndex, ids);
    }
  }

  return (
    <div
      className={"side-zone right" + (over ? " over" : "")}
      title={next ? "Spread kế tiếp — click để chuyển, thả ảnh để thêm" : "Thêm spread mới"}
      onClick={() => (next ? setCurrent(currentIndex + 1) : addSpread())}
      onDragOver={(e) => {
        if (!acceptsImage(e)) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
    >
      {next ? (
        <div className="sz-next">
          <div
            className="sz-prev"
            style={{
              aspectRatio: String(tpl?.ratioWH || 2),
              backgroundImage: tpl?.bg ? `url(${tpl.bg})` : undefined,
            }}
          >
            {/* full-bleed background photo under everything (§6.5) */}
            {next.bgImageId &&
              (() => {
                const bg = images.find((im) => im.id === next.bgImageId);
                return bg ? <img className="fs2-bg" src={bg.thumb} alt="" draggable={false} /> : null;
              })()}
            {(tpl?.slots ?? []).map((s, i) => {
              const id = next.imageIds[i];
              const img = id ? images.find((im) => im.id === id) : undefined;
              if (!img && next.bgImageId) return null;
              return (
                <div
                  key={i}
                  className="spread-slot"
                  style={{
                    left: `${s.x * 100}%`,
                    top: `${s.y * 100}%`,
                    width: `${s.w * 100}%`,
                    height: `${s.h * 100}%`,
                    background: img ? undefined : "#eceaf2",
                  }}
                >
                  {img && <img src={img.thumb} alt="" draggable={false} />}
                </div>
              );
            })}
          </div>
          <span className="sz-label">{spreadLabel(spreads, currentIndex + 1)} →</span>
        </div>
      ) : (
        <span className="sz-label sz-add">
          <IconPlus width={18} height={18} />
          Thêm spread
          <br />
          hoặc thả ảnh
          <br />
          vào đây
        </span>
      )}
    </div>
  );
}