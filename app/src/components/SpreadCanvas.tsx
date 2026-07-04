import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Group, Image as KonvaImage, Layer, Rect, Stage, Text } from "react-konva";
import useImage from "use-image";
import { getDisplayImage, type ImageMeta } from "../ipc/import";
import { getTemplate, type PhotoSlot } from "../engine/templates";
import { getTypo, type Typo } from "../engine/typos";
import { useAlbum, type SlotTransform, type TextEdit, type PlacedTypo } from "../store/album";
import { sampleBgColor } from "../engine/sampleBg";
import { IMAGE_DND_KEY, TYPO_DND_KEY } from "../constants";
import "./SpreadCanvas.css";

interface Px {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const DEFAULT_T: SlotTransform = { zoom: 1, panX: 0, panY: 0, fit: "cover" };

const BgImage = memo(function BgImage(props: { url: string; w: number; h: number }) {
  const [image] = useImage(props.url);
  if (!image) return null;
  return (
    <KonvaImage image={image} x={0} y={0} width={props.w} height={props.h} listening={false} perfectDrawEnabled={false} />
  );
});

/** An editable text element (template typo or user-added), draggable. */
function EditableText(props: {
  x: number;
  y: number;
  w: number;
  fs: number;
  lines: number;
  content: string;
  font: string;
  color: string;
  selected: boolean;
  onSelect: () => void;
  onMoved: (xPx: number, yPx: number) => void;
}) {
  const { x, y, w, fs, lines, content, font, color, selected, onSelect, onMoved } = props;
  const width = Math.max(w, fs);
  return (
    <>
      {selected && (
        <Rect
          x={x - 4}
          y={y - 4}
          width={width + 8}
          height={fs * lines * 1.12 + 8}
          stroke="#6e76ff"
          strokeWidth={1.5}
          dash={[5, 4]}
          listening={false}
        />
      )}
      <Text
        x={x}
        y={y}
        width={width}
        text={content}
        fontSize={fs}
        fontFamily={`"${font}", "EB Garamond", Georgia, serif`}
        fill={color}
        align="center"
        lineHeight={1.12}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onMoved(e.target.x(), e.target.y())}
      />
    </>
  );
}

/** A template text: rasterized in the bg plate by default (original fonts);
 *  click to enter edit mode → cover the original + show an editable overlay. */
function TplText(props: {
  bgUrl?: string;
  nbox: { x: number; y: number; w: number; h: number };
  px: Px;
  ed?: TextEdit;
  content: string;
  font: string;
  color: string;
  fs: number;
  lines: number;
  selected: boolean;
  onEnter: () => void;
  onSelect: () => void;
  onMoved: (xPx: number, yPx: number) => void;
}) {
  const { bgUrl, nbox, px, ed, content, font, color, fs, lines, selected, onEnter, onSelect, onMoved } = props;
  const editing = ed !== undefined;
  const [cover, setCover] = useState("#ffffff");

  useEffect(() => {
    if (!editing || !bgUrl) return;
    let live = true;
    sampleBgColor(bgUrl, nbox.x, nbox.y, nbox.w, nbox.h)
      .then((c) => live && setCover(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [editing, bgUrl, nbox.x, nbox.y, nbox.w, nbox.h]);

  if (!editing) {
    // invisible hotspot over the rasterized original; click only SELECTS (no
    // visual change) — editing in the panel converts it to an overlay.
    return (
      <>
        <Rect x={px.x} y={px.y} width={px.w} height={px.h} fill="#000" opacity={0} onClick={onEnter} onTap={onEnter} />
        {selected && (
          <Rect
            x={px.x - 3}
            y={px.y - 3}
            width={px.w + 6}
            height={px.h + 6}
            stroke="#6e76ff"
            strokeWidth={1.5}
            dash={[5, 4]}
            listening={false}
          />
        )}
      </>
    );
  }

  const padX = px.w * 0.04 + fs * 0.12;
  const padY = px.h * 0.22;
  return (
    <>
      <Rect x={px.x - padX} y={px.y - padY / 2} width={px.w + padX * 2} height={px.h + padY} fill={cover} listening={false} />
      {!ed?.deleted && (
        <EditableText
          x={px.x}
          y={px.y}
          w={px.w}
          fs={fs}
          lines={lines}
          content={content}
          font={font}
          color={color}
          selected={selected}
          onSelect={onSelect}
          onMoved={onMoved}
        />
      )}
    </>
  );
}

/** A placed typo design: decoration overlay + vector text, movable/resizable as a group. */
function TypoNode(props: {
  typo: Typo;
  pt: PlacedTypo;
  stageW: number;
  stageH: number;
  selected: boolean;
  onSelect: () => void;
  onMoved: (nx: number, ny: number) => void;
  onResize: (w: number) => void;
}) {
  const { typo, pt, stageW, stageH, selected, onSelect, onMoved, onResize } = props;
  const [deco] = useImage(typo.deco ?? "");
  const W = pt.w * stageW;
  const H = W / (typo.ratioWH || 1);

  return (
    <Group
      x={pt.x * stageW}
      y={pt.y * stageH}
      draggable
      onClick={onSelect}
      onTap={onSelect}
      onDragEnd={(e) => onMoved(e.target.x() / stageW, e.target.y() / stageH)}
      onWheel={(e) => {
        e.evt.preventDefault();
        onResize(clamp(pt.w * (e.evt.deltaY > 0 ? 0.94 : 1.06), 0.05, 1.2));
      }}
    >
      {typo.deco && deco && (
        <KonvaImage image={deco} x={0} y={0} width={W} height={H} listening={false} perfectDrawEnabled={false} />
      )}
      {typo.texts.map((tx, i) => {
        const content = (tx.content ?? "").replace(/\r/g, "\n");
        const lines = Math.max(1, content.split("\n").length);
        const fs = Math.max(6, ((tx.h * H) / lines) * 0.86);
        return (
          <Text
            key={i}
            x={tx.x * W}
            y={tx.y * H}
            width={Math.max(tx.w * W, fs)}
            text={content}
            fontSize={fs}
            fontFamily={`"${tx.font ?? ""}", "EB Garamond", serif`}
            fill={pt.color ?? tx.color ?? "#ffffff"}
            align="center"
            lineHeight={1.1}
            listening={false}
          />
        );
      })}
      <Rect x={0} y={0} width={W} height={H} fill="#fff" opacity={0} />
      {selected && (
        <Rect x={-2} y={-2} width={W + 4} height={H + 4} stroke="#6e76ff" strokeWidth={1.5} dash={[6, 4]} listening={false} />
      )}
    </Group>
  );
}

/** One photo slot: holds a user image with pan/zoom, clipped to the slot rect. */
function Slot(props: {
  index: number;
  px: Px;
  img?: ImageMeta;
  selected: boolean;
  transform: SlotTransform;
  onSelect: () => void;
  onTransform: (t: SlotTransform) => void;
  onContext: (clientX: number, clientY: number) => void;
}) {
  const { index, px, img, selected, transform: t, onSelect, onTransform, onContext } = props;
  const [uri, setUri] = useState<string>();
  const drag = useRef<{ cx: number; cy: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    if (!img) {
      setUri(undefined);
      return;
    }
    let live = true;
    getDisplayImage(img.path).then((u) => live && setUri(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [img?.path]);

  const [image] = useImage(uri ?? "");

  let node: ReactNode;
  let maxX = 0;
  let maxY = 0;
  if (img && image) {
    const fitScale =
      t.fit === "contain"
        ? Math.min(px.w / image.width, px.h / image.height)
        : Math.max(px.w / image.width, px.h / image.height);
    const scale = fitScale * t.zoom;
    const dw = image.width * scale;
    const dh = image.height * scale;
    maxX = Math.max(0, (dw - px.w) / 2);
    maxY = Math.max(0, (dh - px.h) / 2);
    node = (
      <KonvaImage
        image={image}
        x={px.x + (px.w - dw) / 2 + t.panX * maxX}
        y={px.y + (px.h - dh) / 2 + t.panY * maxY}
        width={dw}
        height={dh}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  } else {
    node = <Rect x={px.x} y={px.y} width={px.w} height={px.h} fill="#f1eff7" listening={false} />;
  }

  function onWheel(e: { evt: WheelEvent }) {
    if (!img) return;
    e.evt.preventDefault();
    const factor = e.evt.deltaY > 0 ? 0.9 : 1.1;
    onTransform({ ...t, zoom: clamp(t.zoom * factor, 1, 6) });
  }
  function onDown(e: { evt: MouseEvent }) {
    onSelect();
    if (!img) return;
    drag.current = { cx: e.evt.clientX, cy: e.evt.clientY, panX: t.panX, panY: t.panY };
  }
  function onMove(e: { evt: MouseEvent }) {
    if (!drag.current) return;
    const dx = e.evt.clientX - drag.current.cx;
    const dy = e.evt.clientY - drag.current.cy;
    onTransform({
      ...t,
      panX: maxX > 0 ? clamp(drag.current.panX + dx / maxX, -1, 1) : 0,
      panY: maxY > 0 ? clamp(drag.current.panY + dy / maxY, -1, 1) : 0,
    });
  }
  function onUp() {
    drag.current = null;
  }

  const plus = Math.max(13, Math.min(px.w, px.h) * 0.16);
  return (
    <Group
      onClick={onSelect}
      onTap={onSelect}
      onWheel={onWheel}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onDblClick={() => img && onTransform(DEFAULT_T)}
      onContextMenu={(e) => {
        e.evt.preventDefault();
        if (img) {
          onSelect();
          onContext(e.evt.clientX, e.evt.clientY);
        }
      }}
    >
      <Group clipX={px.x} clipY={px.y} clipWidth={px.w} clipHeight={px.h}>{node}</Group>
      {!img && (
        <Text
          x={px.x}
          y={px.y + px.h / 2 - plus}
          width={px.w}
          align="center"
          text={`${index + 1}`}
          fontSize={plus * 1.6}
          fill="#c8c0d8"
          listening={false}
        />
      )}
      {/* invisible hit area so the group catches wheel/drag/click over the whole slot */}
      <Rect x={px.x} y={px.y} width={px.w} height={px.h} fill="#fff" opacity={0} />
      <Rect
        x={px.x}
        y={px.y}
        width={px.w}
        height={px.h}
        cornerRadius={2}
        stroke={selected ? "#6e76ff" : "rgba(60,40,90,0.12)"}
        strokeWidth={selected ? 2.5 : 1}
        shadowColor="#6e76ff"
        shadowBlur={selected ? 14 : 0}
        shadowOpacity={selected ? 0.5 : 0}
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  );
}

export function SpreadCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const images = useAlbum((s) => s.images);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const selectedSlot = useAlbum((s) => s.selectedSlot);
  const selectedText = useAlbum((s) => s.selectedText);
  const bgColor = useAlbum((s) => s.bgColor);
  const clearSlot = useAlbum((s) => s.clearSlot);
  const selectSlot = useAlbum((s) => s.selectSlot);
  const selectText = useAlbum((s) => s.selectText);
  const editTplText = useAlbum((s) => s.editTplText);
  const updateAddedText = useAlbum((s) => s.updateAddedText);
  const setSlotTransform = useAlbum((s) => s.setSlotTransform);
  const setSlotImage = useAlbum((s) => s.setSlotImage);
  const setSlotFit = useAlbum((s) => s.setSlotFit);
  const selectedTypo = useAlbum((s) => s.selectedTypo);
  const selectTypo = useAlbum((s) => s.selectTypo);
  const addTypo = useAlbum((s) => s.addTypo);
  const updateTypo = useAlbum((s) => s.updateTypo);
  const swapSource = useAlbum((s) => s.swapSource);
  const swapImages = useAlbum((s) => s.swapImages);

  const [menu, setMenu] = useState<{ slot: number; x: number; y: number } | null>(null);

  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.metaKey || e.ctrlKey) return; // leave Cmd/Ctrl combos to the app
      const st = useAlbum.getState();
      if (e.code === "Space") {
        e.preventDefault();
        st.shuffleCurrent();
      } else if (e.key.toLowerCase() === "r") {
        e.preventDefault();
        st.shuffleImages();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (st.selectedTypo) st.removeTypo(st.selectedTypo);
        else if (st.selectedText) {
          if (st.selectedText.kind === "tpl") st.deleteTplText(st.selectedText.index);
          else st.removeAddedText(st.selectedText.id);
        } else if (st.selectedSlot !== null) st.clearSlot(st.selectedSlot);
      } else if (e.key === "ArrowRight") {
        if (st.currentIndex < st.spreads.length - 1) st.setCurrent(st.currentIndex + 1);
      } else if (e.key === "ArrowLeft") {
        if (st.currentIndex > 0) st.setCurrent(st.currentIndex - 1);
      } else if (e.key === "Escape") {
        st.cancelSwap();
        st.selectSlot(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!tpl) {
    return (
      <div className="canvas-wrap" ref={wrapRef}>
        <div className="canvas-hint">Chưa có layout — chọn ảnh ở panel trái.</div>
      </div>
    );
  }

  const pad = 56;
  const availW = Math.max(box.w - pad * 2, 10);
  const availH = Math.max(box.h - pad * 2, 10);
  const ratio = tpl.ratioWH || 2;
  let stageW: number, stageH: number;
  if (availW / availH > ratio) {
    stageH = availH;
    stageW = availH * ratio;
  } else {
    stageW = availW;
    stageH = availW / ratio;
  }

  const gap = (spread.margin ?? 0) * stageH;
  const toPx = (s: PhotoSlot): Px => ({
    x: s.x * stageW + gap / 2,
    y: s.y * stageH + gap / 2,
    w: Math.max(4, s.w * stageW - gap),
    h: Math.max(4, s.h * stageH - gap),
  });

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!tpl) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const nx = (e.clientX - rect.left) / stageW;
    const ny = (e.clientY - rect.top) / stageH;

    const typoId = e.dataTransfer.getData(TYPO_DND_KEY);
    if (typoId) {
      addTypo(typoId, Math.max(0, nx - 0.16), Math.max(0, ny - 0.08));
      return;
    }
    const id = e.dataTransfer.getData(IMAGE_DND_KEY);
    if (!id) return;
    const idx = tpl.slots.findIndex(
      (s) => nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h
    );
    if (idx >= 0) setSlotImage(idx, id);
  }

  return (
    <div className="canvas-wrap" ref={wrapRef} onClick={() => setMenu(null)}>
      <div
        className="stage-host"
        style={{ width: stageW, height: stageH }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
      >
        <Stage width={stageW} height={stageH}>
          <Layer>
            <Rect
              x={0}
              y={0}
              width={stageW}
              height={stageH}
              fill={bgColor}
              onClick={() => selectSlot(null)}
              onTap={() => selectSlot(null)}
            />
            {tpl.bg && <BgImage url={tpl.bg} w={stageW} h={stageH} />}

            {tpl.slots.map((slot, i) => {
              const imgId = spread.imageIds[i];
              const img = imgId ? images.find((im) => im.id === imgId) : undefined;
              return (
                <Slot
                  key={i}
                  index={i}
                  px={toPx(slot)}
                  img={img}
                  selected={selectedSlot === i}
                  transform={spread.transforms[i] ?? DEFAULT_T}
                  onSelect={() =>
                    swapSource !== null && swapSource !== i
                      ? swapImages(swapSource, i)
                      : selectSlot(i)
                  }
                  onTransform={(t) => setSlotTransform(i, t)}
                  onContext={(cx, cy) => setMenu({ slot: i, x: cx, y: cy })}
                />
              );
            })}

            {/* template typography: rasterized by default, click → editable */}
            {tpl.texts.map((tx, i) => {
              const ed = spread.textEdits[i];
              const content = ((ed?.content ?? tx.content) ?? "").replace(/\r/g, "\n");
              const lines = Math.max(1, content.split("\n").length);
              const fs = Math.max(7, ((tx.h * stageH) / lines) * 0.86 * (ed?.sizeScale ?? 1));
              const dx = ed?.dx ?? 0;
              const dy = ed?.dy ?? 0;
              return (
                <TplText
                  key={`t${i}`}
                  bgUrl={tpl.bg}
                  nbox={{ x: tx.x + dx, y: tx.y + dy, w: tx.w, h: tx.h }}
                  px={{ x: (tx.x + dx) * stageW, y: (tx.y + dy) * stageH, w: tx.w * stageW, h: tx.h * stageH }}
                  ed={ed}
                  content={content}
                  font={ed?.font ?? tx.font ?? ""}
                  color={ed?.color ?? tx.color ?? "#222222"}
                  fs={fs}
                  lines={lines}
                  selected={selectedText?.kind === "tpl" && selectedText.index === i}
                  onEnter={() => selectText({ kind: "tpl", index: i })}
                  onSelect={() => selectText({ kind: "tpl", index: i })}
                  onMoved={(xp, yp) => editTplText(i, { dx: xp / stageW - tx.x, dy: yp / stageH - tx.y })}
                />
              );
            })}

            {/* user-added texts */}
            {spread.addedTexts.map((a) => {
              const content = a.content.replace(/\r/g, "\n");
              const lines = Math.max(1, content.split("\n").length);
              const fs = Math.max(8, a.sizeFrac * stageH);
              return (
                <EditableText
                  key={a.id}
                  x={a.x * stageW}
                  y={a.y * stageH}
                  w={stageW * 0.5}
                  fs={fs}
                  lines={lines}
                  content={content}
                  font={a.font}
                  color={a.color}
                  selected={selectedText?.kind === "added" && selectedText.id === a.id}
                  onSelect={() => selectText({ kind: "added", id: a.id })}
                  onMoved={(xp, yp) => updateAddedText(a.id, { x: xp / stageW, y: yp / stageH })}
                />
              );
            })}

            {/* placed typo designs */}
            {(spread.typos ?? []).map((pt) => {
              const typo = getTypo(pt.typoId);
              if (!typo) return null;
              return (
                <TypoNode
                  key={pt.id}
                  typo={typo}
                  pt={pt}
                  stageW={stageW}
                  stageH={stageH}
                  selected={selectedTypo === pt.id}
                  onSelect={() => selectTypo(pt.id)}
                  onMoved={(nx, ny) => updateTypo(pt.id, { x: nx, y: ny })}
                  onResize={(w) => updateTypo(pt.id, { w })}
                />
              );
            })}
          </Layer>
        </Stage>
        <div className="canvas-tip">
          <b>SPACE</b> đổi layout · <b>R</b> đổi chỗ ảnh · cuộn <b>zoom</b> · chuột phải <b>tuỳ chọn</b> · <b>← →</b> chuyển spread
        </div>
      </div>

      {swapSource !== null && (
        <div className="swap-hint">Đổi chỗ ảnh: bấm ô đích · Esc để huỷ</div>
      )}

      {menu && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { setSlotFit(menu.slot, "cover"); setMenu(null); }}>Lấp đầy ô</button>
          <button onClick={() => { setSlotFit(menu.slot, "contain"); setMenu(null); }}>Vừa khít</button>
          <button onClick={() => { setSlotTransform(menu.slot, DEFAULT_T); setMenu(null); }}>Đặt lại khung</button>
          <div className="ctx-sep" />
          <button className="danger" onClick={() => { clearSlot(menu.slot); setMenu(null); }}>Gỡ ảnh</button>
        </div>
      )}
    </div>
  );
}
