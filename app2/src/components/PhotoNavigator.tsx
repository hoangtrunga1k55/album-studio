import { useRef } from "react";
import type { ImageMeta } from "../ipc/import";
import type { SlotTransform } from "../store/album";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** SmartAlbums Design preview: the FRAME (yellow box) stays fixed — the photo
 *  scales/pans behind it, overflow dimmed. Red lines mark the trim strip.
 *  Drag the photo to reposition it — updates the real spread live. */
export function PhotoNavigator({
  img,
  frameRatio,
  t,
  trimFrac,
  width = 196,
  onChange,
}: {
  img: ImageMeta;
  /** frame w/h ratio in real units (already stretched to the album size). */
  frameRatio: number;
  t: SlotTransform;
  /** trim strip as a fraction of the frame ({x, y}); 0 = hide the red lines. */
  trimFrac?: { x: number; y: number };
  width?: number;
  onChange: (t: SlotTransform) => void;
}) {
  const drag = useRef<{ cx: number; cy: number; panX: number; panY: number } | null>(null);

  const rot = t.rot ?? 0;
  const swapped = rot === 90 || rot === 270;
  const iw = swapped ? img.height : img.width;
  const ih = swapped ? img.width : img.height;

  // Fixed frame centered in the container, breathing room around it.
  const M = 22;
  let Fw = width - M * 2;
  let Fh = Fw / frameRatio;
  if (Fh > 128) {
    Fh = 128;
    Fw = Fh * frameRatio;
  }
  const boxW = Fw + M * 2;
  const boxH = Fh + M * 2;

  // Photo covers the frame at zoom 1, grows with zoom — frame never moves.
  const fitScale =
    t.fit === "contain" ? Math.min(Fw / iw, Fh / ih) : Math.max(Fw / iw, Fh / ih);
  const scale = fitScale * (t.zoom ?? 1);
  const dw = iw * scale;
  const dh = ih * scale;
  const maxX = Math.max(0, (dw - Fw) / 2);
  const maxY = Math.max(0, (dh - Fh) / 2);
  const photoLeft = boxW / 2 + (t.panX ?? 0) * maxX - dw / 2;
  const photoTop = boxH / 2 + (t.panY ?? 0) * maxY - dh / 2;
  const canPan = maxX > 0 || maxY > 0;

  function onMove(e: React.MouseEvent) {
    const d = drag.current;
    if (!d) return;
    onChange({
      ...t,
      panX: maxX > 0 ? clamp(d.panX + (e.clientX - d.cx) / maxX, -1, 1) : 0,
      panY: maxY > 0 ? clamp(d.panY + (e.clientY - d.cy) / maxY, -1, 1) : 0,
    });
  }

  return (
    <div className="photo-nav-inline">
      <div
        className="pn-box"
        style={{ width: boxW, height: boxH, cursor: canPan ? "grab" : "default" }}
        onMouseDown={(e) => {
          drag.current = { cx: e.clientX, cy: e.clientY, panX: t.panX ?? 0, panY: t.panY ?? 0 };
          e.preventDefault();
        }}
        onMouseMove={onMove}
        onMouseUp={() => (drag.current = null)}
        onMouseLeave={() => (drag.current = null)}
      >
        {/* the photo — scales with the slider, frame stays put */}
        <div
          className="pn-photo"
          style={{ left: photoLeft, top: photoTop, width: dw, height: dh }}
        >
          <img
            src={img.thumb}
            alt=""
            draggable={false}
            style={{
              width: swapped ? dh : dw,
              height: swapped ? dw : dh,
              transform: `rotate(${rot}deg)${t.flipH ? " scaleX(-1)" : ""}${t.flipV ? " scaleY(-1)" : ""}`,
              // CSS approximation of the Konva tone filters — live preview
              filter:
                (t.brightness ?? 0) !== 0 || (t.contrast ?? 0) !== 0
                  ? `brightness(${1 + (t.brightness ?? 0)}) contrast(${1 + (t.contrast ?? 0) / 100})`
                  : undefined,
            }}
          />
        </div>
        {/* fixed frame: yellow border + thirds grid; outside dimmed */}
        <div className="pn-frame" style={{ left: M, top: M, width: Fw, height: Fh }} />
        {/* red trim strip — content past this line may be cut by the lab */}
        {trimFrac && (trimFrac.x > 0 || trimFrac.y > 0) && (
          <div
            className="pn-trim"
            style={{
              left: M + trimFrac.x * Fw,
              top: M + trimFrac.y * Fh,
              width: Fw - trimFrac.x * Fw * 2,
              height: Fh - trimFrac.y * Fh * 2,
            }}
          />
        )}
      </div>
      <div className="pn-label">
        {canPan ? "Kéo ảnh để chỉnh vị trí trong khung" : "Toàn bộ ảnh đang hiển thị"}
      </div>
    </div>
  );
}