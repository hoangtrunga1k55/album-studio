import { useEffect, useRef, useState } from "react";
import { getTemplate } from "../engine/templates";
import { useAlbum } from "../store/album";
import { IMAGE_DND_KEY } from "../constants";
import { IconPlus, IconClose } from "../icons";

/** How long a card must be held still before it lifts for reordering —
 *  a plain horizontal drag (SmartAlbums-style) pans the strip instead. */
const HOLD_MS = 260;
const MOVE_TOLERANCE = 6;

/** Horizontal filmstrip of spreads under the canvas (add / remove / switch).
 *  Drag anywhere (cards included) to PAN like SmartAlbums; hold a card ~0.3s
 *  to lift it, then drag to REORDER. Wheel scrolls; </> keys step spreads. */
export function SpreadsFilmstrip() {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const setCurrent = useAlbum((s) => s.setCurrent);
  const addSpread = useAlbum((s) => s.addSpread);
  const removeSpread = useAlbum((s) => s.removeSpread);
  const moveSpread = useAlbum((s) => s.moveSpread);
  const trackRef = useRef<HTMLDivElement>(null);
  // pan gesture: >6px of movement scrolls and swallows the ensuing click.
  const dragScroll = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  // wheel accumulator: one spread per "notch", trackpad momentum tamed.
  const wheelAcc = useRef(0);
  // hold-to-reorder gesture
  const armTimer = useRef<number | undefined>(undefined);
  const justReordered = useRef(false);
  /** card currently lifted for reordering (null = pan mode). */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  /** insertion point while reordering (index the spread would land BEFORE). */
  const [dropAt, setDropAt] = useState<number | null>(null);
  /** photos hovering over the "add spread" card. */
  const [addOver, setAddOver] = useState(false);

  // Keep the active card in view when stepping with </> or clicking.
  useEffect(() => {
    trackRef.current
      ?.querySelector(".fs2-card.active")
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [currentIndex]);

  useEffect(() => () => window.clearTimeout(armTimer.current), []);

  function clearGestures() {
    window.clearTimeout(armTimer.current);
    dragScroll.current = null;
    setDragIdx(null);
    setDropAt(null);
  }

  /** Insertion index from the pointer position over the card row. */
  function insertionAt(clientX: number): number {
    const cards = trackRef.current?.querySelectorAll(".fs2-card") ?? [];
    for (let i = 0; i < cards.length; i++) {
      const r = (cards[i] as HTMLElement).getBoundingClientRect();
      if (clientX < r.left + r.width / 2) return i;
    }
    return cards.length;
  }

  return (
    <div className="filmstrip2">
      <div
        className={"fs2-track" + (dragIdx !== null ? " reordering" : "")}
        ref={trackRef}
        onWheel={(e) => {
          // wheel = step ONE spread per notch, same as the ⟨ ⟩ keys
          // (the strip follows via scrollIntoView on the active card)
          const delta = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
          wheelAcc.current += delta;
          const STEP = 60;
          if (Math.abs(wheelAcc.current) < STEP) return;
          const dir = wheelAcc.current > 0 ? 1 : -1;
          wheelAcc.current = 0;
          const st = useAlbum.getState();
          const next = st.currentIndex + dir;
          if (next >= 0 && next < st.spreads.length) st.setCurrent(next);
        }}
        onMouseDown={(e) => {
          dragScroll.current = {
            x: e.clientX,
            left: e.currentTarget.scrollLeft,
            moved: false,
          };
        }}
        onMouseMove={(e) => {
          if (dragIdx !== null) {
            setDropAt(insertionAt(e.clientX));
            return;
          }
          const d = dragScroll.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          if (Math.abs(dx) > MOVE_TOLERANCE) {
            d.moved = true;
            window.clearTimeout(armTimer.current); // moving = panning, not holding
          }
          if (d.moved) e.currentTarget.scrollLeft = d.left - dx;
        }}
        onMouseUp={(e) => {
          window.clearTimeout(armTimer.current);
          if (dragIdx !== null) {
            const at = dropAt ?? insertionAt(e.clientX);
            // removing the card first shifts later indices down by one
            const to = at > dragIdx ? at - 1 : at;
            moveSpread(dragIdx, to);
            justReordered.current = true;
            setDragIdx(null);
            setDropAt(null);
          }
        }}
        onMouseLeave={clearGestures}
        onClickCapture={(e) => {
          // a pan or a reorder must not select the card under the cursor
          if (dragScroll.current?.moved || justReordered.current) {
            e.preventDefault();
            e.stopPropagation();
          }
          dragScroll.current = null;
          justReordered.current = false;
        }}
      >
        {spreads.map((sp, idx) => {
          const tpl = getTemplate(sp.templateId);
          const ratio = tpl?.ratioWH || 2;
          const dropBefore = dragIdx !== null && dropAt === idx;
          const dropAfter =
            dragIdx !== null && dropAt === idx + 1 && idx === spreads.length - 1;
          return (
            <div
              key={sp.id}
              className={
                "fs2-card" +
                (idx === currentIndex ? " active" : "") +
                (idx === dragIdx ? " lifted" : "") +
                (dropBefore ? " drop-before" : "") +
                (dropAfter ? " drop-after" : "")
              }
              onClick={() => setCurrent(idx)}
              title={`Spread ${idx + 1} — kéo để cuộn · giữ rồi kéo để đổi vị trí`}
              onMouseDown={() => {
                // hold still ~0.3s → the card lifts and the drag reorders
                window.clearTimeout(armTimer.current);
                armTimer.current = window.setTimeout(() => {
                  dragScroll.current = null; // reorder owns this gesture now
                  setDragIdx(idx);
                  setDropAt(idx);
                }, HOLD_MS);
              }}
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
                  title="Xoá spread (Delete)"
                  onMouseDown={(e) => e.stopPropagation()} // no pan/hold from the ✕
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSpread(idx);
                  }}
                >
                  <IconClose width={13} height={13} />
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
            // `st` is a pre-add snapshot — the new spread lands at the OLD length.
            const st = useAlbum.getState();
            const appendedIndex = st.spreads.length;
            st.addSpread();
            if (ids.length) st.addToSpreadAt(appendedIndex, ids);
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