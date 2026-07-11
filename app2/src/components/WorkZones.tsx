import { useState, type DragEvent } from "react";
import { getTemplate } from "../engine/templates";
import { useAlbum } from "../store/album";
import { IMAGE_DND_KEY } from "../constants";
import { IconPlus } from "../icons";

function draggedIds(e: DragEvent): string[] {
  return (e.dataTransfer.getData(IMAGE_DND_KEY) || "").split(",").filter(Boolean);
}

function acceptsImage(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(IMAGE_DND_KEY);
}

/** Left rail: drop a photo here → it becomes the spread's full-bleed cover. */
export function CoverDropZone() {
  const setCoverImage = useAlbum((s) => s.setCoverImage);
  const removeBackground = useAlbum((s) => s.removeBackground);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const images = useAlbum((s) => s.images);
  const [over, setOver] = useState(false);

  const bgId = spreads[currentIndex]?.bgImageId;
  const bg = bgId ? images.find((i) => i.id === bgId) : undefined;

  return (
    <div
      className={"side-zone left" + (over ? " over" : "")}
      title="Kéo ảnh vào đây → ảnh nền tràn spread"
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
        if (ids[0]) setCoverImage(ids[0]);
      }}
    >
      {bg ? (
        <div className="sz-cover">
          <img src={bg.thumb} alt="" draggable={false} />
          <button className="sz-x" title="Gỡ ảnh nền" onClick={removeBackground}>
            ×
          </button>
          <span className="sz-label">Ảnh nền</span>
        </div>
      ) : (
        <span className="sz-label">
          Thả ảnh
          <br />→ nền tràn
          <br />
          spread
        </span>
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
      // No next spread yet → create one at the end and fill it.
      st.addSpread();
      st.addToSpreadAt(st.spreads.length - 1, ids);
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
      {next && tpl ? (
        <div className="sz-next">
          <div
            className="sz-prev"
            style={{
              aspectRatio: String(tpl.ratioWH || 2),
              backgroundImage: tpl.bg ? `url(${tpl.bg})` : undefined,
            }}
          >
            {tpl.slots.map((s, i) => {
              const id = next.imageIds[i];
              const img = id ? images.find((im) => im.id === id) : undefined;
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
          <span className="sz-label">Spread {currentIndex + 2} →</span>
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