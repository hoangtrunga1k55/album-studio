import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import type Konva from "konva";
import useImage from "use-image";
import { getDisplayImage, type ImageMeta } from "../ipc/import";
import { getTemplate, saveCustomTemplate, spreadCmFor, type PhotoSlot, type TemplateText } from "../engine/templates";
import { getTypo, type Typo } from "../engine/typos";
import { useAlbum, type SlotTransform, type TextEdit, type PlacedTypo } from "../store/album";
import { useFonts } from "../store/fonts";
import { sampleBgColor } from "../engine/sampleBg";
import { fitFontSizeToWidth, isSingleLine } from "../engine/fitText";
import { IMAGE_DND_KEY, TYPO_DND_KEY } from "../constants";
import { mod } from "../engine/platform";
import { rotaterIconStyle } from "../engine/rotateAnchor";
import "./SpreadCanvas.css";

interface Px {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const DEFAULT_T: SlotTransform = { zoom: 1, panX: 0, panY: 0, fit: "cover" };

/** Quality-check thresholds (§10): print bleed, binding gutter, min DPI. */
const GUTTER_CM = 1.2; // ~12mm swallowed by the spine (2-page spreads)
const DPI_LOW = 200; // warn below this
const DPI_BAD = 150; // red below this

/** Base font size (px) for a template text, sized to match the original design:
 *  single-line texts are width-fit to the ORIGINAL content (so editing letters
 *  never rescales them); others fall back to the true size / bbox estimate.
 *  `_fontsVersion` only forces a re-measure when the loaded font set changes. */
function textBaseFs(
  tx: TemplateText,
  font: string,
  stageW: number,
  stageH: number,
  _fontsVersion: number
): number {
  const orig = tx.content ?? "";
  if (orig.trim() && isSingleLine(orig)) {
    const fit = fitFontSizeToWidth(orig, font, tx.w * stageW);
    if (fit > 0) return fit;
  }
  if (tx.fontSizeFrac) return tx.fontSizeFrac * stageH;
  const lines = Math.max(1, orig.replace(/\r/g, "\n").split("\n").length);
  return ((tx.h * stageH) / lines) * 0.86;
}

const BgImage = memo(function BgImage(props: { url: string; w: number; h: number }) {
  const [image] = useImage(props.url);
  if (!image) return null;
  return (
    <KonvaImage image={image} x={0} y={0} width={props.w} height={props.h} listening={false} perfectDrawEnabled={false} />
  );
});

/** Full-bleed background photo covering the whole spread (§6.5). */
const SpreadBgPhoto = memo(function SpreadBgPhoto(props: { img?: ImageMeta; w: number; h: number }) {
  const { img, w, h } = props;
  const [uri, setUri] = useState<string>();
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
  if (!img || !image) return null;
  const scale = Math.max(w / image.width, h / image.height);
  const dw = image.width * scale;
  const dh = image.height * scale;
  return (
    <KonvaImage
      image={image}
      x={(w - dw) / 2}
      y={(h - dh) / 2}
      width={dw}
      height={dh}
      listening={false}
      perfectDrawEnabled={false}
    />
  );
});

/** What a Transformer edit produced: position, stretch and rotation. */
interface NodeTransform {
  xPx: number;
  yPx: number;
  scaleX: number;
  scaleY: number;
  rotDeg: number;
}

/** An editable text element (template typo or user-added): draggable, resize
 *  box (8 handles) that stretches it, plus a rotation handle (360°). */
function EditableText(props: {
  x: number;
  y: number;
  w: number;
  fs: number;
  lines: number;
  content: string;
  font: string;
  color: string;
  scaleX: number;
  scaleY: number;
  rotDeg: number;
  selected: boolean;
  onSelect: () => void;
  onMoved: (xPx: number, yPx: number) => void;
  /** Full geometry after a handle drag (stretch and/or rotation). */
  onTransformed: (t: NodeTransform) => void;
}) {
  const {
    x, y, w, fs, lines, content, font, color, scaleX, scaleY, rotDeg,
    selected, onSelect, onMoved, onTransformed,
  } = props;
  void lines;
  const width = Math.max(w, fs);
  const textRef = useRef<Konva.Text>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && textRef.current) {
      trRef.current.nodes([textRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected, content, fs, font, x, y, scaleX, scaleY, rotDeg]);

  return (
    <>
      <Text
        ref={textRef}
        x={x}
        y={y}
        width={width}
        scaleX={scaleX}
        scaleY={scaleY}
        rotation={rotDeg}
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
        onTransformEnd={() => {
          const node = textRef.current;
          if (!node) return;
          onTransformed({
            xPx: node.x(),
            yPx: node.y(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            rotDeg: node.rotation(),
          });
        }}
      />
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          rotateAnchorOffset={28}
          anchorStyleFunc={rotaterIconStyle}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={6}
          keepRatio
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
            "middle-left",
            "middle-right",
            "top-center",
            "bottom-center",
          ]}
          anchorSize={9}
          anchorCornerRadius={5}
          anchorStroke="#6e76ff"
          borderStroke="#6e76ff"
          borderStrokeWidth={1.5}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 8 || newBox.height < 6 ? oldBox : newBox)}
        />
      )}
    </>
  );
}

/** Covers the baked raster of a template text with the sampled background
 *  color. Drawn UNDER the photos (right above the plate) so it only hides the
 *  raster text, never a photo the user dragged over that area. */
function TplTextCover(props: {
  bgUrl?: string;
  nbox: { x: number; y: number; w: number; h: number };
  coverPx: Px;
  fs: number;
}) {
  const { bgUrl, nbox, coverPx, fs } = props;
  const [cover, setCover] = useState("#ffffff");

  useEffect(() => {
    if (!bgUrl) return;
    let live = true;
    sampleBgColor(bgUrl, nbox.x, nbox.y, nbox.w, nbox.h)
      .then((c) => live && setCover(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [bgUrl, nbox.x, nbox.y, nbox.w, nbox.h]);

  const padX = coverPx.w * 0.04 + fs * 0.12;
  const padY = coverPx.h * 0.22;
  return (
    <Rect
      x={coverPx.x - padX}
      y={coverPx.y - padY / 2}
      width={coverPx.w + padX * 2}
      height={coverPx.h + padY}
      fill={cover}
      listening={false}
    />
  );
}

/** A template text: rasterized in the bg plate by default (original fonts);
 *  click to enter edit mode → show an editable overlay (its raster is hidden
 *  by TplTextCover, rendered under the photos). */
function TplText(props: {
  px: Px;
  ed?: TextEdit;
  content: string;
  font: string;
  color: string;
  fs: number;
  lines: number;
  scaleX: number;
  scaleY: number;
  rotDeg: number;
  selected: boolean;
  onEnter: () => void;
  onSelect: () => void;
  onMoved: (xPx: number, yPx: number) => void;
  onTransformed: (t: NodeTransform) => void;
}) {
  const {
    px, ed, content, font, color, fs, lines, scaleX, scaleY, rotDeg,
    selected, onEnter, onSelect, onMoved, onTransformed,
  } = props;
  const editing = ed !== undefined;
  // Show the editable vector overlay (with move/resize handles) whenever the
  // text is edited OR just selected — so the raster stays only until the user
  // interacts, and clicking a text immediately gives handles.
  const showOverlay = editing || selected;

  if (!showOverlay) {
    // invisible hotspot over the rasterized original; click SELECTS it (which
    // then reveals the editable overlay above).
    return <Rect x={px.x} y={px.y} width={px.w} height={px.h} fill="#000" opacity={0} onClick={onEnter} onTap={onEnter} />;
  }

  return (
    <>
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
          scaleX={scaleX}
          scaleY={scaleY}
          rotDeg={rotDeg}
          selected={selected}
          onSelect={onSelect}
          onMoved={onMoved}
          onTransformed={onTransformed}
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
  onTransformed: (t: NodeTransform) => void;
}) {
  const { typo, pt, stageW, stageH, selected, onSelect, onMoved, onResize, onTransformed } = props;
  const [deco] = useImage(typo.deco ?? "");
  const W = pt.w * stageW;
  const H = W / (typo.ratioWH || 1);
  const groupRef = useRef<Konva.Group>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (selected && trRef.current && groupRef.current) {
      trRef.current.nodes([groupRef.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [selected, W, H, pt.scaleX, pt.scaleY]);

  return (
    <>
      <Group
        ref={groupRef}
        x={pt.x * stageW}
        y={pt.y * stageH}
        scaleX={pt.scaleX ?? 1}
        scaleY={pt.scaleY ?? 1}
        rotation={pt.rotDeg ?? 0}
        draggable
        onClick={onSelect}
        onTap={onSelect}
        onDragEnd={(e) => onMoved(e.target.x() / stageW, e.target.y() / stageH)}
        onWheel={(e) => {
          e.evt.preventDefault();
          onResize(clamp(pt.w * (e.evt.deltaY > 0 ? 0.94 : 1.06), 0.05, 1.2));
        }}
        onTransformEnd={() => {
          const g = groupRef.current;
          if (!g) return;
          onTransformed({
            xPx: g.x(),
            yPx: g.y(),
            scaleX: g.scaleX(),
            scaleY: g.scaleY(),
            rotDeg: g.rotation(),
          });
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
      </Group>
      {selected && (
        <Transformer
          ref={trRef}
          rotateEnabled
          rotateAnchorOffset={28}
          anchorStyleFunc={rotaterIconStyle}
          rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
          rotationSnapTolerance={6}
          keepRatio
          enabledAnchors={[
            "top-left",
            "top-right",
            "bottom-left",
            "bottom-right",
            "middle-left",
            "middle-right",
            "top-center",
            "bottom-center",
          ]}
          anchorSize={9}
          anchorCornerRadius={5}
          anchorStroke="#6e76ff"
          borderStroke="#6e76ff"
          borderStrokeWidth={1.5}
          boundBoxFunc={(oldBox, newBox) => (newBox.width < 12 || newBox.height < 10 ? oldBox : newBox)}
        />
      )}
    </>
  );
}

/** 8-handle frame editor for the selected slot — move & resize like text:
 *  corners scale both ways, edges stretch one axis, drag moves the frame. */
function SlotFrame(props: {
  px: Px;
  rotDeg: number;
  onChange: (r: Px & { rotDeg: number }) => void;
  onWheelZoom: (deltaY: number) => void;
  onDblClick: () => void;
  onContext: (x: number, y: number) => void;
}) {
  const { px, rotDeg, onChange, onWheelZoom, onDblClick, onContext } = props;
  const ref = useRef<Konva.Rect>(null);
  const trRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (trRef.current && ref.current) {
      trRef.current.nodes([ref.current]);
      trRef.current.getLayer()?.batchDraw();
    }
  }, [px.x, px.y, px.w, px.h, rotDeg]);

  return (
    <>
      <Rect
        ref={ref}
        x={px.x + px.w / 2}
        y={px.y + px.h / 2}
        width={px.w}
        height={px.h}
        offsetX={px.w / 2}
        offsetY={px.h / 2}
        rotation={rotDeg}
        fill="#ffffff"
        opacity={0.001}
        draggable
        onDragEnd={(e) =>
          onChange({ x: e.target.x() - px.w / 2, y: e.target.y() - px.h / 2, w: px.w, h: px.h, rotDeg })
        }
        onTransformEnd={() => {
          const n = ref.current;
          if (!n) return;
          const w = Math.max(24, n.width() * n.scaleX());
          const h = Math.max(24, n.height() * n.scaleY());
          const r = { x: n.x() - w / 2, y: n.y() - h / 2, w, h, rotDeg: n.rotation() };
          n.scaleX(1);
          n.scaleY(1);
          onChange(r);
        }}
        onWheel={(e) => {
          e.evt.preventDefault();
          onWheelZoom(e.evt.deltaY);
        }}
        onDblClick={onDblClick}
        onContextMenu={(e) => {
          e.evt.preventDefault();
          onContext(e.evt.clientX, e.evt.clientY);
        }}
      />
      {/* photo-frame rotation moved to the Angle slider in the photo panel */}
      <Transformer
        ref={trRef}
        rotateEnabled={false}
        keepRatio={false}
        enabledAnchors={[
          "top-left",
          "top-right",
          "bottom-left",
          "bottom-right",
          "middle-left",
          "middle-right",
          "top-center",
          "bottom-center",
        ]}
        anchorSize={9}
        anchorCornerRadius={5}
        anchorStroke="#6e76ff"
        borderStroke="#6e76ff"
        borderStrokeWidth={1.5}
        boundBoxFunc={(oldBox, newBox) => (newBox.width < 24 || newBox.height < 24 ? oldBox : newBox)}
      />
    </>
  );
}

/** §7.4 rulers + draggable guides (DOM overlay). Drag from the top ruler for a
 *  horizontal guide, from the left ruler for a vertical one; drag a guide to
 *  move it (drop on a ruler to remove), right-click deletes. */
function GuideLayer(props: {
  stageW: number;
  stageH: number;
  pxPerCm: number | null;
  guides: { v: number[]; h: number[] };
  onChange: (g: { v: number[]; h: number[] }) => void;
}) {
  const { stageW, stageH, pxPerCm, guides, onChange } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ axis: "v" | "h"; pos: number; idx: number | null } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const posFrom = (e: MouseEvent, axis: "v" | "h") => {
      const r = hostRef.current!.getBoundingClientRect();
      return axis === "v" ? (e.clientX - r.left) / stageW : (e.clientY - r.top) / stageH;
    };
    const move = (e: MouseEvent) => setDrag((d) => (d ? { ...d, pos: posFrom(e, d.axis) } : d));
    const up = (e: MouseEvent) => {
      setDrag((d) => {
        if (d) {
          const pos = posFrom(e, d.axis);
          const inside = pos > 0.004 && pos < 0.996;
          const list = [...guides[d.axis]];
          if (d.idx === null) {
            if (inside) list.push(pos);
          } else if (inside) {
            list[d.idx] = pos;
          } else {
            list.splice(d.idx, 1);
          }
          onChange({ ...guides, [d.axis]: list });
        }
        return null;
      });
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag, guides, stageW, stageH]);

  const cm = pxPerCm ?? 40;
  const tick = (dir: "right" | "bottom") =>
    `repeating-linear-gradient(to ${dir}, #ffffff2e 0, #ffffff2e 1px, transparent 1px, transparent ${cm}px)`;

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      {/* rulers */}
      <div
        title="Kéo xuống để tạo guide ngang"
        style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 14,
          background: `linear-gradient(#0f1015d8, #0f1015d8) , ${""}`.trim() || undefined,
          backgroundColor: "#0f1015d8",
          backgroundImage: tick("right"),
          cursor: "row-resize", pointerEvents: "auto",
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDrag({ axis: "h", pos: 0, idx: null });
        }}
      />
      <div
        title="Kéo sang phải để tạo guide dọc"
        style={{
          position: "absolute", top: 0, left: 0, bottom: 0, width: 14,
          backgroundColor: "#0f1015d8",
          backgroundImage: tick("bottom"),
          cursor: "col-resize", pointerEvents: "auto",
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDrag({ axis: "v", pos: 0, idx: null });
        }}
      />
      {/* placed guides */}
      {guides.v.map((g, i) => (
        <div
          key={`v${i}`}
          style={{
            position: "absolute", top: 0, bottom: 0, left: g * stageW - 1, width: 3,
            cursor: "col-resize", pointerEvents: "auto",
            background: "linear-gradient(to right, transparent 1px, #22d3ee 1px, #22d3ee 2px, transparent 2px)",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDrag({ axis: "v", pos: g, idx: i });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onChange({ ...guides, v: guides.v.filter((_, k) => k !== i) });
          }}
        />
      ))}
      {guides.h.map((g, i) => (
        <div
          key={`h${i}`}
          style={{
            position: "absolute", left: 0, right: 0, top: g * stageH - 1, height: 3,
            cursor: "row-resize", pointerEvents: "auto",
            background: "linear-gradient(to bottom, transparent 1px, #22d3ee 1px, #22d3ee 2px, transparent 2px)",
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            setDrag({ axis: "h", pos: g, idx: i });
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            onChange({ ...guides, h: guides.h.filter((_, k) => k !== i) });
          }}
        />
      ))}
      {/* live drag preview */}
      {drag &&
        (drag.axis === "v" ? (
          <div style={{ position: "absolute", top: 0, bottom: 0, left: drag.pos * stageW, width: 1, background: "#22d3ee" }} />
        ) : (
          <div style={{ position: "absolute", left: 0, right: 0, top: drag.pos * stageH, height: 1, background: "#22d3ee" }} />
        ))}
    </div>
  );
}

/** One photo slot. SmartAlbums behavior (§6.2–6.3): plain drag MOVES the photo
 *  to another slot; double-click enters crop mode where drag pans / wheel zooms. */
function Slot(props: {
  index: number;
  px: Px;
  img?: ImageMeta;
  selected: boolean;
  /** crop mode: drag pans the photo inside the slot. */
  crop: boolean;
  /** another photo is being dragged and would land here. */
  dropTarget: boolean;
  /** stage px per printed inch — enables the low-resolution warning (§10.3). */
  ppi?: number;
  /** album setting: border drawn around the photo (stage px; 0 = off). */
  borderPx?: number;
  borderColor?: string;
  /** free rotation of the whole frame (degrees). */
  frameRot?: number;
  transform: SlotTransform;
  onSelect: () => void;
  onEnterCrop: () => void;
  /** mousedown on a photo outside crop mode → maybe start a move-drag. */
  onBeginMove: (clientX: number, clientY: number) => void;
  onTransform: (t: SlotTransform) => void;
  onContext: (clientX: number, clientY: number) => void;
}) {
  const {
    index, px, img, selected, crop, dropTarget, ppi, frameRot = 0, transform: t,
    borderPx = 0, borderColor = "#ffffff",
    onSelect, onEnterCrop, onBeginMove, onTransform, onContext,
  } = props;
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
  /** effective print DPI of the photo in this slot (Infinity = no warning). */
  let dpi = Infinity;
  if (img && image) {
    // Rotation swaps the image's footprint; fit against the rotated bounds.
    const rot = t.rot ?? 0;
    const swapped = rot === 90 || rot === 270;
    const iw = swapped ? image.height : image.width;
    const ih = swapped ? image.width : image.height;
    const fitScale =
      t.fit === "contain" ? Math.min(px.w / iw, px.h / ih) : Math.max(px.w / iw, px.h / ih);
    const scale = fitScale * t.zoom;
    const dw = iw * scale;
    const dh = ih * scale;
    maxX = Math.max(0, (dw - px.w) / 2);
    maxY = Math.max(0, (dh - px.h) / 2);
    const nw = image.width * scale;
    const nh = image.height * scale;
    // image px per stage px = 1/scale → DPI = stage-px-per-inch / scale (§10.3).
    if (ppi) dpi = ppi / scale;
    node = (
      <KonvaImage
        image={image}
        x={px.x + px.w / 2 + t.panX * maxX}
        y={px.y + px.h / 2 + t.panY * maxY}
        width={nw}
        height={nh}
        offsetX={nw / 2}
        offsetY={nh / 2}
        rotation={rot}
        scaleX={t.flipH ? -1 : 1}
        scaleY={t.flipV ? -1 : 1}
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
    if (crop) {
      // crop mode: drag = pan the photo inside the slot
      drag.current = { cx: e.evt.clientX, cy: e.evt.clientY, panX: t.panX, panY: t.panY };
    } else {
      // normal mode: drag = move the photo to another slot (§6.2)
      onBeginMove(e.evt.clientX, e.evt.clientY);
    }
  }
  function onMove(e: { evt: MouseEvent }) {
    if (!crop || !drag.current) return;
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
      onDblClick={() => img && onEnterCrop()}
      onContextMenu={(e) => {
        e.evt.preventDefault();
        if (img) {
          onSelect();
          onContext(e.evt.clientX, e.evt.clientY);
        }
      }}
    >
      {/* everything spins together around the frame center (360° rotation) */}
      <Group
        x={px.x + px.w / 2}
        y={px.y + px.h / 2}
        offsetX={px.x + px.w / 2}
        offsetY={px.y + px.h / 2}
        rotation={frameRot}
      >
      <Group clipX={px.x} clipY={px.y} clipWidth={px.w} clipHeight={px.h}>{node}</Group>
      {/* wizard setting: printed border around every photo */}
      {img && borderPx > 0 && (
        <Rect
          x={px.x}
          y={px.y}
          width={px.w}
          height={px.h}
          stroke={borderColor}
          strokeWidth={borderPx}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
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
      {dropTarget && (
        <Rect
          x={px.x}
          y={px.y}
          width={px.w}
          height={px.h}
          fill="#10b981"
          opacity={0.25}
          listening={false}
        />
      )}
      <Rect
        x={px.x}
        y={px.y}
        width={px.w}
        height={px.h}
        cornerRadius={2}
        stroke={
          dropTarget ? "#10b981" : crop ? "#f59e0b" : selected ? "#6e76ff" : "rgba(60,40,90,0.12)"
        }
        strokeWidth={dropTarget ? 3 : crop ? 2.5 : selected ? 2.5 : 1}
        dash={crop ? [7, 5] : undefined}
        shadowColor={crop ? "#f59e0b" : "#6e76ff"}
        shadowBlur={selected || crop ? 14 : 0}
        shadowOpacity={selected || crop ? 0.5 : 0}
        listening={false}
        perfectDrawEnabled={false}
      />
      {/* §10.3 low-resolution warning: photo would print below DPI_LOW */}
      {dpi < DPI_LOW && (
        <Group x={px.x + 13} y={px.y + 13} listening={false}>
          <Circle
            radius={9}
            fill={dpi < DPI_BAD ? "#ef4444" : "#f59e0b"}
            shadowColor="#000"
            shadowBlur={5}
            shadowOpacity={0.5}
          />
          <Text x={-9} y={-6} width={18} align="center" text="!" fontSize={12} fontStyle="bold" fill="#fff" />
        </Group>
      )}
      </Group>
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
  // Re-render (and re-measure text fit) whenever the loaded font set changes.
  const fontsVersion = useFonts((s) => s.fonts.length);

  const [menu, setMenu] = useState<
    { kind: "slot" | "spread"; slot: number; x: number; y: number } | null
  >(null);

  const cropSlot = useAlbum((s) => s.cropSlot);
  const settings = useAlbum((s) => s.settings);
  const showBleed = useAlbum((s) => s.showBleed);
  const showRuler = useAlbum((s) => s.showRuler);
  const tool = useAlbum((s) => s.tool);
  const viewZoom = useAlbum((s) => s.viewZoom);

  // §7.4 guides — kept per spread id (session-scoped, not saved to the file).
  const guidesRef = useRef(new Map<string, { v: number[]; h: number[] }>());
  const [guides, setGuidesState] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const spreadId = spreads[currentIndex]?.id;
  useEffect(() => {
    setGuidesState(guidesRef.current.get(spreadId ?? "") ?? { v: [], h: [] });
  }, [spreadId]);
  const setGuides = (g: { v: number[]; h: number[] }) => {
    setGuidesState(g);
    if (spreadId) guidesRef.current.set(spreadId, g);
  };

  // §7.2 rectangle tool — drag preview while drawing a new frame.
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<Px | null>(null);
  // §7.5 save-as-template naming dialog (window.prompt is a no-op in Tauri).
  const [saveTpl, setSaveTpl] = useState<{ name: string } | null>(null);
  const setCropSlot = useAlbum((s) => s.setCropSlot);
  // Slot-to-slot photo move (§6.2): mousedown arms it, movement >6px starts it.
  const movePending = useRef<{ from: number; sx: number; sy: number } | null>(null);
  const [slotDrag, setSlotDrag] = useState<
    { from: number; x: number; y: number; target: number } | null
  >(null);

  const previewTemplateId = useAlbum((s) => s.previewTemplateId);
  const spreadReal = spreads[currentIndex];
  // Hover preview (layout strip / center ▦ grid): render the candidate
  // template with pristine frames — the saved spread is untouched.
  const spread =
    previewTemplateId && spreadReal
      ? { ...spreadReal, transforms: {}, slotRects: {}, textEdits: {} }
      : spreadReal;
  const tpl = getTemplate(previewTemplateId ?? spread?.templateId ?? null);

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
      } else if (e.key.toLowerCase() === "s") {
        // S = swap: arm on the selected photo, then click the target slot.
        const cur = st.spreads[st.currentIndex];
        if (st.selectedSlot !== null && cur?.imageIds[st.selectedSlot]) {
          e.preventDefault();
          st.beginSwap(st.selectedSlot);
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (st.selectedTypo) st.removeTypo(st.selectedTypo);
        else if (st.selectedText) {
          if (st.selectedText.kind === "tpl") st.deleteTplText(st.selectedText.index);
          else st.removeAddedText(st.selectedText.id);
        } else if (st.selectedSlot !== null) st.clearSlot(st.selectedSlot);
      } else if (
        e.key === "ArrowRight" || e.key === "PageDown" || e.key === "." || e.key === ">"
      ) {
        if (st.currentIndex < st.spreads.length - 1) st.setCurrent(st.currentIndex + 1);
      } else if (
        e.key === "ArrowLeft" || e.key === "PageUp" || e.key === "," || e.key === "<"
      ) {
        if (st.currentIndex > 0) st.setCurrent(st.currentIndex - 1);
      } else if (e.key === "Escape") {
        st.cancelSwap();
        st.selectSlot(null);
        st.setCropSlot(null);
        st.setTool("select");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!tpl) {
    return (
      <div className="canvas-wrap" ref={wrapRef}>
        <div className="canvas-hint">Chưa có layout — kéo ảnh từ khay dưới vào spread.</div>
      </div>
    );
  }

  const pad = 28;
  const availW = Math.max(box.w - pad * 2, 10);
  const availH = Math.max(box.h - pad * 2, 10);
  // Render at the album's true page ratio (custom sizes stretch the template).
  const cmDims = spreadCmFor(tpl, useAlbum.getState().size);
  const ratio = cmDims ? cmDims.w / cmDims.h : tpl.ratioWH || 2;
  let stageW: number, stageH: number;
  if (availW / availH > ratio) {
    stageH = availH;
    stageW = availH * ratio;
  } else {
    stageW = availW;
    stageH = availW / ratio;
  }
  // View zoom (⌘+/⌘−/⌘0): scale the whole stage; the wrap scrolls when >1.
  stageW *= viewZoom;
  stageH *= viewZoom;

  // Margin = photo↔photo gap; Padding = photo↔spread-edge inset (§6.6).
  const gap = (spread.margin ?? 0) * stageH;
  const padIn = (spread.padding ?? 0) * stageH;
  const innerW = stageW - padIn * 2;
  const innerH = stageH - padIn * 2;
  const toPx = (s: PhotoSlot): Px => ({
    x: padIn + s.x * innerW + gap / 2,
    y: padIn + s.y * innerH + gap / 2,
    w: Math.max(4, s.w * innerW - gap),
    h: Math.max(4, s.h * innerH - gap),
  });
  // Effective slot rects: user-moved/resized frames override the template,
  // plus hand-drawn extra frames (§7.2) at indices beyond the template's.
  const extraRects: PhotoSlot[] = Object.entries(spread.slotRects ?? {})
    .map(([k, v]) => [Number(k), v] as const)
    .filter(([k]) => k >= tpl.slots.length)
    .sort((a, b) => a[0] - b[0])
    .map(([, v]) => ({ ...v }));
  const effSlots: PhotoSlot[] = [
    ...tpl.slots.map((s, i) => ({ ...s, ...(spread.slotRects?.[i] ?? {}) })),
    ...extraRects,
  ];
  // Physical scale for quality checks (§10): stage px per cm / per inch.
  const pxPerCm = cmDims ? stageH / cmDims.h : null;
  const ppi = pxPerCm ? pxPerCm * 2.54 : undefined;
  /** Gapless px rect — what the frame editor manipulates. */
  const rawPx = (s: PhotoSlot): Px => ({
    x: padIn + s.x * innerW,
    y: padIn + s.y * innerH,
    w: s.w * innerW,
    h: s.h * innerH,
  });

  /** §7.2 snap: pull frame edges onto guides / spread edges / center (±7px). */
  const snapRect = (r: Px): Px => {
    const t = 7;
    const xs = [0, stageW / 2, stageW, ...guides.v.map((g) => g * stageW)];
    const ys = [0, stageH / 2, stageH, ...guides.h.map((g) => g * stageH)];
    const near = (v: number, cands: number[]) => {
      for (const c of cands) if (Math.abs(v - c) < t) return c;
      return v;
    };
    let x = near(r.x, xs);
    if (x === r.x) {
      const right = near(r.x + r.w, xs);
      if (right !== r.x + r.w) x = right - r.w;
    }
    let y = near(r.y, ys);
    if (y === r.y) {
      const bottom = near(r.y + r.h, ys);
      if (bottom !== r.y + r.h) y = bottom - r.h;
    }
    const w = near(x + r.w, xs) - x;
    const h = near(y + r.h, ys) - y;
    return { x, y, w: w > 24 ? w : r.w, h: h > 24 ? h : r.h };
  };

  /** §7.5: persist the current frame layout into "Mẫu của tôi". */
  function doSaveTemplate() {
    if (!saveTpl) return;
    const size = useAlbum.getState().size ?? "25x35";
    const ratio = cmDims ? cmDims.w / cmDims.h : tpl!.ratioWH || 2;
    saveCustomTemplate(size, saveTpl.name.trim() || "My Layout", ratio, effSlots.map((s) => ({ ...s })));
    setSaveTpl(null);
  }

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
    const data = e.dataTransfer.getData(IMAGE_DND_KEY);
    if (!data) return;
    const ids = data.split(",").filter(Boolean);
    // Multi-photo drop → add the whole selection to this spread.
    if (ids.length > 1) {
      useAlbum.getState().addToSpread(ids);
      return;
    }
    const idx = effSlots.findIndex(
      (s) => nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h
    );
    if (idx >= 0) setSlotImage(idx, ids[0]);
    else useAlbum.getState().addToSpread(ids); // drop outside slots → still add
  }

  return (
    <div className="canvas-wrap" ref={wrapRef} onClick={() => setMenu(null)}>
      {/* accent badge — pairs with the highlighted card in the filmstrip below */}
      <div className="spread-chip">
        Spread {currentIndex + 1}
        <span className="spread-chip-sub">/{spreads.length} · phím ⟨ ⟩ để chuyển</span>
      </div>
      <div
        className="stage-host"
        style={{ width: stageW, height: stageH }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onContextMenu={(e) => {
          e.preventDefault();
          // Right-click on a FILLED slot opens the slot menu (handled in Konva);
          // anywhere else opens the spread-level menu (§6.7).
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const nx = (e.clientX - rect.left) / stageW;
          const ny = (e.clientY - rect.top) / stageH;
          const hit = effSlots.findIndex(
            (s, i) =>
              !!spread.imageIds[i] && nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h
          );
          if (hit < 0) setMenu({ kind: "spread", slot: -1, x: e.clientX, y: e.clientY });
        }}
        onMouseMove={(e) => {
          const p = movePending.current;
          if (!p) return;
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const nx = (e.clientX - rect.left) / stageW;
          const ny = (e.clientY - rect.top) / stageH;
          const target = effSlots.findIndex(
            (s) => nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h
          );
          if (!slotDrag && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 6) {
            setSlotDrag({ from: p.from, x: e.clientX, y: e.clientY, target });
          } else if (slotDrag) {
            setSlotDrag({ from: slotDrag.from, x: e.clientX, y: e.clientY, target });
          }
        }}
        onMouseUp={(e) => {
          const dragging = slotDrag;
          movePending.current = null;
          if (!dragging) return;
          setSlotDrag(null);
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const nx = (e.clientX - rect.left) / stageW;
          const ny = (e.clientY - rect.top) / stageH;
          const target = effSlots.findIndex(
            (s) => nx >= s.x && nx <= s.x + s.w && ny >= s.y && ny <= s.y + s.h
          );
          if (target >= 0 && target !== dragging.from) swapImages(dragging.from, target);
        }}
        onMouseLeave={() => {
          movePending.current = null;
          setSlotDrag(null);
        }}
      >
        <Stage width={stageW} height={stageH}>
          <Layer>
            <Rect
              x={0}
              y={0}
              width={stageW}
              height={stageH}
              fill={bgColor}
              onClick={() => {
                // Click the spread background = select the LAYOUT (SmartAlbums).
                useAlbum.getState().selectSpread();
                setCropSlot(null);
              }}
              onTap={() => useAlbum.getState().selectSpread()}
            />
            {spread.bgImageId ? (
              <SpreadBgPhoto
                img={images.find((m) => m.id === spread.bgImageId)}
                w={stageW}
                h={stageH}
              />
            ) : (
              tpl.bg && <BgImage url={tpl.bg} w={stageW} h={stageH} />
            )}

            {/* covers for edited/selected template texts — UNDER the photos so
                they only hide the raster text baked into the plate */}
            {tpl.texts.map((tx, i) => {
              const ed = spread.textEdits[i];
              const isSel = selectedText?.kind === "tpl" && selectedText.index === i;
              if ((!ed && !isSel) || spread.bgImageId) return null;
              const font = ed?.font ?? tx.font ?? "";
              const baseFs = textBaseFs(tx, font, stageW, stageH, fontsVersion);
              const fs = Math.max(7, baseFs * (ed?.sizeScale ?? 1));
              return (
                <TplTextCover
                  key={`c${i}`}
                  bgUrl={tpl.bg}
                  nbox={{ x: tx.x, y: tx.y, w: tx.w, h: tx.h }}
                  coverPx={{ x: tx.x * stageW, y: tx.y * stageH, w: tx.w * stageW, h: tx.h * stageH }}
                  fs={fs}
                />
              );
            })}

            {effSlots.map((slot, i) => {
              const imgId = spread.imageIds[i];
              const img = imgId ? images.find((im) => im.id === imgId) : undefined;
              return (
                <Slot
                  key={i}
                  index={i}
                  px={toPx(slot)}
                  img={img}
                  selected={selectedSlot === i}
                  crop={cropSlot === i}
                  dropTarget={!!slotDrag && slotDrag.target === i && slotDrag.from !== i}
                  ppi={ppi}
                  borderPx={pxPerCm ? (settings.borderMm / 10) * pxPerCm : 0}
                  borderColor={settings.borderColor}
                  frameRot={spread.slotRects?.[i]?.rotDeg ?? 0}
                  transform={spread.transforms[i] ?? DEFAULT_T}
                  onSelect={() =>
                    swapSource !== null && swapSource !== i
                      ? swapImages(swapSource, i)
                      : selectSlot(i)
                  }
                  onEnterCrop={() => setCropSlot(cropSlot === i ? null : i)}
                  onBeginMove={(cx, cy) => {
                    movePending.current = { from: i, sx: cx, sy: cy };
                  }}
                  onTransform={(t) => setSlotTransform(i, t)}
                  onContext={(cx, cy) => setMenu({ kind: "slot", slot: i, x: cx, y: cy })}
                />
              );
            })}

            {/* 8-handle frame editor on the selected slot (hidden in crop mode) */}
            {selectedSlot !== null && cropSlot !== selectedSlot && effSlots[selectedSlot] && (
              <SlotFrame
                px={rawPx(effSlots[selectedSlot])}
                rotDeg={spread.slotRects?.[selectedSlot]?.rotDeg ?? 0}
                onChange={(raw) => {
                  const straight = Math.abs(((raw.rotDeg % 360) + 360) % 360) < 0.5;
                  const r = straight ? snapRect(raw) : raw;
                  useAlbum.getState().setSlotRect(selectedSlot, {
                    x: (r.x - padIn) / innerW,
                    y: (r.y - padIn) / innerH,
                    w: r.w / innerW,
                    h: r.h / innerH,
                    rotDeg: raw.rotDeg,
                  });
                }}
                onWheelZoom={(dy) => {
                  const t = spread.transforms[selectedSlot] ?? DEFAULT_T;
                  setSlotTransform(selectedSlot, {
                    ...t,
                    zoom: clamp(t.zoom * (dy > 0 ? 0.9 : 1.1), 1, 6),
                  });
                }}
                onDblClick={() => setCropSlot(selectedSlot)}
                onContext={(x, y) => setMenu({ kind: "slot", slot: selectedSlot, x, y })}
              />
            )}

            {/* template typography: rasterized by default, click → editable */}
            {tpl.texts.map((tx, i) => {
              const ed = spread.textEdits[i];
              const content = ((ed?.content ?? tx.content) ?? "").replace(/\r/g, "\n");
              const lines = Math.max(1, content.split("\n").length);
              const font = ed?.font ?? tx.font ?? "";
              const baseFs = textBaseFs(tx, font, stageW, stageH, fontsVersion);
              const fs = Math.max(7, baseFs * (ed?.sizeScale ?? 1));
              const dx = ed?.dx ?? 0;
              const dy = ed?.dy ?? 0;
              return (
                <TplText
                  key={`t${i}`}
                  px={{ x: (tx.x + dx) * stageW, y: (tx.y + dy) * stageH, w: tx.w * stageW, h: tx.h * stageH }}
                  ed={ed}
                  content={content}
                  font={ed?.font ?? tx.font ?? ""}
                  color={ed?.color ?? tx.color ?? "#222222"}
                  fs={fs}
                  lines={lines}
                  scaleX={ed?.scaleX ?? 1}
                  scaleY={ed?.scaleY ?? 1}
                  rotDeg={ed?.rotDeg ?? 0}
                  selected={selectedText?.kind === "tpl" && selectedText.index === i}
                  onEnter={() => selectText({ kind: "tpl", index: i })}
                  onSelect={() => selectText({ kind: "tpl", index: i })}
                  onMoved={(xp, yp) => editTplText(i, { dx: xp / stageW - tx.x, dy: yp / stageH - tx.y })}
                  onTransformed={(t) =>
                    editTplText(i, {
                      scaleX: t.scaleX,
                      scaleY: t.scaleY,
                      rotDeg: t.rotDeg,
                      dx: t.xPx / stageW - tx.x,
                      dy: t.yPx / stageH - tx.y,
                    })
                  }
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
                  scaleX={a.scaleX ?? 1}
                  scaleY={a.scaleY ?? 1}
                  rotDeg={a.rotDeg ?? 0}
                  selected={selectedText?.kind === "added" && selectedText.id === a.id}
                  onSelect={() => selectText({ kind: "added", id: a.id })}
                  onMoved={(xp, yp) => updateAddedText(a.id, { x: xp / stageW, y: yp / stageH })}
                  onTransformed={(t) =>
                    updateAddedText(a.id, {
                      scaleX: t.scaleX,
                      scaleY: t.scaleY,
                      rotDeg: t.rotDeg,
                      x: t.xPx / stageW,
                      y: t.yPx / stageH,
                    })
                  }
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
                  onTransformed={(t) =>
                    updateTypo(pt.id, {
                      scaleX: t.scaleX,
                      scaleY: t.scaleY,
                      rotDeg: t.rotDeg,
                      x: t.xPx / stageW,
                      y: t.yPx / stageH,
                    })
                  }
                />
              );
            })}

            {/* §10.1–10.2 quality overlays (⌘B): bleed frame + binding gutter */}
            {showBleed && pxPerCm && (
              <>
                {settings.trimMm > 0 && (
                  <Rect
                    x={(settings.trimMm / 10) * pxPerCm}
                    y={(settings.trimMm / 10) * pxPerCm}
                    width={stageW - (settings.trimMm / 10) * pxPerCm * 2}
                    height={stageH - (settings.trimMm / 10) * pxPerCm * 2}
                    stroke="#ef4444"
                    strokeWidth={1}
                    dash={[7, 5]}
                    opacity={0.75}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}
                {/* safe zone from the wizard (green): keep faces/text inside */}
                {settings.safeMm > 0 && (
                  <Rect
                    x={(settings.safeMm / 10) * pxPerCm}
                    y={(settings.safeMm / 10) * pxPerCm}
                    width={stageW - (settings.safeMm / 10) * pxPerCm * 2}
                    height={stageH - (settings.safeMm / 10) * pxPerCm * 2}
                    stroke="#10b981"
                    strokeWidth={1}
                    dash={[4, 4]}
                    opacity={0.65}
                    listening={false}
                    perfectDrawEnabled={false}
                  />
                )}
                {tpl.ratioWH >= 1 && (
                  <>
                    <Rect
                      x={stageW / 2 - (GUTTER_CM * pxPerCm) / 2}
                      y={0}
                      width={GUTTER_CM * pxPerCm}
                      height={stageH}
                      fill="#000"
                      opacity={0.1}
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                    <Rect
                      x={stageW / 2 - 0.5}
                      y={0}
                      width={1}
                      height={stageH}
                      fill="#00000055"
                      listening={false}
                      perfectDrawEnabled={false}
                    />
                  </>
                )}
              </>
            )}
          </Layer>
        </Stage>

        {/* §7.4 rulers + guides */}
        {showRuler && (
          <GuideLayer
            stageW={stageW}
            stageH={stageH}
            pxPerCm={pxPerCm}
            guides={guides}
            onChange={setGuides}
          />
        )}

        {/* §7.2 rectangle tool — drag to draw a new photo frame */}
        {tool === "drawSlot" && (
          <div
            style={{ position: "absolute", inset: 0, cursor: "crosshair", zIndex: 30 }}
            onMouseDown={(e) => {
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              drawStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
              setDrawRect({ ...drawStart.current, w: 0, h: 0 });
            }}
            onMouseMove={(e) => {
              const st = drawStart.current;
              if (!st) return;
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              const cx = e.clientX - rect.left;
              const cy = e.clientY - rect.top;
              setDrawRect({
                x: Math.min(cx, st.x),
                y: Math.min(cy, st.y),
                w: Math.abs(cx - st.x),
                h: Math.abs(cy - st.y),
              });
            }}
            onMouseUp={() => {
              const r = drawRect;
              drawStart.current = null;
              setDrawRect(null);
              if (r && r.w > 24 && r.h > 24) {
                const sr = snapRect(r);
                useAlbum.getState().addDrawnSlot({
                  x: (sr.x - padIn) / innerW,
                  y: (sr.y - padIn) / innerH,
                  w: sr.w / innerW,
                  h: sr.h / innerH,
                });
              }
            }}
            onMouseLeave={() => {
              drawStart.current = null;
              setDrawRect(null);
            }}
          >
            {drawRect && (
              <div
                style={{
                  position: "absolute",
                  left: drawRect.x,
                  top: drawRect.y,
                  width: drawRect.w,
                  height: drawRect.h,
                  border: "1.5px dashed #6e76ff",
                  background: "#6e76ff22",
                  pointerEvents: "none",
                }}
              />
            )}
          </div>
        )}
        <div className="canvas-tip">
          <b>Kéo ảnh</b> đổi chỗ · <b>double-click</b> chỉnh khung · <b>SPACE</b> đổi layout · chuột phải <b>menu</b> · <b>{mod("B")}</b> bleed/gáy
        </div>
      </div>

      {slotDrag && (() => {
        const dragImg = images.find((m) => m.id === spread.imageIds[slotDrag.from]);
        return dragImg ? (
          <img
            src={dragImg.thumb}
            alt=""
            style={{
              position: "fixed",
              left: slotDrag.x + 10,
              top: slotDrag.y + 10,
              width: 72,
              height: 72,
              objectFit: "cover",
              borderRadius: 8,
              border: "2px solid #6e76ff",
              boxShadow: "0 8px 24px #000a",
              opacity: 0.9,
              pointerEvents: "none",
              zIndex: 90,
            }}
          />
        ) : null;
      })()}

      {swapSource !== null && (
        <div className="swap-hint">Đổi chỗ ảnh: bấm ô đích · Esc để huỷ</div>
      )}


      {saveTpl && (
        <div className="modal-overlay" onClick={() => setSaveTpl(null)}>
          <div
            className="modal"
            style={{ width: "min(360px, 92vw)", padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: "0 0 12px" }}>Lưu layout thành mẫu</h3>
            <input
              className="input"
              autoFocus
              value={saveTpl.name}
              onChange={(e) => setSaveTpl({ name: e.target.value })}
              onKeyDown={(e) => e.key === "Enter" && doSaveTemplate()}
              style={{ width: "100%", boxSizing: "border-box" }}
            />
            <div className="hint-sm" style={{ marginTop: 8 }}>
              {effSlots.length} khung · lưu vào “Mẫu của tôi” — hiện trong danh sách layout và khi bấm SPACE.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={() => setSaveTpl(null)}>Huỷ</button>
              <button className="btn primary" onClick={doSaveTemplate}>Lưu mẫu</button>
            </div>
          </div>
        </div>
      )}

      {menu?.kind === "slot" && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { useAlbum.getState().setAsBackground(menu.slot); setMenu(null); }}>
            Đặt làm nền (full-bleed)
          </button>
          <div className="ctx-sep" />
          <button onClick={() => { useAlbum.getState().rotateSlot(menu.slot); setMenu(null); }}>Xoay 90°</button>
          <button onClick={() => { useAlbum.getState().flipSlot(menu.slot, "h"); setMenu(null); }}>Lật ngang</button>
          <button onClick={() => { useAlbum.getState().flipSlot(menu.slot, "v"); setMenu(null); }}>Lật dọc</button>
          <div className="ctx-sep" />
          <button onClick={() => { setSlotFit(menu.slot, "cover"); setMenu(null); }}>Lấp đầy ô</button>
          <button onClick={() => { setSlotFit(menu.slot, "contain"); setMenu(null); }}>Vừa khít</button>
          <button
            onClick={() => {
              setSlotTransform(menu.slot, DEFAULT_T);
              useAlbum.getState().resetSlotRect(menu.slot);
              setMenu(null);
            }}
          >
            Đặt lại khung
          </button>
          <div className="ctx-sep" />
          <button className="danger" onClick={() => { clearSlot(menu.slot); setMenu(null); }}>Gỡ ảnh</button>
          {menu.slot >= tpl.slots.length && (
            <button
              className="danger"
              onClick={() => { useAlbum.getState().removeDrawnSlot(menu.slot); setMenu(null); }}
            >
              Xoá khung này
            </button>
          )}
        </div>
      )}

      {menu?.kind === "spread" && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          <button onClick={() => { useAlbum.getState().redesignSpread(); setMenu(null); }}>
            Redesign spread ({mod("⇧D")})
          </button>
          <button onClick={() => { useAlbum.getState().changeSlotCount(1); setMenu(null); }}>+ Thêm 1 ô ảnh</button>
          <button onClick={() => { useAlbum.getState().changeSlotCount(-1); setMenu(null); }}>− Bớt 1 ô ảnh</button>
          {spread.bgImageId && (
            <button onClick={() => { useAlbum.getState().removeBackground(); setMenu(null); }}>Gỡ ảnh nền</button>
          )}
          <div className="ctx-sep" />
          <button
            onClick={() => {
              setSaveTpl({ name: "My Layout" });
              setMenu(null);
            }}
          >
            Lưu layout thành mẫu
          </button>
          <div className="ctx-sep" />
          <button onClick={() => { useAlbum.getState().duplicateSpread(currentIndex); setMenu(null); }}>
            Nhân đôi spread
          </button>
          <button onClick={() => { useAlbum.getState().addSpreadAfter(currentIndex); setMenu(null); }}>
            Thêm spread mới sau
          </button>
          <div className="ctx-sep" />
          <button className="danger" onClick={() => { useAlbum.getState().removeSpread(currentIndex); setMenu(null); }}>
            Xoá spread
          </button>
        </div>
      )}
    </div>
  );
}
