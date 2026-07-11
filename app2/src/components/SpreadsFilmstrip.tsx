import { useEffect, useRef, useState } from "react";
import { getTemplate } from "../engine/templates";
import { useAlbum } from "../store/album";
import { IMAGE_DND_KEY } from "../constants";
import { IconPlus, IconClose } from "../icons";

const SPREAD_DND_KEY = "application/x-spread-index";

/** Horizontal filmstrip of spreads under the canvas (add / remove / switch).
 *  Wheel scrolls it sideways; </> keys step spreads; drag a card to reorder;
 *  the active card carries the same accent marker as the canvas badge above. */
export function SpreadsFilmstrip() {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const setCurrent = useAlbum((s) => s.setCurrent);
  const addSpread = useAlbum((s) => s.addSpread);
  const removeSpread = useAlbum((s) => s.removeSpread);
  const moveSpread = useAlbum((s) => s.moveSpread);
  const trackRef = useRef<HTMLDivElement>(null);
  // drag-to-scroll: >5px of movement scrolls and swallows the ensuing click.
  const dragScroll = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  /** insertion point while dragging a card (index the spread would land BEFORE). */
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** photos hovering over the "add spread" card. */
  const [addOver, setAddOver] = useState(false);

  // Keep the active card in view when stepping with </> or clicking.
  useEffect(() => {
    trackRef.current
      ?.querySelector(".fs2-card.active")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [currentIndex]);

  function finishDrop(e: React.DragEvent, at: number | null) {
    const raw = e.dataTransfer.getData(SPREAD_DND_KEY);
    setDropAt(null);
    if (!raw || at === null) return;
    e.preventDefault();
    const from = parseInt(raw, 10);
    if (!Number.isFinite(from)) return;
    // removing the card first shifts later indices down by one
    const to = at > from ? at - 1 : at;
    moveSpread(from, to);
  }

  return (
    <div className="filmstrip2">
      <div
        className="fs2-track"
        ref={trackRef}
        onWheel={(e) => {
          // vertical wheel → horizontal scroll (the strip has no vertical axis)
          if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
        onMouseDown={(e) => {
          dragScroll.current = {
            x: e.clientX,
            left: e.currentTarget.scrollLeft,
            moved: false,
          };
        }}
        onMouseMove={(e) => {
          const d = dragScroll.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > 5) d.moved = true;
          if (d.moved) e.currentTarget.scrollLeft = d.left - dx;
        }}
        onMouseLeave={() => (dragScroll.current = null)}
        onClickCapture={(e) => {
          // a drag must not select the card under the cursor on release
          if (dragScroll.current?.moved) {
            e.preventDefault();
            e.stopPropagation();
          }
          dragScroll.current = null;
        }}
        onDragOver={(e) => {
          // over the empty tail of the strip → drop at the very end
          if (!e.dataTransfer.types.includes(SPREAD_DND_KEY)) return;
          if ((e.target as HTMLElement).closest(".fs2-card")) return;
          e.preventDefault();
          setDropAt(spreads.length);
        }}
        onDrop={(e) => {
          if ((e.target as HTMLElement).closest(".fs2-card")) return;
          finishDrop(e, spreads.length);
        }}
      >
        {spreads.map((sp, idx) => {
          const tpl = getTemplate(sp.templateId);
          const ratio = tpl?.ratioWH || 2;
          const dropBefore = dropAt === idx;
          const dropAfter = dropAt === idx + 1 && idx === spreads.length - 1;
          return (
            <div
              key={sp.id}
              className={
                "fs2-card" +
                (idx === currentIndex ? " active" : "") +
                (dropBefore ? " drop-before" : "") +
                (dropAfter ? " drop-after" : "")
              }
              onClick={() => setCurrent(idx)}
              title={`Spread ${idx + 1} — kéo để đổi vị trí`}
              draggable
              onDragStart={(e) => {
                dragScroll.current = null; // native drag owns this gesture
                e.dataTransfer.setData(SPREAD_DND_KEY, String(idx));
                e.dataTransfer.effectAllowed = "move";
              }}
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(SPREAD_DND_KEY)) return;
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                setDropAt(e.clientX < r.left + r.width / 2 ? idx : idx + 1);
              }}
              onDrop={(e) => finishDrop(e, dropAt)}
              onDragEnd={() => setDropAt(null)}
            >
              <div className="fs2-prev" style={{ aspectRatio: String(ratio), backgroundImage: tpl?.bg ? `url(${tpl.bg})` : undefined }}>
                {tpl?.slots.map((s, i) => {
                  const id = sp.imageIds[i];
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
              <span className="fs2-no">{idx + 1}</span>
              {spreads.length > 1 && (
                <button
                  className="fs2-del"
                  title="Xoá spread"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSpread(idx);
                  }}
                >
                  <IconClose width={11} height={11} />
                </button>
              )}
            </div>
          );
        })}
        {/* SmartAlbums-style: a dashed card — click to add, or drop photos
            straight onto it to create a filled spread at the end */}
        <div
          className={"fs2-addcard" + (addOver ? " over" : "")}
          onClick={addSpread}
          title="Thêm spread mới — thả ảnh vào đây để tạo spread kèm ảnh"
          onDragOver={(e) => {
            if (!e.dataTransfer.types.includes(IMAGE_DND_KEY)) return;
            e.preventDefault();
            setAddOver(true);
          }}
          onDragLeave={() => setAddOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setAddOver(false);
            const ids = (e.dataTransfer.getData(IMAGE_DND_KEY) || "").split(",").filter(Boolean);
            const st = useAlbum.getState();
            st.addSpread();
            if (ids.length) st.addToSpreadAt(st.spreads.length - 1, ids);
          }}
        >
          <IconPlus width={16} height={16} />
          <span>Thêm spread</span>
          <small>hoặc thả ảnh vào đây</small>
        </div>
      </div>
    </div>
  );
}