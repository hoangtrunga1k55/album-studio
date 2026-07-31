/** F4 — Layers panel (Photoshop-style). One list of EVERY object on the current
 *  spread (photos, texts, typos, elements) top→bottom, mirroring the unified
 *  paint order. Click a row to select it, drag to reorder, toggle the eye to
 *  hide/show (hidden = not painted and not exported). */

import { useState } from "react";
import {
  useAlbum,
  orderKeys,
  zKeysOf,
  type Spread,
} from "../store/album";
import { getTemplate } from "../engine/templates";
import { getTypo } from "../engine/typos";
import { getElement } from "../engine/elements";
import type { ImageMeta } from "../ipc/import";
import "./LayersPanel.css";

type LayerType = "photo" | "text" | "typo" | "element";

interface Layer {
  key: string;
  type: LayerType;
  label: string;
  thumb?: string;
  selected: boolean;
  hidden: boolean;
}

const GLYPH: Record<LayerType, string> = {
  photo: "▦",
  text: "T",
  typo: "✎",
  element: "✦",
};

const firstLine = (s: string) =>
  (s.replace(/\r/g, "\n").split("\n")[0] || "").trim();

/** Extra slots beyond the template count (added frames live only in slotRects). */
function extraSlotCount(spread: Spread, tplSlots: number): number {
  return Object.keys(spread.slotRects ?? {})
    .map(Number)
    .filter((k) => k >= tplSlots).length;
}

/** Build the display list (top→bottom) for the current spread. */
function buildLayers(
  spread: Spread,
  images: ImageMeta[],
  sel: {
    slot: number | null;
    text: { kind: "tpl"; index: number } | { kind: "added"; id: string } | null;
    typo: string | null;
    element: string | null;
  }
): Layer[] {
  const tpl = getTemplate(spread.templateId);
  const tplSlots = tpl?.slotCount ?? 0;
  const slotCount = tplSlots + extraSlotCount(spread, tplSlots);
  const hidden = new Set(spread.hidden ?? []);
  // orderKeys is bottom→top; the panel shows top layers first.
  const keys = orderKeys(spread.zOrder, zKeysOf(spread, slotCount, tpl?.texts.length ?? 0)).reverse();

  const out: Layer[] = [];
  for (const key of keys) {
    const base = { key, hidden: hidden.has(key) };
    if (key[0] === "s") {
      const i = parseInt(key.slice(1), 10);
      const img = images.find((im) => im.id === spread.imageIds[i]);
      out.push({
        ...base,
        type: "photo",
        label: img ? img.name : `Empty frame ${i + 1}`,
        thumb: img?.thumb,
        selected: sel.slot === i,
      });
    } else if (key[0] === "t") {
      const i = parseInt(key.slice(1), 10);
      if (spread.textEdits[i]?.deleted) continue; // removed template text
      const content = spread.textEdits[i]?.content ?? tpl?.texts[i]?.content ?? "";
      out.push({
        ...base,
        type: "text",
        label: firstLine(content) || `Text ${i + 1}`,
        selected: sel.text?.kind === "tpl" && sel.text.index === i,
      });
    } else if (key[0] === "a") {
      const a = spread.addedTexts.find((x) => `a${x.id}` === key);
      if (!a) continue;
      out.push({
        ...base,
        type: "text",
        label: firstLine(a.content) || "Added text",
        selected: sel.text?.kind === "added" && sel.text.id === a.id,
      });
    } else if (key[0] === "y") {
      const t = (spread.typos ?? []).find((x) => `y${x.id}` === key);
      if (!t) continue;
      const typo = getTypo(t.typoId);
      out.push({
        ...base,
        type: "typo",
        label: `Typo${typo?.category ? ` · ${typo.category}` : ""}`,
        thumb: typo?.preview,
        selected: sel.typo === t.id,
      });
    } else if (key[0] === "e") {
      const el = (spread.elements ?? []).find((x) => `e${x.id}` === key);
      if (!el) continue;
      const meta = getElement(el.elementId);
      out.push({
        ...base,
        type: "element",
        label: meta?.name || "Element",
        thumb: meta?.src,
        selected: sel.element === el.id,
      });
    }
  }
  return out;
}

/** Route a row click to the matching single-select action. */
function selectLayer(key: string) {
  const st = useAlbum.getState();
  if (key[0] === "s") st.selectSlot(parseInt(key.slice(1), 10));
  else if (key[0] === "t") st.selectText({ kind: "tpl", index: parseInt(key.slice(1), 10) });
  else if (key[0] === "a") st.selectText({ kind: "added", id: key.slice(1) });
  else if (key[0] === "y") st.selectTypo(key.slice(1));
  else if (key[0] === "e") st.selectElement(key.slice(1));
}

export function LayersPanel() {
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const images = useAlbum((s) => s.images);
  const selectedSlot = useAlbum((s) => s.selectedSlot);
  const selectedText = useAlbum((s) => s.selectedText);
  const selectedTypo = useAlbum((s) => s.selectedTypo);
  const selectedElement = useAlbum((s) => s.selectedElement);
  const toggleLayerHidden = useAlbum((s) => s.toggleLayerHidden);
  const setZOrder = useAlbum((s) => s.setZOrder);
  const [dragKey, setDragKey] = useState<string | null>(null);

  const spread = spreads[currentIndex];
  if (!spread) return <div className="prop-empty">No spread.</div>;

  const layers = buildLayers(spread, images, {
    slot: selectedSlot,
    text: selectedText,
    typo: selectedTypo,
    element: selectedElement,
  });

  /** Drop `dragKey` at `targetKey`'s position, then persist bottom→top. */
  const dropOn = (targetKey: string) => {
    if (!dragKey || dragKey === targetKey) return;
    const top = layers.map((l) => l.key).filter((k) => k !== dragKey);
    const at = top.indexOf(targetKey);
    top.splice(at < 0 ? top.length : at, 0, dragKey);
    setZOrder([...top].reverse()); // panel is top→bottom; store wants bottom→top
    setDragKey(null);
  };

  return (
    <div className="layers">
      <div className="prop-label layers-head">Layers · {layers.length}</div>
      {layers.length === 0 ? (
        <div className="prop-empty">Nothing on this spread yet.</div>
      ) : (
        <ul className="layers-list">
          {layers.map((l) => (
            <li
              key={l.key}
              className={
                "layer-row" +
                (l.selected ? " selected" : "") +
                (l.hidden ? " hidden" : "") +
                (dragKey === l.key ? " dragging" : "")
              }
              draggable
              onDragStart={() => setDragKey(l.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(l.key)}
              onClick={() => selectLayer(l.key)}
              title={l.label}
            >
              <button
                className="layer-eye"
                title={l.hidden ? "Show layer" : "Hide layer"}
                onClick={(e) => {
                  e.stopPropagation();
                  toggleLayerHidden(l.key);
                }}
              >
                {l.hidden ? "🚫" : "👁"}
              </button>
              <span className={"layer-thumb type-" + l.type}>
                {l.thumb ? (
                  <img src={l.thumb} alt="" draggable={false} />
                ) : (
                  <span className="layer-glyph">{GLYPH[l.type]}</span>
                )}
              </span>
              <span className="layer-label">{l.label}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="hint-sm">Drag to reorder · 👁 to hide · click to select.</div>
    </div>
  );
}