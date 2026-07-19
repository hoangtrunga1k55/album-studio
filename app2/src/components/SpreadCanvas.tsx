import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Circle, Group, Image as KonvaImage, Layer, Rect, Stage, Text, Transformer } from "react-konva";
import Konva from "konva";
import useImage from "use-image";
import {
  getDisplayImage,
  getDisplayImageSync,
  prefetchDisplayImages,
  type ImageMeta,
} from "../ipc/import";
import {
  BLANK_TEMPLATE,
  getTemplate,
  parseSizeCm,
  saveCustomTemplate,
  spreadCmFor,
  type PhotoSlot,
  type TemplateText,
} from "../engine/templates";
import { ensureTypoDeco, getTypo, type Typo } from "../engine/typos";
import {
  orderKeys,
  pagesOf,
  PT_TO_CM,
  spreadLabel,
  zKeysOf,
  useAlbum,
  type SlotTransform,
  type TextEdit,
  type PlacedTypo,
} from "../store/album";
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
  // already decoded → picked up synchronously, no async frame
  const [uri, setUri] = useState<string | undefined>(() =>
    img ? getDisplayImageSync(img.path) : undefined
  );
  useEffect(() => {
    if (!img) {
      setUri(undefined);
      return;
    }
    if (getDisplayImageSync(img.path)) {
      setUri(getDisplayImageSync(img.path));
      return;
    }
    let live = true;
    getDisplayImage(img.path).then((u) => live && setUri(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [img?.path]);
  const [display] = useImage(uri ?? "");
  // thumbnail stands in while the sharp version decodes
  const [thumb] = useImage(img?.thumb ?? "");
  const image = display ?? thumb;
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
  /** the plate has no baked text → this text MUST be drawn as vector. */
  alwaysVector?: boolean;
  onEnter: () => void;
  onSelect: () => void;
  onMoved: (xPx: number, yPx: number) => void;
  onTransformed: (t: NodeTransform) => void;
}) {
  const {
    px, ed, content, font, color, fs, lines, scaleX, scaleY, rotDeg,
    selected, alwaysVector = false, onEnter, onSelect, onMoved, onTransformed,
  } = props;
  const editing = ed !== undefined;
  // Vector overlay when the text is edited/selected — or always, when the
  // plate carries no baked text (pack layouts).
  const showOverlay = editing || selected || alwaysVector;

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
  /** SmartAlbums smart guides: snap the frame live while dragging.
   *  A guide with `g` set means "đúng khoảng cách gap" → drawn yellow. */
  onLiveSnap?: (r: Px) => { x: number; y: number; v: SnapGuide[]; h: SnapGuide[] };
  onGuides?: (g: { v: SnapGuide[]; h: SnapGuide[] } | null) => void;
}) {
  const { px, rotDeg, onChange, onWheelZoom, onDblClick, onContext, onLiveSnap, onGuides } = props;
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
        onDragMove={(e) => {
          // live smart guides — only for unrotated frames (axis-aligned snap)
          if (!onLiveSnap || Math.abs(rotDeg) > 0.5) return;
          const n = e.target;
          const s = onLiveSnap({ x: n.x() - px.w / 2, y: n.y() - px.h / 2, w: px.w, h: px.h });
          n.x(s.x + px.w / 2);
          n.y(s.y + px.h / 2);
          onGuides?.(s.v.length || s.h.length ? { v: s.v, h: s.h } : null);
        }}
        onDragEnd={(e) => {
          onGuides?.(null);
          onChange({ x: e.target.x() - px.w / 2, y: e.target.y() - px.h / 2, w: px.w, h: px.h, rotDeg });
        }}
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
  /** Ruler placement: rulers hug the CANVAS edges, not the spread — these are
   *  the spread's offsets inside the canvas so the scale still starts at 0
   *  on the spread's edge. */
  offsetX?: number;
  offsetY?: number;
}) {
  const { stageW, stageH, pxPerCm, guides, onChange, offsetX = 0, offsetY = 0 } = props;
  const hostRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ axis: "v" | "h"; pos: number; idx: number | null } | null>(null);

  useEffect(() => {
    if (!drag) return;
    const posFrom = (e: MouseEvent, axis: "v" | "h") => {
      // the layer spans the CANVAS now — subtract the spread's offset so guide
      // positions stay normalized to the spread itself
      const r = hostRef.current!.getBoundingClientRect();
      return axis === "v"
        ? (e.clientX - r.left - offsetX) / stageW
        : (e.clientY - r.top - offsetY) / stageH;
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
  const R = 18; // ruler thickness
  // Don't crowd the numbers when a cm is only a few px wide.
  const labelStep = cm >= 26 ? 1 : cm >= 13 ? 2 : 5;
  const cmCountW = Math.floor(stageW / cm);
  const cmCountH = Math.floor(stageH / cm);
  /** major tick each cm (full) + minor each ½cm (short) — SmartAlbums look. */
  const ticks = (dir: "right" | "bottom") => ({
    backgroundImage:
      `repeating-linear-gradient(to ${dir}, #8b8b8b 0 1px, transparent 1px ${cm}px),` +
      `repeating-linear-gradient(to ${dir}, #b5b5b5 0 1px, transparent 1px ${cm / 2}px)`,
    backgroundSize: dir === "right" ? "100% 100%, 100% 6px" : "100% 100%, 6px 100%",
    backgroundPosition: dir === "right" ? "0 0, 0 100%" : "0 0, 100% 0",
    backgroundRepeat: "no-repeat, no-repeat",
  });

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 20 }}>
      {/* SmartAlbums rulers: numbered cm scale, drag out to create a guide */}
      <div
        className="sa-ruler sa-ruler-h"
        title="Kéo xuống để tạo guide ngang"
        style={{
          height: R,
          left: R,
          // ticks start at the spread's left edge, not the canvas edge
          backgroundPositionX: `${offsetX - R}px`,
          ...ticks("right"),
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDrag({ axis: "h", pos: 0, idx: null });
        }}
      >
        {Array.from({ length: Math.floor(cmCountW / labelStep) + 1 }, (_, k) => (
          <span
            key={k}
            className="sa-ruler-num"
            style={{ left: offsetX - R + k * labelStep * cm + 2 }}
          >
            {k * labelStep}
          </span>
        ))}
      </div>
      <div
        className="sa-ruler sa-ruler-v"
        title="Kéo sang phải để tạo guide dọc"
        style={{
          width: R,
          top: R,
          backgroundPositionY: `${offsetY - R}px`,
          ...ticks("bottom"),
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          setDrag({ axis: "v", pos: 0, idx: null });
        }}
      >
        {Array.from({ length: Math.floor(cmCountH / labelStep) + 1 }, (_, k) => (
          <span
            key={k}
            className="sa-ruler-num v"
            style={{ top: offsetY - R + k * labelStep * cm + 2 }}
          >
            {k * labelStep}
          </span>
        ))}
      </div>
      {/* corner box where the rulers meet */}
      <div className="sa-ruler-corner" style={{ width: R, height: R }} title="cm" />
      {/* placed guides */}
      {guides.v.map((g, i) => (
        <div
          key={`v${i}`}
          style={{
            position: "absolute", top: offsetY, height: stageH, left: offsetX + g * stageW - 1, width: 3,
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
            position: "absolute", left: offsetX, width: stageW, top: offsetY + g * stageH - 1, height: 3,
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
          <div style={{ position: "absolute", top: offsetY, height: stageH, left: offsetX + drag.pos * stageW, width: 1, background: "#22d3ee" }} />
        ) : (
          <div style={{ position: "absolute", left: offsetX, width: stageW, top: offsetY + drag.pos * stageH, height: 1, background: "#22d3ee" }} />
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
  /** stage px per POINT — converts the per-photo borderPt/radiusPt overrides. */
  ptPx?: number;
  /** a full-bleed background photo sits behind: empty frames must not paint
   *  their gray placeholder/number over it (§6.5). */
  bgBehind?: boolean;
  /** free rotation of the whole frame (degrees). */
  frameRot?: number;
  transform: SlotTransform;
  /** stage-px pointer + Alt flag ride along: Alt+mod-click drills DOWN the
   *  stack to photos covered by this one (Photoshop style). */
  onSelect: (stagePt?: { x: number; y: number }, alt?: boolean) => void;
  onEnterCrop: () => void;
  /** mousedown on a photo outside crop mode → maybe start a move-drag. */
  onBeginMove: (clientX: number, clientY: number) => void;
  onTransform: (t: SlotTransform) => void;
  onContext: (clientX: number, clientY: number) => void;
}) {
  const {
    index, px, img, selected, crop, dropTarget, ppi, frameRot = 0, transform: t,
    borderPx = 0, borderColor = "#ffffff", ptPx = 0, bgBehind = false,
    onSelect, onEnterCrop, onBeginMove, onTransform, onContext,
  } = props;
  // SmartAlbums per-photo styling: border/radius/opacity override the album
  // defaults (undefined = inherit). All in points, converted via ptPx.
  const effBorderPx = t.borderPt != null && ptPx > 0 ? t.borderPt * ptPx : borderPx;
  const effBorderColor = t.borderColor ?? borderColor;
  const radiusPx = Math.min((t.radiusPt ?? 0) * ptPx, px.w / 2, px.h / 2);
  const photoOpacity = t.opacity ?? 1;
  const roundClip =
    radiusPx > 0.5
      ? {
          clipFunc: (ctx: Konva.Context) => {
            const r = radiusPx;
            ctx.beginPath();
            ctx.moveTo(px.x + r, px.y);
            ctx.arcTo(px.x + px.w, px.y, px.x + px.w, px.y + px.h, r);
            ctx.arcTo(px.x + px.w, px.y + px.h, px.x, px.y + px.h, r);
            ctx.arcTo(px.x, px.y + px.h, px.x, px.y, r);
            ctx.arcTo(px.x, px.y, px.x + px.w, px.y, r);
            ctx.closePath();
          },
        }
      : { clipX: px.x, clipY: px.y, clipWidth: px.w, clipHeight: px.h };
  // already decoded → picked up synchronously, no async frame on remounts
  const [uri, setUri] = useState<string | undefined>(() =>
    img ? getDisplayImageSync(img.path) : undefined
  );
  const drag = useRef<{ cx: number; cy: number; panX: number; panY: number } | null>(null);

  useEffect(() => {
    if (!img) {
      setUri(undefined);
      return;
    }
    const ready = getDisplayImageSync(img.path);
    if (ready) {
      setUri(ready);
      return;
    }
    let live = true;
    getDisplayImage(img.path).then((u) => live && setUri(u)).catch(() => {});
    return () => {
      live = false;
    };
  }, [img?.path]);

  const [display] = useImage(uri ?? "");
  // thumbnail (already in memory) stands in while the sharp version decodes
  const [thumb] = useImage(img?.thumb ?? "");
  const image = display ?? thumb;
  const isPreviewQuality = !display && !!thumb;

  // Tone adjustments need the node cached (Konva filters render off a cache).
  const imgRef = useRef<Konva.Image>(null);
  const bright = t.brightness ?? 0;
  const contr = t.contrast ?? 0;
  const hasTone = bright !== 0 || contr !== 0;
  useEffect(() => {
    const n = imgRef.current;
    if (!n) return;
    if (hasTone) n.cache();
    else n.clearCache();
    n.getLayer()?.batchDraw();
  }, [image, hasTone, bright, contr, px.w, px.h, t.zoom, t.rot]);

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
    // never judge DPI from the low-res thumbnail stand-in
    if (ppi && !isPreviewQuality) dpi = ppi / scale;
    node = (
      <KonvaImage
        ref={imgRef}
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
        filters={hasTone ? [Konva.Filters.Brighten, Konva.Filters.Contrast] : undefined}
        brightness={bright}
        contrast={contr}
        listening={false}
        perfectDrawEnabled={false}
      />
    );
  } else if (bgBehind) {
    // over a full-bleed background: just a faint dashed outline, no gray fill
    node = (
      <Rect
        x={px.x}
        y={px.y}
        width={px.w}
        height={px.h}
        stroke="#ffffff88"
        strokeWidth={1}
        dash={[6, 5]}
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
  const selectAtPointer = (e: Konva.KonvaEventObject<MouseEvent | Event>) => {
    const pt = e.target.getStage()?.getPointerPosition();
    const alt = (e.evt as MouseEvent).altKey === true;
    onSelect(pt ?? undefined, alt);
  };
  return (
    <Group
      onClick={selectAtPointer}
      onWheel={onWheel}
      onMouseDown={onDown}
      onMouseMove={onMove}
      onMouseUp={onUp}
      onMouseLeave={onUp}
      onDblClick={(e) => {
        if (!img) return;
        // a photo's double-click = crop mode; don't also enter layout mode
        e.cancelBubble = true;
        e.evt.stopPropagation();
        onEnterCrop();
      }}
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
      <Group {...roundClip} opacity={photoOpacity}>{node}</Group>
      {/* border around the photo: album setting or the per-photo override */}
      {img && effBorderPx > 0 && (
        <Rect
          x={px.x}
          y={px.y}
          width={px.w}
          height={px.h}
          cornerRadius={radiusPx}
          stroke={effBorderColor}
          strokeWidth={effBorderPx}
          opacity={photoOpacity}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      {!img && !bgBehind && (
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
      {/* SmartAlbums-style chrome: ONE thin border when selected, a faint
          outline only on EMPTY frames (a photo's own edge is enough). */}
      {(dropTarget || crop || selected || !img) && (
        <Rect
          x={px.x}
          y={px.y}
          width={px.w}
          height={px.h}
          stroke={dropTarget ? "#10b981" : crop ? "#f59e0b" : selected ? "#6e76ff" : "rgba(60,40,90,0.18)"}
          strokeWidth={dropTarget ? 3 : crop ? 2 : selected ? 2 : 1}
          dash={crop ? [7, 5] : undefined}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
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

const IS_MAC = navigator.platform.toLowerCase().includes("mac");

/** One lit-up snap line: position (stage px) + whether it is a GAP snap
 *  (frame sits exactly `gapPt` from a neighbour) — gap lines render yellow. */
export interface SnapGuide {
  p: number;
  g?: boolean;
}

export function SpreadCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  /** where the spread sits inside the canvas — the rulers hug the canvas
   *  edges but their scale must still start at the spread's edge. */
  const [stageOff, setStageOff] = useState({ x: 0, y: 0 });

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
  // ⌘/Ctrl+1 (App-level shortcut) → zoom to real print size; the math needs
  // this component's stage numbers, so App just fires an event.
  const zoom100Ref = useRef(1);
  useEffect(() => {
    const on = () => useAlbum.getState().setViewZoom(zoom100Ref.current);
    window.addEventListener("albumstudio:zoom100", on);
    return () => window.removeEventListener("albumstudio:zoom100", on);
  }, []);

  // Smart guides lighting up while a frame is being dragged (SmartAlbums).
  const [liveGuides, setLiveGuides] = useState<{ v: SnapGuide[]; h: SnapGuide[] } | null>(null);
  const alignAnchor = useAlbum((s) => s.alignAnchor);
  // Layout mode (click the spread background): ruler + frame editing live
  // here; photo-swap dragging belongs to the normal mode outside.
  const spreadSelected = useAlbum((s) => s.spreadSelected);
  // Multi-select group (Shift-click) — union box drags everything together.
  const multiSel = useAlbum((s) => s.multiSel);
  const shiftRef = useRef(false);
  // mirrored in state: the group-box overlay must VISUALLY yield (pointer
  // pass-through) while the gather modifier is held — a ref can't re-render
  const [modHeld, setModHeld] = useState(false);
  const [groupDrag, setGroupDrag] = useState<{ dx: number; dy: number } | null>(null);
  // Marquee: drag on the empty background draws a selection rectangle.
  const marqueeRef = useRef<Px | null>(null);
  const [marquee, setMarquee] = useState<Px | null>(null);
  // The click that follows a marquee release must never reach the element
  // under the cursor (it would steal the selection) — swallowed at capture.
  const justMarqueed = useRef(false);
  useEffect(() => {
    // Shift OR ⌘/Ctrl gathers into the multi-selection. IMPORTANT: keyboard
    // events for Meta can be EATEN by Vietnamese input methods (same disease
    // as the zoom shortcuts) — so the source of truth is the modifier state
    // riding on every MOUSE event, which is always accurate.
    const sync = (held: boolean) => {
      if (held !== shiftRef.current) {
        shiftRef.current = held;
        setModHeld(held);
      }
    };
    const fromMouse = (e: MouseEvent) => sync(e.shiftKey || e.metaKey || e.ctrlKey);
    const fromKey = (e: KeyboardEvent) => {
      if (e.key === "Shift" || e.key === "Meta" || e.key === "Control") {
        sync(e.type === "keydown" ? true : e.shiftKey || e.metaKey || e.ctrlKey);
      }
    };
    const reset = () => sync(false);
    window.addEventListener("mousemove", fromMouse, true);
    window.addEventListener("mousedown", fromMouse, true);
    window.addEventListener("keydown", fromKey);
    window.addEventListener("keyup", fromKey);
    window.addEventListener("blur", reset);
    return () => {
      window.removeEventListener("mousemove", fromMouse, true);
      window.removeEventListener("mousedown", fromMouse, true);
      window.removeEventListener("keydown", fromKey);
      window.removeEventListener("keyup", fromKey);
      window.removeEventListener("blur", reset);
    };
  }, []);
  const setCropSlot = useAlbum((s) => s.setCropSlot);
  // A click on a context-menu item + the next click on the canvas can be
  // COUNTED AS ONE DOUBLE-CLICK by the browser (same spot, <400ms) — that
  // used to throw the user into layout mode right after "Nhân đôi spread".
  const menuClosedAt = useRef(0);
  // Right-click menu of the zoom tool (Fit / 100% / In / Out).
  const [zoomMenu, setZoomMenu] = useState<{ x: number; y: number } | null>(null);
  // Slot-to-slot photo move (§6.2): mousedown arms it, movement >6px starts it.
  const movePending = useRef<{ from: number; sx: number; sy: number } | null>(null);
  const [slotDrag, setSlotDrag] = useState<
    { from: number; x: number; y: number; target: number } | null
  >(null);

  // Switching spread (⟨⟩, duplicate, filmstrip click) kills any half-armed
  // drag gesture — its slot indices belong to the OLD spread.
  useEffect(() => {
    movePending.current = null;
    setSlotDrag(null);
  }, [currentIndex]);

  const previewTemplateId = useAlbum((s) => s.previewTemplateId);
  const spreadReal = spreads[currentIndex];
  // Hover preview (layout strip / center ▦ grid): render the candidate
  // template with pristine frames — the saved spread is untouched.
  const spread =
    previewTemplateId && spreadReal
      ? { ...spreadReal, transforms: {}, slotRects: {}, textEdits: {} }
      : spreadReal;
  // Blank page fallback: a new spread has no template — render a clean white
  // spread; the real layout arrives with the first dropped photos.
  const tpl = spread
    ? getTemplate(previewTemplateId ?? spread.templateId ?? null) ?? BLANK_TEMPLATE
    : undefined;

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    // content box (padding excluded) — layout mode pads the canvas for rulers
    const measure = () => {
      const cs = getComputedStyle(el);
      const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
      const padY = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      setBox({ w: el.clientWidth - padX, h: el.clientHeight - padY });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [spreadSelected, showRuler]);

  // Track where the spread sits inside the canvas (it is centered by margin
  // auto and moves with zoom / panel resizes) — the rulers need this offset.
  useEffect(() => {
    const measure = () => {
      const w = wrapRef.current;
      const h = hostRef.current;
      if (!w || !h) return;
      const wr = w.getBoundingClientRect();
      const hr = h.getBoundingClientRect();
      const next = { x: hr.left - wr.left, y: hr.top - wr.top };
      setStageOff((p) => (p.x === next.x && p.y === next.y ? p : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (wrapRef.current) ro.observe(wrapRef.current);
    if (hostRef.current) ro.observe(hostRef.current);
    return () => ro.disconnect();
  });

  // Warm the display-image cache for this spread AND its neighbours — by the
  // time the user steps ⟨/⟩, the sharp images are already decoded.
  useEffect(() => {
    const byId = new Map(images.map((m) => [m.id, m.path]));
    const paths: string[] = [];
    for (const idx of [currentIndex, currentIndex + 1, currentIndex - 1]) {
      const sp = spreads[idx];
      if (!sp) continue;
      for (const id of sp.imageIds) {
        const p = id ? byId.get(id) : undefined;
        if (p) paths.push(p);
      }
      const bg = sp.bgImageId ? byId.get(sp.bgImageId) : undefined;
      if (bg) paths.push(bg);
    }
    prefetchDisplayImages(paths);
  }, [currentIndex, spreads, images]);

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
      } else if (e.key.toLowerCase() === "g") {
        // G = toggle the selected frame as the align anchor (mốc căn).
        if (st.selectedSlot !== null) {
          e.preventDefault();
          st.setAlignAnchor(st.alignAnchor === st.selectedSlot ? null : st.selectedSlot);
        }
      } else if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        if (st.selectedTypo) st.removeTypo(st.selectedTypo);
        else if (st.selectedText) {
          if (st.selectedText.kind === "tpl") st.deleteTplText(st.selectedText.index);
          else st.removeAddedText(st.selectedText.id);
        } else if (st.selectedSlot !== null) {
          // layout mode + hand-drawn extra frame → Delete removes the frame
          const curSp = st.spreads[st.currentIndex];
          const tplNow = getTemplate(curSp?.templateId ?? null);
          const tplSlots = tplNow?.slots.length ?? 0;
          if (st.spreadSelected && st.selectedSlot >= tplSlots) st.removeDrawnSlot(st.selectedSlot);
          else st.clearSlot(st.selectedSlot);
        }
        // nothing on the canvas selected (and no tray photos — the tray owns
        // Delete then) → remove the CURRENT spread
        else if (st.selectedPhotos.length === 0 && st.spreads.length > 1) {
          st.removeSpread(st.currentIndex);
        }
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
        st.clearSelection(); // also leaves layout mode
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
  // Cover can be 1-page (front only) or a 2-page wrap; content spreads
  // follow their template orientation.
  const pagesEff = pagesOf(spread, tpl.ratioWH || 2);
  const pageCmBase = parseSizeCm(useAlbum.getState().size);
  const cmDims = pageCmBase
    ? { w: pageCmBase.w * pagesEff, h: pageCmBase.h }
    : spreadCmFor(tpl, useAlbum.getState().size);
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

  // Zoom presets: Fit = 1 (stage sized to the wrap); 100% = real print size
  // on a ~96dpi screen (1cm of the album ≈ 37.8 css px).
  const zoom100 = cmDims ? Math.min(6, Math.max(0.25, (cmDims.h * (96 / 2.54)) / (stageH / viewZoom))) : 1;
  zoom100Ref.current = zoom100;

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

  /** Bounding rect (stage px) of any z-key — used by the group box and the
   *  marquee hit-test. Text/typo boxes are close approximations. */
  const keyRect = (k: string): Px | null => {
    if (k[0] === "s") {
      const i = parseInt(k.slice(1), 10);
      return effSlots[i] ? toPx(effSlots[i]) : null;
    }
    if (k[0] === "t") {
      const i = parseInt(k.slice(1), 10);
      const tx = tpl.texts[i];
      if (!tx || spread.textEdits[i]?.deleted) return null;
      const ed = spread.textEdits[i];
      return {
        x: (tx.x + (ed?.dx ?? 0)) * stageW,
        y: (tx.y + (ed?.dy ?? 0)) * stageH,
        w: tx.w * stageW * (ed?.scaleX ?? 1),
        h: tx.h * stageH * (ed?.scaleY ?? 1),
      };
    }
    if (k[0] === "a") {
      const a = spread.addedTexts.find((x) => x.id === k.slice(1));
      if (!a) return null;
      const fs = Math.max(8, a.sizeFrac * stageH);
      const lines = Math.max(1, a.content.split("\n").length);
      return {
        x: a.x * stageW,
        y: a.y * stageH,
        w: stageW * 0.5 * (a.scaleX ?? 1),
        h: fs * 1.12 * lines * (a.scaleY ?? 1),
      };
    }
    const pt = (spread.typos ?? []).find((x) => x.id === k.slice(1));
    if (!pt) return null;
    const typo = getTypo(pt.typoId);
    const w = pt.w * stageW * (pt.scaleX ?? 1);
    return {
      x: pt.x * stageW,
      y: pt.y * stageH,
      w,
      h: ((pt.w * stageW) / (typo?.ratioWH || 1)) * (pt.scaleY ?? 1),
    };
  };

  /** Smart-guide targets: page edges/center + ¼-½-¾ grid + user guides +
   *  every OTHER frame's edges and centers (SmartAlbums alignment) — plus GAP
   *  targets sitting exactly `gapPt` outside each neighbour's edge, so two
   *  frames snap to the configured spacing (lit up yellow). */
  const snapGapPx = pxPerCm ? settings.gapPt * PT_TO_CM * pxPerCm : 0;
  const snapTargets = (excludeIdx: number | null) => {
    const xs: SnapGuide[] = [0, stageW / 4, stageW / 2, (3 * stageW) / 4, stageW, ...guides.v.map((g) => g * stageW)].map((p) => ({ p }));
    const ys: SnapGuide[] = [0, stageH / 4, stageH / 2, (3 * stageH) / 4, stageH, ...guides.h.map((g) => g * stageH)].map((p) => ({ p }));
    effSlots.forEach((s, i) => {
      if (i === excludeIdx) return;
      const r = rawPx(s);
      xs.push({ p: r.x }, { p: r.x + r.w / 2 }, { p: r.x + r.w });
      ys.push({ p: r.y }, { p: r.y + r.h / 2 }, { p: r.y + r.h });
      if (snapGapPx > 0) {
        xs.push({ p: r.x - snapGapPx, g: true }, { p: r.x + r.w + snapGapPx, g: true });
        ys.push({ p: r.y - snapGapPx, g: true }, { p: r.y + r.h + snapGapPx, g: true });
      }
    });
    return { xs, ys };
  };

  /** Live snap while dragging: pulls the frame's edges/center onto the nearest
   *  target and lights up the guide. Gap targets get a wider tolerance (easy
   *  to hit, per leader feedback) and win ties; centers never gap-snap. */
  const liveSnapRect = (
    r: Px,
    excludeIdx: number | null
  ): { x: number; y: number; v: SnapGuide[]; h: SnapGuide[] } => {
    const { xs, ys } = snapTargets(excludeIdx);
    const pick = (edges: number[], targets: SnapGuide[]): { d: number; t: SnapGuide } | null => {
      let best: { d: number; t: SnapGuide } | null = null;
      edges.forEach((edge, ei) => {
        for (const t of targets) {
          if (t.g && ei === 1) continue; // a CENTER at gap distance means nothing
          const d = t.p - edge;
          const tol = t.g ? 8 : 6;
          if (Math.abs(d) > tol) continue;
          if (!best || Math.abs(d) < Math.abs(best.d) - (t.g ? 0.75 : 0)) best = { d, t };
        }
      });
      return best;
    };
    const bx = pick([r.x, r.x + r.w / 2, r.x + r.w], xs);
    const by = pick([r.y, r.y + r.h / 2, r.y + r.h], ys);
    return {
      x: r.x + (bx?.d ?? 0),
      y: r.y + (by?.d ?? 0),
      v: bx ? [bx.t] : [],
      h: by ? [by.t] : [],
    };
  };

  /** §7.2 snap: pull frame edges onto guides / spread edges / center (±7px). */
  const snapRect = (r: Px): Px => {
    const t = 7;
    const { xs: xsT, ys: ysT } = snapTargets(selectedSlot);
    const xs = xsT.map((c) => c.p);
    const ys = ysT.map((c) => c.p);
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
    saveCustomTemplate(
      size,
      saveTpl.name.trim() || "My Layout",
      ratio,
      effSlots.map((s) => ({ ...s })),
      spread.isCover ? "cover" : "spread"
    );
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
      void ensureTypoDeco(typoId); // decoration PNG loads on first use
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
    <div
      className={"canvas-wrap" + (spreadSelected && showRuler ? " ruler-on" : "")}
      ref={wrapRef}
      onClick={() => { setMenu(null); setZoomMenu(null); }}
    >
      {spreadSelected ? (
        /* layout mode: compact corner controls — back left, save right */
        <>
          {/* SmartAlbums vertical tool rail: select · frame · text · hand · zoom */}
          <div className="layout-tools">
            <button
              className={"lt-btn" + (tool === "select" ? " active" : "")}
              title="Chọn / di chuyển (V)"
              onClick={() => useAlbum.getState().setTool("select")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M5 2l14 11-6.5 1L16 21l-3 1.4-3.4-7L5 19V2z"/></svg>
            </button>
            <button
              className={"lt-btn" + (tool === "drawSlot" ? " active" : "")}
              title="Vẽ khung ảnh mới — kéo trên spread (Esc thoát)"
              onClick={() => useAlbum.getState().setTool(tool === "drawSlot" ? "select" : "drawSlot")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="4" y="5" width="16" height="14" rx="1"/><circle cx="9" cy="10" r="1.6" fill="currentColor" stroke="none"/><path d="M4 16l5-4 4 3 3-2 4 3"/></svg>
            </button>
            <button
              className="lt-btn"
              title="Thêm chữ vào giữa trang"
              onClick={() =>
                useAlbum.getState().addText({
                  content: "Nội dung mới",
                  font: "",
                  color: "#222222",
                  sizeFrac: 0.035,
                  x: 0.4,
                  y: 0.45,
                })
              }
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M4 4h16v4h-2.2V6.4H13.4V19h2.1v2H8.5v-2h2.1V6.4H6.2V8H4V4z"/></svg>
            </button>
            <button
              className={"lt-btn" + (tool === "hand" ? " active" : "")}
              title="Bàn tay — kéo để di chuyển vùng nhìn (khi đã zoom)"
              onClick={() => useAlbum.getState().setTool(tool === "hand" ? "select" : "hand")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M8.5 11.5V5.7a1.4 1.4 0 012.8 0v5m0-6.4a1.4 1.4 0 012.8 0v6.4m0-5a1.4 1.4 0 012.8 0v7.8c0 3.6-2.4 6-6 6-2.7 0-4.3-1.1-5.6-3.2L3.6 12.9c-.7-1-.3-2.1.6-2.5.8-.4 1.7-.1 2.3.7l2 2.6"/></svg>
            </button>
            <button
              className={"lt-btn" + (tool === "zoom" ? " active" : "")}
              title="Kính lúp — click phóng to, Alt+click thu nhỏ, double-click về 100%"
              onClick={() => useAlbum.getState().setTool(tool === "zoom" ? "select" : "zoom")}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/><path d="M8 10.5h5M10.5 8v5"/></svg>
            </button>
          </div>
          <div className="layout-bar lb-left">
            <button
              className="lb-btn"
              title="Về chế độ thường (Esc)"
              onClick={() => useAlbum.getState().clearSelection()}
            >
              ←
            </button>
            <span className="lb-title">
              {spreadLabel(spreads, currentIndex)}
              <span className="lb-sub">/{spreads.length - (spreads[0]?.isCover ? 1 : 0)}</span>
            </span>
            {/* cover size toggle — front only / full wrap */}
            {spread.isCover && (
              <span className="lb-pages">
                <button
                  className={"lb-btn" + ((spread.pages ?? 2) === 1 ? " primary" : "")}
                  title="Bìa trước — 1 trang"
                  onClick={() => useAlbum.getState().setCoverPages(1)}
                >
                  1 trang
                </button>
                <button
                  className={"lb-btn" + ((spread.pages ?? 2) === 2 ? " primary" : "")}
                  title="Bìa ôm — trải 2 trang (trước + sau)"
                  onClick={() => useAlbum.getState().setCoverPages(2)}
                >
                  2 trang
                </button>
              </span>
            )}
          </div>
          <div className="layout-bar lb-right">
            <button
              className="lb-btn primary"
              title="Lưu bố cục khung hiện tại vào Mẫu của tôi"
              onClick={() => setSaveTpl({ name: "My Layout" })}
            >
              ⭳ Lưu mẫu
            </button>
          </div>
        </>
      ) : (
        /* accent badge — pairs with the highlighted card in the filmstrip below */
        <div className="spread-chip">
          {spreadLabel(spreads, currentIndex)}
          <span className="spread-chip-sub">
            /{spreads.length - (spreads[0]?.isCover ? 1 : 0)} · double-click = sửa layout
          </span>
        </div>
      )}
      <div
        className="stage-host"
        ref={hostRef}
        style={{ width: stageW, height: stageH }}
        onDoubleClick={(e) => {
          // SmartAlbums: double-click anywhere on the spread → layout editing.
          // Works even when a full-bleed photo covers every pixel. A photo's
          // own double-click (crop mode) stops propagation, so it wins there.
          if (useAlbum.getState().spreadSelected) return;
          // …but a menu-item click followed by a quick click here is NOT a
          // real double-click — the browser merges them (same spot + <400ms).
          if (Date.now() - menuClosedAt.current < 500) return;
          e.stopPropagation();
          useAlbum.getState().selectSpread();
        }}
        onClickCapture={(e) => {
          // the click right after a marquee release must not reach Konva —
          // it would re-select the element under the cursor and drop the group
          if (justMarqueed.current) {
            justMarqueed.current = false;
            e.preventDefault();
            e.stopPropagation();
          }
        }}
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
          // layout mode moves FRAMES — a pending photo-swap drag armed just
          // before entering it (e.g. the duplicate double-click) must die here
          if (useAlbum.getState().spreadSelected) {
            movePending.current = null;
            if (slotDrag) setSlotDrag(null);
            return;
          }
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
        {spreadSelected && (tool === "hand" || tool === "zoom") && (
          <div
            className={"view-tool-overlay " + (tool === "hand" ? "hand" : "zoom")}
            onMouseDown={(e) => {
              if (tool !== "hand") return;
              e.preventDefault();
              const wrap = wrapRef.current;
              if (!wrap) return;
              const sx = e.clientX;
              const sy = e.clientY;
              const sl = wrap.scrollLeft;
              const st0 = wrap.scrollTop;
              const mm = (ev: MouseEvent) => {
                wrap.scrollLeft = sl - (ev.clientX - sx);
                wrap.scrollTop = st0 - (ev.clientY - sy);
              };
              const up = () => {
                window.removeEventListener("mousemove", mm);
                window.removeEventListener("mouseup", up);
              };
              window.addEventListener("mousemove", mm);
              window.addEventListener("mouseup", up);
            }}
            onClick={(e) => {
              if (tool !== "zoom") return;
              const st = useAlbum.getState();
              const z = st.viewZoom;
              st.setViewZoom(e.altKey ? Math.max(1, z / 1.25) : Math.min(4, z * 1.25));
            }}
            onDoubleClick={(e) => {
              if (tool !== "zoom") return;
              e.stopPropagation();
              useAlbum.getState().setViewZoom(1);
            }}
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoomMenu({ x: e.clientX, y: e.clientY });
            }}
          />
        )}
        <Stage width={stageW} height={stageH}>
          <Layer>
            <Rect
              x={0}
              y={0}
              width={stageW}
              height={stageH}
              fill={bgColor}
              onMouseDown={(e) => {
                // Drag from the background = marquee selection. Window-level
                // listeners own the whole gesture; the mouseup is blocked at
                // CAPTURE so Konva never synthesizes a click that would
                // select the element under the cursor / enter layout mode.
                const host = e.target.getStage()?.container();
                if (!host) return;
                const box = host.getBoundingClientRect();
                const sx = e.evt.clientX;
                const sy = e.evt.clientY;
                let movedFar = false;
                const mm = (ev: MouseEvent) => {
                  if (!movedFar && Math.hypot(ev.clientX - sx, ev.clientY - sy) <= 4) return;
                  movedFar = true;
                  const r = {
                    x: Math.min(sx, ev.clientX) - box.left,
                    y: Math.min(sy, ev.clientY) - box.top,
                    w: Math.abs(ev.clientX - sx),
                    h: Math.abs(ev.clientY - sy),
                  };
                  marqueeRef.current = r;
                  setMarquee(r);
                };
                const mu = (ev: MouseEvent) => {
                  window.removeEventListener("mousemove", mm);
                  window.removeEventListener("mouseup", mu, true);
                  if (!movedFar) return; // plain click → Konva click → layout mode
                  ev.stopPropagation(); // Konva must not see this mouseup
                  justMarqueed.current = true; // …nor the native click after it
                  const mq = marqueeRef.current;
                  marqueeRef.current = null;
                  setMarquee(null);
                  if (!mq) return;
                  const st = useAlbum.getState();
                  const hits = zKeysOf(spread, effSlots.length, tpl.texts.length).filter((k) => {
                    const r = keyRect(k);
                    return (
                      !!r &&
                      r.x < mq.x + mq.w &&
                      r.x + r.w > mq.x &&
                      r.y < mq.y + mq.h &&
                      r.y + r.h > mq.y
                    );
                  });
                  // modifier held → marquee ADDS to the existing group
                  if (shiftRef.current && hits.length > 0) {
                    st.setMultiSel([...new Set([...st.multiSel, ...hits])]);
                    return;
                  }
                  if (hits.length >= 2) st.setMultiSel(hits);
                  else if (hits.length === 1) {
                    const k = hits[0];
                    if (k[0] === "s") st.selectSlot(parseInt(k.slice(1), 10));
                    else if (k[0] === "t")
                      st.selectText({ kind: "tpl", index: parseInt(k.slice(1), 10) });
                    else if (k[0] === "a") st.selectText({ kind: "added", id: k.slice(1) });
                    else st.selectTypo(k.slice(1));
                  }
                };
                window.addEventListener("mousemove", mm);
                window.addEventListener("mouseup", mu, true);
              }}
              onClick={() => {
                // While gathering (⌘/Ctrl/Shift held) a slip onto the
                // background must NOT nuke the group / enter layout mode.
                if (shiftRef.current) return;
                // Click the spread background = select the LAYOUT (SmartAlbums).
                useAlbum.getState().selectSpread();
                setCropSlot(null);
              }}
              onTap={() => {
                if (shiftRef.current) return;
                useAlbum.getState().selectSpread();
              }}
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
              // nothing to hide when the plate has no baked text
              if (tpl.bgHasText === false) return null;
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

            {/* unified paint order (Arrange): photos + texts + typos in ONE
                stack — first = bottom, last = top */}
            {orderKeys(spread.zOrder, zKeysOf(spread, effSlots.length, tpl.texts.length)).map((zk) => {
              // ---- photo slot `s<i>`
              if (zk[0] === "s") {
              const i = parseInt(zk.slice(1), 10);
              const slot = effSlots[i];
              if (!slot) return null;
              const imgId = spread.imageIds[i];
              const img = imgId ? images.find((im) => im.id === imgId) : undefined;
              return (
                <Slot
                  key={i}
                  index={i}
                  px={toPx(slot)}
                  img={img}
                  selected={selectedSlot === i && !spreadSelected}
                  crop={cropSlot === i}
                  dropTarget={!!slotDrag && slotDrag.target === i && slotDrag.from !== i}
                  ppi={ppi}
                  borderPx={pxPerCm ? settings.borderPt * PT_TO_CM * pxPerCm : 0}
                  borderColor={settings.borderColor}
                  ptPx={pxPerCm ? PT_TO_CM * pxPerCm : 0}
                  bgBehind={!!spread.bgImageId}
                  frameRot={spread.slotRects?.[i]?.rotDeg ?? 0}
                  transform={spread.transforms[i] ?? DEFAULT_T}
                  onSelect={(pt, alt) => {
                    if (shiftRef.current) {
                      // ⌘/Shift-click thường: toggle phần tử trên cùng (ổn định).
                      // GIỮ THÊM ⌥(Alt): khoan xuống lớp bị che (Photoshop).
                      const st = useAlbum.getState();
                      if (pt && alt) {
                        // selection hiệu dụng = nhóm HOẶC phần tử đang chọn đơn
                        // (toggleMultiSel sẽ seed nó vào nhóm) — nếu không tính,
                        // ⌘-click ảnh đang chọn chỉ toggle chính nó mãi mãi
                        const effSel =
                          st.multiSel.length > 0
                            ? st.multiSel
                            : [
                                st.selectedSlot !== null ? `s${st.selectedSlot}` : "",
                                st.selectedText
                                  ? st.selectedText.kind === "tpl"
                                    ? `t${st.selectedText.index}`
                                    : `a${st.selectedText.id}`
                                  : "",
                                st.selectedTypo ? `y${st.selectedTypo}` : "",
                              ].filter(Boolean);
                        const stack = orderKeys(
                          spread.zOrder,
                          zKeysOf(spread, effSlots.length, tpl.texts.length)
                        )
                          .reverse() // trên cùng trước
                          .filter((k) => {
                            const r = keyRect(k);
                            return (
                              !!r && pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h
                            );
                          })
                          // chỉ khoan vào khung CÓ ảnh (khung trống bỏ qua)
                          .filter((k) => k[0] !== "s" || !!spread.imageIds[parseInt(k.slice(1), 10)]);
                        const fresh = stack.find((k) => !effSel.includes(k));
                        // hết lớp mới dưới con trỏ → giữ nguyên nhóm (không toggle
                        // ngược làm vỡ nhóm)
                        if (fresh) st.toggleMultiSel(fresh);
                      } else {
                        st.toggleMultiSel(`s${i}`);
                      }
                      return;
                    }
                    if (swapSource !== null && swapSource !== i) swapImages(swapSource, i);
                    else selectSlot(i);
                  }}
                  onEnterCrop={() => setCropSlot(cropSlot === i ? null : i)}
                  onBeginMove={(cx, cy) => {
                    // layout mode owns the drag gesture (frames, not photos)
                    if (useAlbum.getState().spreadSelected) return;
                    movePending.current = { from: i, sx: cx, sy: cy };
                  }}
                  onTransform={(t) => setSlotTransform(i, t)}
                  onContext={(cx, cy) => setMenu({ kind: "slot", slot: i, x: cx, y: cy })}
                />
              );
              }

              // ---- template text `t<i>`: rasterized by default, click → editable
              if (zk[0] === "t") {
              const i = parseInt(zk.slice(1), 10);
              const tx = tpl.texts[i];
              if (!tx) return null;
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
                  alwaysVector={tpl.bgHasText === false}
                  onEnter={() =>
                    shiftRef.current
                      ? useAlbum.getState().toggleMultiSel(`t${i}`)
                      : selectText({ kind: "tpl", index: i })
                  }
                  onSelect={() =>
                    shiftRef.current
                      ? useAlbum.getState().toggleMultiSel(`t${i}`)
                      : selectText({ kind: "tpl", index: i })
                  }
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
              }

              // ---- user-added text `a<id>`
              if (zk[0] === "a") {
              const a = spread.addedTexts.find((x) => x.id === zk.slice(1));
              if (!a) return null;
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
                  onSelect={() =>
                    shiftRef.current
                      ? useAlbum.getState().toggleMultiSel(`a${a.id}`)
                      : selectText({ kind: "added", id: a.id })
                  }
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
              }

              // ---- placed typo `y<id>`
              const pt = (spread.typos ?? []).find((x) => x.id === zk.slice(1));
              if (!pt) return null;
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
                  onSelect={() =>
                    shiftRef.current
                      ? useAlbum.getState().toggleMultiSel(`y${pt.id}`)
                      : selectTypo(pt.id)
                  }
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

            {/* 8-handle frame editor on the selected slot (hidden in crop mode) */}
            {spreadSelected && selectedSlot !== null && cropSlot !== selectedSlot && effSlots[selectedSlot] && (
              <SlotFrame
                px={rawPx(effSlots[selectedSlot])}
                rotDeg={spread.slotRects?.[selectedSlot]?.rotDeg ?? 0}
                onLiveSnap={(r) => liveSnapRect(r, selectedSlot)}
                onGuides={setLiveGuides}
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
                {pagesEff === 2 && (
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

        {/* marquee rectangle while rubber-band selecting */}
        {marquee && (
          <div
            className="marquee-box"
            style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }}
          />
        )}

        {/* multi-select group: union box — drag it to move every member */}
        {multiSel.length >= 2 &&
          (() => {
            const rects = multiSel.map(keyRect).filter((r): r is Px => !!r);
            if (rects.length < 2) return null;
            const x1 = Math.min(...rects.map((r) => r.x));
            const y1 = Math.min(...rects.map((r) => r.y));
            const x2 = Math.max(...rects.map((r) => r.x + r.w));
            const y2 = Math.max(...rects.map((r) => r.y + r.h));
            const shift = groupDrag
              ? `translate(${groupDrag.dx}px, ${groupDrag.dy}px)`
              : undefined;
            const startDrag = (e: React.MouseEvent) => {
              e.preventDefault();
              e.stopPropagation();
              const sx = e.clientX;
              const sy = e.clientY;
              const mm = (ev: MouseEvent) =>
                setGroupDrag({ dx: ev.clientX - sx, dy: ev.clientY - sy });
              const mu = (ev: MouseEvent) => {
                window.removeEventListener("mousemove", mm);
                window.removeEventListener("mouseup", mu);
                const dx = ev.clientX - sx;
                const dy = ev.clientY - sy;
                setGroupDrag(null);
                if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
                  useAlbum.getState().moveGroup({
                    slot: { dx: dx / innerW, dy: dy / innerH },
                    stage: { dx: dx / stageW, dy: dy / stageH },
                  });
                }
              };
              window.addEventListener("mousemove", mm);
              window.addEventListener("mouseup", mu);
            };
            // Moving things is a LAYOUT-mode job; outside it the group is for
            // basic edits only (tone…), so the box is display-only there.
            const canMove = spreadSelected;
            return (
              <>
                {rects.map((r, i) => (
                  <div
                    key={`gm${i}`}
                    className="group-member"
                    style={{ left: r.x, top: r.y, width: r.w, height: r.h, transform: shift }}
                  />
                ))}
                <div
                  className={"group-box" + (canMove ? "" : " static")}
                  style={{
                    left: x1 - 8, top: y1 - 8, width: x2 - x1 + 16, height: y2 - y1 + 16, transform: shift,
                    // giữ ⌘/Ctrl/Shift → khung nhường chuột cho canvas bên dưới
                    // (không thì không thể gom thêm phần tử NẰM TRONG khung)
                    pointerEvents: modHeld ? "none" : undefined,
                  }}
                  title={
                    canMove
                      ? "Kéo để di chuyển cả nhóm · Shift-click để thêm/bớt phần tử"
                      : "Chỉnh nhóm ở panel phải · muốn DI CHUYỂN thì vào chế độ sửa layout (click nền spread)"
                  }
                  onMouseDown={canMove ? startDrag : undefined}
                >
                  <span className="group-count">
                    {multiSel.length} đã chọn{canMove ? " — kéo để di chuyển" : ""}
                  </span>
                </div>
              </>
            );
          })()}

        {/* smart guides: accent lines while a frame snaps into alignment */}
        {liveGuides &&
          liveGuides.v.map((gd) => (
            <div
              key={`sgv${gd.p}`}
              style={{
                position: "absolute", left: gd.p - (gd.g ? 1 : 0.5), top: 0, bottom: 0,
                width: gd.g ? 2 : 1,
                background: gd.g ? "#f5b301" : "var(--accent)",
                zIndex: 28, pointerEvents: "none",
                boxShadow: gd.g ? "0 0 6px #f5b301" : "0 0 4px var(--accent)",
              }}
            />
          ))}
        {liveGuides &&
          liveGuides.h.map((gd) => (
            <div
              key={`sgh${gd.p}`}
              style={{
                position: "absolute", top: gd.p - (gd.g ? 1 : 0.5), left: 0, right: 0,
                height: gd.g ? 2 : 1,
                background: gd.g ? "#f5b301" : "var(--accent)",
                zIndex: 28, pointerEvents: "none",
                boxShadow: gd.g ? "0 0 6px #f5b301" : "0 0 4px var(--accent)",
              }}
            />
          ))}

        {/* align anchor (G): the reference frame others align to */}
        {alignAnchor !== null && effSlots[alignAnchor] && (
          <div
            className="anchor-badge"
            style={{
              left: rawPx(effSlots[alignAnchor]).x + 6,
              top: rawPx(effSlots[alignAnchor]).y + 6,
            }}
            title="Khung mốc — các khung khác căn theo khung này (G để bỏ)"
          >
            ⚓ Mốc
          </div>
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

      {/* §7.4 rulers + guides — rulers hug the CANVAS edges (outside the spread) */}
      {spreadSelected && showRuler && (
        <GuideLayer
          stageW={stageW}
          stageH={stageH}
          pxPerCm={pxPerCm}
          guides={guides}
          onChange={setGuides}
          offsetX={stageOff.x}
          offsetY={stageOff.y}
        />
      )}

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

      {zoomMenu && (
        <div
          className="ctx-menu"
          style={{ left: zoomMenu.x, top: zoomMenu.y }}
          onClick={(e) => { e.stopPropagation(); menuClosedAt.current = Date.now(); }}
        >
          <button onClick={() => { useAlbum.getState().setViewZoom(1); setZoomMenu(null); }}>
            Zoom to Fit <span className="menu-kbd">{IS_MAC ? "⌘0" : "Ctrl+0"}</span>
          </button>
          <button onClick={() => { useAlbum.getState().setViewZoom(zoom100); setZoomMenu(null); }}>
            Zoom to 100% <span className="menu-kbd">{IS_MAC ? "⌘1" : "Ctrl+1"}</span>
          </button>
          <button onClick={() => { const st = useAlbum.getState(); st.setViewZoom(Math.min(4, st.viewZoom * 1.25)); setZoomMenu(null); }}>
            Zoom In <span className="menu-kbd">{IS_MAC ? "⌘+" : "Ctrl++"}</span>
          </button>
          <button onClick={() => { const st = useAlbum.getState(); st.setViewZoom(Math.max(1, st.viewZoom / 1.25)); setZoomMenu(null); }}>
            Zoom Out <span className="menu-kbd">{IS_MAC ? "⌘−" : "Ctrl+-"}</span>
          </button>
        </div>
      )}
      {menu?.kind === "slot" && (
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => { e.stopPropagation(); menuClosedAt.current = Date.now(); }}>
          <button onClick={() => { useAlbum.getState().setAsBackground(menu.slot); setMenu(null); }}>
            Đặt làm nền (full-bleed)
          </button>
          <div className="ctx-sep" />
          <button onClick={() => { useAlbum.getState().rotateSlot(menu.slot); setMenu(null); }}>Xoay 90°</button>
          <button onClick={() => { useAlbum.getState().flipSlot(menu.slot, "h"); setMenu(null); }}>Lật ngang</button>
          <button onClick={() => { useAlbum.getState().flipSlot(menu.slot, "v"); setMenu(null); }}>Lật dọc</button>
          <div className="ctx-sep" />
          {/* Arrange (SmartAlbums): paint order for overlapping frames */}
          <button onClick={() => { useAlbum.getState().arrangeZ(`s${menu.slot}`, "front"); setMenu(null); }}>
            ⬆ Lên trên cùng
          </button>
          <button onClick={() => { useAlbum.getState().arrangeZ(`s${menu.slot}`, "forward"); setMenu(null); }}>
            ↑ Lên một lớp
          </button>
          <button onClick={() => { useAlbum.getState().arrangeZ(`s${menu.slot}`, "backward"); setMenu(null); }}>
            ↓ Xuống một lớp
          </button>
          <button onClick={() => { useAlbum.getState().arrangeZ(`s${menu.slot}`, "back"); setMenu(null); }}>
            ⬇ Xuống dưới cùng
          </button>
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
        <div className="ctx-menu" style={{ left: menu.x, top: menu.y }} onClick={(e) => { e.stopPropagation(); menuClosedAt.current = Date.now(); }}>
          <button onClick={() => { useAlbum.getState().redesignSpread(); setMenu(null); }}>
            Redesign spread ({mod("⇧D")})
          </button>
          <button onClick={() => { useAlbum.getState().changeSlotCount(1); setMenu(null); }}>+ Thêm 1 ô ảnh</button>
          <button onClick={() => { useAlbum.getState().changeSlotCount(-1); setMenu(null); }}>− Bớt 1 ô ảnh</button>
          {spread.bgImageId && (
            <>
              <button onClick={() => { useAlbum.getState().backgroundToSlot(); setMenu(null); }}>
                ⤡ Thu ảnh nền về khung
              </button>
              <button onClick={() => { useAlbum.getState().removeBackground(); setMenu(null); }}>
                Gỡ ảnh nền
              </button>
            </>
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
