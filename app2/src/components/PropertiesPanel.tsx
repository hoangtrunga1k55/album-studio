import { useState } from "react";
import { getTemplate, spreadCmFor } from "../engine/templates";
import { getTypo } from "../engine/typos";
import { PhotoNavigator } from "./PhotoNavigator";
import { spreadLabel, useAlbum, type ArrangeOp } from "../store/album";
import { FontPicker } from "./FontPicker";
import { AlbumConfig } from "./AlbumConfig";
import { BackgroundSection } from "./BackgroundSection";
import { LayersPanel } from "./LayersPanel";
import { IconTrash } from "../icons";

type PanelTab = "layout" | "photo" | "typo" | "element" | "layers";

/** The tabs at the top of the right panel — Layout / Photo / Typo / Element / Layers. */
function PanelTabs({ active, onPick }: { active: PanelTab; onPick: (t: PanelTab) => void }) {
  const items: { id: PanelTab; label: string }[] = [
    { id: "layout", label: "Layout" },
    { id: "photo", label: "Photo" },
    { id: "layers", label: "Layers" },
  ];
  return (
    <div className="pp-tabs">
      {items.map((t) => (
        <button
          key={t.id}
          className={"pp-tab" + (active === t.id ? " active" : "")}
          onClick={() => onPick(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Arrange (SmartAlbums): Bring to Front / Forward / Backward / Send to Back. */
function ArrangeButtons({ label, onOp }: { label?: string; onOp: (op: ArrangeOp) => void }) {
  return (
    <div className="prop-group">
      <div className="prop-label">{label ?? "Arrange (when overlapping)"}</div>
      <div className="prop-row">
        <button className="btn" title="Bring to front" onClick={() => onOp("front")}>⬆</button>
        <button className="btn" title="Bring forward" onClick={() => onOp("forward")}>↑</button>
        <button className="btn" title="Send backward" onClick={() => onOp("backward")}>↓</button>
        <button className="btn" title="Send to back" onClick={() => onOp("back")}>⬇</button>
      </div>
    </div>
  );
}

/** Arrange row for photo frames (`s<i>` in the unified z-order). */
function ArrangeRow({ slot }: { slot: number }) {
  const arrange = useAlbum((s) => s.arrangeZ);
  return <ArrangeButtons label="Arrange (overlapping photos/text/typo)" onOp={(op) => arrange(`s${slot}`, op)} />;
}

/** Arrange row for texts and typos (same unified z-order as photos). */
function ArrangeDecorRow({ decorKey }: { decorKey: string }) {
  const arrange = useAlbum((s) => s.arrangeZ);
  return <ArrangeButtons label="Arrange (overlapping photos/text/typo)" onOp={(op) => arrange(decorKey, op)} />;
}

/** SmartAlbums align tools: to the page, and to the anchor frame (G). */
function AlignRows({ slot }: { slot: number }) {
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const alignAnchor = useAlbum((s) => s.alignAnchor);
  const setAlignAnchor = useAlbum((s) => s.setAlignAnchor);
  const setSlotRect = useAlbum((s) => s.setSlotRect);
  const alignGroup = useAlbum((s) => s.alignGroup);

  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);
  const rectOf = (i: number) =>
    tpl && i < tpl.slots.length
      ? { ...tpl.slots[i], ...(spread?.slotRects?.[i] ?? {}) }
      : spread?.slotRects?.[i];

  const me = rectOf(slot);
  if (!me) return null;
  const put = (x: number, y: number) => setSlotRect(slot, { ...me, x, y });

  const anchor = alignAnchor !== null && alignAnchor !== slot ? rectOf(alignAnchor) : null;

  return (
    <>
      <div className="prop-group">
        <div className="prop-label">Align to page</div>
        <div className="prop-row">
          <button className="btn" title="Left edge of page" onClick={() => alignGroup("left")}>⇤</button>
          <button className="btn" title="Horizontal center of page" onClick={() => alignGroup("hcenter")}>↔</button>
          <button className="btn" title="Right edge of page" onClick={() => alignGroup("right")}>⇥</button>
          <button className="btn" title="Top edge of page" onClick={() => alignGroup("top")}>⤒</button>
          <button className="btn" title="Vertical center of page" onClick={() => alignGroup("vmiddle")}>↕</button>
          <button className="btn" title="Bottom edge of page" onClick={() => alignGroup("bottom")}>⤓</button>
        </div>
      </div>
      <div className="prop-group">
        <div className="prop-label">Align to anchor frame ⚓</div>
        {alignAnchor === null || alignAnchor === slot ? (
          <>
            <button
              className={"btn" + (alignAnchor === slot ? " primary" : "")}
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => setAlignAnchor(alignAnchor === slot ? null : slot)}
            >
              {alignAnchor === slot ? "⚓ Is anchor — click to clear (G)" : "⚓ Set this frame as anchor (G)"}
            </button>
            {alignAnchor === null && (
              <div className="hint-sm">Set anchor → pick another frame → align center/top/bottom to it.</div>
            )}
          </>
        ) : anchor ? (
          <>
            {/* single-axis translate only — the other coordinate stays put */}
            <div className="prop-row">
              <button
                className="btn"
                title="Align LEFT edge to anchor (keep vertical)"
                onClick={() => put(anchor.x, me.y)}
              >
                ⇤ Left
              </button>
              <button
                className="btn"
                title="Align HORIZONTAL center to anchor (keep vertical)"
                onClick={() => put(anchor.x + (anchor.w - me.w) / 2, me.y)}
              >
                ↔ Center
              </button>
              <button
                className="btn"
                title="Align RIGHT edge to anchor (keep vertical)"
                onClick={() => put(anchor.x + anchor.w - me.w, me.y)}
              >
                ⇥ Right
              </button>
            </div>
            <div className="prop-row" style={{ marginTop: 6 }}>
              <button
                className="btn"
                title="Align TOP edge to anchor (keep horizontal)"
                onClick={() => put(me.x, anchor.y)}
              >
                ⤒ Top
              </button>
              <button
                className="btn"
                title="Align VERTICAL center to anchor (keep horizontal)"
                onClick={() => put(me.x, anchor.y + (anchor.h - me.h) / 2)}
              >
                ↕ Center
              </button>
              <button
                className="btn"
                title="Align BOTTOM edge to anchor (keep horizontal)"
                onClick={() => put(me.x, anchor.y + anchor.h - me.h)}
              >
                ⤓ Bottom
              </button>
            </div>
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
              title="Clear anchor frame"
              onClick={() => setAlignAnchor(null)}
            >
              ✕ Clear anchor
            </button>
          </>
        ) : null}
      </div>
    </>
  );
}

/** Photo-editing sections for a slot — shared by the normal-mode photo panel
 *  and the layout-mode frame panel (the frame panel appends them below). */
function PhotoEditSections({
  slot,
  header = false,
  withArrange = false,
}: {
  slot: number;
  header?: boolean;
  withArrange?: boolean;
}) {
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const images = useAlbum((s) => s.images);
  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);
  const imgId = spread?.imageIds[slot];
  const img = imgId ? images.find((im) => im.id === imgId) : undefined;
  const st = useAlbum.getState();
  const albumSettings = useAlbum((s) => s.settings);
  if (!img || !spread) return null;
  {
      const t = spread.transforms[slot] ?? { zoom: 1, panX: 0, panY: 0 };
      // Frame geometry in real units — drives the navigator ratio + info block.
      const size = st.size;
      const cmAll = tpl ? spreadCmFor(tpl, size) : null;
      const effRect =
        tpl && slot < tpl.slots.length
          ? { ...tpl.slots[slot], ...(spread?.slotRects?.[slot] ?? {}) }
          : spread?.slotRects?.[slot];
      const frameWcm = effRect && cmAll ? effRect.w * cmAll.w : null;
      const frameHcm = effRect && cmAll ? effRect.h * cmAll.h : null;
      const frameRatio = frameWcm && frameHcm ? frameWcm / frameHcm : 1;
      const setT = (next: typeof t) => st.setSlotTransform(slot, next);
      // Free rotation (SmartAlbums "Angle") — lives on the frame rect.
      const angle = spread?.slotRects?.[slot]?.rotDeg ?? 0;
      const setAngle = (deg: number) =>
        st.setSlotRect(slot, {
          ...(effRect ?? { x: 0, y: 0, w: 1, h: 1 }),
          rotDeg: Math.round(deg),
        });
      // Effective PPI: photo pixels that end up in one printed inch (§10.3).
      let ppi: number | null = null;
      if (frameWcm && frameHcm) {
        const rot = t.rot ?? 0;
        const swapped = rot === 90 || rot === 270;
        const iw = swapped ? img.height : img.width;
        const ih = swapped ? img.width : img.height;
        const fitScale =
          t.fit === "contain"
            ? Math.min(frameWcm / iw, frameHcm / ih)
            : Math.max(frameWcm / iw, frameHcm / ih);
        ppi = Math.round(2.54 / (fitScale * (t.zoom ?? 1))); // image px per inch
      }
      const usedCount = spreads.reduce(
        (n, sp) => n + sp.imageIds.filter((x) => x === img.id).length,
        0
      );
      const zoomPct = Math.round((t.zoom ?? 1) * 100);
      return (
        <>
          {header ? (
            <h3 className="props-title" title={img.name}>
              {img.name}
              {ppi !== null && ppi < 200 && (
                <span className="ppi-warn" title={`Print will be blurry — ${ppi} PPI (should be ≥ 200)`}>⚠</span>
              )}
            </h3>
          ) : (
            <div className="prop-label" style={{ marginTop: 14 }}>Photo in frame</div>
          )}

          <div className="prop-label">Design</div>
          {/* live preview — the frame stays fixed, the photo scales behind it */}
          <PhotoNavigator
            img={img}
            frameRatio={frameRatio}
            t={t}
            trimFrac={
              frameWcm && frameHcm
                ? {
                    x: st.settings.trimMm / 10 / frameWcm,
                    y: st.settings.trimMm / 10 / frameHcm,
                  }
                : undefined
            }
            onChange={setT}
          />

          <div className="sa-rows">
            <div className="sa-row">
              <span className="sa-name">Scale:</span>
              <input
                type="range"
                min={100}
                max={600}
                step={1}
                value={zoomPct}
                onChange={(e) => setT({ ...t, zoom: parseInt(e.target.value, 10) / 100 })}
              />
              <span className="sa-val">{zoomPct}%</span>
              <button
                className="sa-reset"
                title="Reset to 100%"
                disabled={zoomPct === 100}
                onClick={() => setT({ ...t, zoom: 1, panX: 0, panY: 0 })}
              >
                ×
              </button>
            </div>
            <div className="sa-row">
              <span className="sa-name">Rotation:</span>
              <input
                type="range"
                min={-180}
                max={180}
                step={1}
                value={angle}
                onChange={(e) => setAngle(parseInt(e.target.value, 10))}
              />
              <span className="sa-val">{Math.round(angle)}°</span>
              <button
                className="sa-reset"
                title="Reset to 0°"
                disabled={angle === 0}
                onClick={() => setAngle(0)}
              >
                ×
              </button>
            </div>
          </div>

          <div className="prop-label" style={{ marginTop: 12 }}>Border · Radius · Opacity</div>
          <div className="sa-rows">
            <div className="sa-row">
              <span className="sa-name">Border:</span>
              <input
                type="range"
                min={0}
                max={30}
                step={0.5}
                value={t.borderPt ?? albumSettings.borderPt}
                onChange={(e) => setT({ ...t, borderPt: parseFloat(e.target.value) })}
              />
              <span className="sa-val">{t.borderPt ?? albumSettings.borderPt}pt</span>
              <input
                type="color"
                value={t.borderColor ?? albumSettings.borderColor}
                onChange={(e) => setT({ ...t, borderColor: e.target.value })}
                title="Border color"
                style={{ width: 26, height: 20, padding: 0, border: "none", background: "none", cursor: "pointer" }}
              />
              <button
                className="sa-reset"
                title="Use album settings"
                disabled={t.borderPt == null && t.borderColor == null}
                onClick={() => setT({ ...t, borderPt: undefined, borderColor: undefined })}
              >
                ×
              </button>
            </div>
            <div className="sa-row">
              <span className="sa-name">Radius:</span>
              <input
                type="range"
                min={0}
                max={80}
                step={1}
                value={t.radiusPt ?? 0}
                onChange={(e) => setT({ ...t, radiusPt: parseInt(e.target.value, 10) })}
              />
              <span className="sa-val">{t.radiusPt ?? 0}pt</span>
              <button
                className="sa-reset"
                title="Square corners"
                disabled={!t.radiusPt}
                onClick={() => setT({ ...t, radiusPt: undefined })}
              >
                ×
              </button>
            </div>
            <div className="sa-row">
              <span className="sa-name">Opacity:</span>
              <input
                type="range"
                min={5}
                max={100}
                step={1}
                value={Math.round((t.opacity ?? 1) * 100)}
                onChange={(e) => setT({ ...t, opacity: parseInt(e.target.value, 10) / 100 })}
              />
              <span className="sa-val">{Math.round((t.opacity ?? 1) * 100)}%</span>
              <button
                className="sa-reset"
                title="100%"
                disabled={(t.opacity ?? 1) === 1}
                onClick={() => setT({ ...t, opacity: undefined })}
              >
                ×
              </button>
            </div>
          </div>

          <div className="prop-group" style={{ marginTop: 12 }}>
            <div className="prop-row">
              <button className="btn" onClick={() => st.rotateSlot(slot)} title="Rotate photo 90° in frame">
                ⟳ 90°
              </button>
              <button className="btn" onClick={() => st.flipSlot(slot, "h")} title="Flip horizontal">
                ⇋
              </button>
              <button className="btn" onClick={() => st.flipSlot(slot, "v")} title="Flip vertical">
                ⇵
              </button>
              <button
                className="btn"
                onClick={() =>
                  st.setSlotFit(slot, (t.fit ?? "cover") === "cover" ? "contain" : "cover")
                }
                title="Fill frame / fit whole photo"
              >
                {(t.fit ?? "cover") === "cover" ? "Fit" : "Fill"}
              </button>
            </div>
          </div>

          {withArrange && <ArrangeRow slot={slot} />}

          <div className="prop-label" style={{ marginTop: 14 }}>Photo info</div>
          <div className="sa-info">
            {frameWcm && frameHcm && (
              <div><span>Khung R×C</span><b>{frameWcm.toFixed(1)} × {frameHcm.toFixed(1)} cm</b></div>
            )}
            {ppi !== null && (
              <div>
                <span>Effective PPI</span>
                <b style={ppi < 200 ? { color: "#f59e0b" } : undefined}>{ppi}</b>
              </div>
            )}
            <div><span>Original size</span><b>{img.width} × {img.height} px</b></div>
            <div><span>Used</span><b>{usedCount}×</b></div>
          </div>

          <button
            className="btn"
            style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
            onClick={() => st.beginSwap(slot)}
            title="Key S — then click the target frame to swap two photos (or drag a photo onto another frame)"
          >
            ⇄ Swap photo… (S)
          </button>
          <button className="danger" onClick={() => st.clearSlot(slot)} style={{ marginTop: 10 }}>
            <IconTrash width={15} height={15} /> Remove photo from frame
          </button>
        </>
      );

  }
}

export function PropertiesPanel() {
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const images = useAlbum((s) => s.images);
  const selectedSlot = useAlbum((s) => s.selectedSlot);
  const selectedText = useAlbum((s) => s.selectedText);
  const selectedTypo = useAlbum((s) => s.selectedTypo);
  const selectedElement = useAlbum((s) => s.selectedElement);
  const spreadSelected = useAlbum((s) => s.spreadSelected);
  const updateTypo = useAlbum((s) => s.updateTypo);
  const removeTypo = useAlbum((s) => s.removeTypo);
  const updateElement = useAlbum((s) => s.updateElement);
  const removeElement = useAlbum((s) => s.removeElement);
  const settings = useAlbum((s) => s.settings);
  const setMargin = useAlbum((s) => s.setMargin);
  const editTplText = useAlbum((s) => s.editTplText);
  const deleteTplText = useAlbum((s) => s.deleteTplText);
  const resetTplText = useAlbum((s) => s.resetTplText);
  const updateAddedText = useAlbum((s) => s.updateAddedText);
  const removeAddedText = useAlbum((s) => s.removeAddedText);

  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);

  // ---------- 3-tab shell (Layout / Ảnh / Typo) ----------
  const multiSel = useAlbum((s) => s.multiSel);
  const clearSelection = useAlbum((s) => s.clearSelection);
  // panel-level view when nothing on the canvas is selected
  const [bgTab, setBgTab] = useState<PanelTab>("layout");
  // which tab lights up follows the current selection; else the panel view
  // Layers is a sticky view: it stays put and just highlights the selection,
  // so selecting a row (or a canvas object) doesn't yank you to its editor tab.
  const activeTab: PanelTab = bgTab === "layers"
    ? "layers"
    : selectedElement
      ? "element"
      : selectedTypo
        ? "typo"
        : multiSel.length >= 2 || selectedSlot !== null
          ? "photo"
          : selectedText
            ? "layout"
            : bgTab;
  const pickTab = (t: PanelTab) => {
    if (t === activeTab) return;
    setBgTab(t);
    // Non-layers tabs are panel-level views — drop any canvas selection to
    // reveal them. Layers keeps the selection so the row stays highlighted.
    if (t !== "layers") clearSelection();
  };
  const tabs = <PanelTabs active={activeTab} onPick={pickTab} />;

  // Layers view wins over the per-object early returns below (it must show the
  // whole list even while an object is selected).
  if (bgTab === "layers") {
    return (
      <aside className="props">
        {tabs}
        <LayersPanel />
      </aside>
    );
  }

  // ---------- GROUP selected (Shift-click nhiều phần tử) ----------
  if (multiSel.length >= 2) {
    const st = useAlbum.getState();
    const photoIdx = multiSel
      .filter((k) => k[0] === "s")
      .map((k) => parseInt(k.slice(1), 10))
      .filter((i) => !!spread?.imageIds[i]);
    const counts = {
      s: multiSel.filter((k) => k[0] === "s").length,
      t: multiSel.filter((k) => k[0] === "t" || k[0] === "a").length,
      y: multiSel.filter((k) => k[0] === "y").length,
    };
    return (
      <aside className="props">{tabs}
        <h3>Group · {multiSel.length} items</h3>
        <div className="prop-meta">
          <div>
            {counts.s > 0 && <>Ảnh: <b>{counts.s}</b> · </>}
            {counts.t > 0 && <>Text: <b>{counts.t}</b> · </>}
            {counts.y > 0 && <>Typo: <b>{counts.y}</b></>}
          </div>
        </div>
        <div className="hint-sm" style={{ marginTop: 6 }}>
          {spreadSelected
            ? "Drag the purple box on the canvas to move the whole group. Shift-click to add/remove."
            : "Group to quickly adjust photos (fill/fit). To MOVE/ALIGN: enter layout edit mode then marquee them."}
        </div>

        {spreadSelected && (
          <>
            <div className="prop-group" style={{ marginTop: 14 }}>
              <div className="prop-label">Align (to page edges)</div>
              <div className="prop-row">
                <button className="btn" title="Left edge" onClick={() => st.alignGroup("left")}>⇤</button>
                <button className="btn" title="Horizontal center" onClick={() => st.alignGroup("hcenter")}>↔</button>
                <button className="btn" title="Right edge" onClick={() => st.alignGroup("right")}>⇥</button>
                <button className="btn" title="Top edge" onClick={() => st.alignGroup("top")}>⤒</button>
                <button className="btn" title="Vertical center" onClick={() => st.alignGroup("vmiddle")}>↕</button>
                <button className="btn" title="Bottom edge" onClick={() => st.alignGroup("bottom")}>⤓</button>
              </div>
            </div>
            <div className="prop-group">
              <div className="prop-label">Distribute evenly (needs ≥ 3 items)</div>
              <div className="prop-row">
                <button
                  className="btn"
                  title="Equal HORIZONTAL spacing between items (keep the outermost)"
                  disabled={multiSel.length < 3}
                  onClick={() => st.distributeGroup("h")}
                >
                  ⇹ Horizontal
                </button>
                <button
                  className="btn"
                  title="Equal VERTICAL spacing between items (keep the outermost)"
                  disabled={multiSel.length < 3}
                  onClick={() => st.distributeGroup("v")}
                >
                  ⇳ Vertical
                </button>
              </div>
            </div>
          </>
        )}

        {photoIdx.length > 0 && (
          <>
            <div className="prop-group" style={{ marginTop: 14 }}>
              <div className="prop-row">
                <button
                  className="btn"
                  title="Fill frames for the whole group"
                  onClick={() => st.adjustGroupPhotos({ fit: "cover", zoom: 1, panX: 0, panY: 0 })}
                >
                  Fill
                </button>
                <button
                  className="btn"
                  title="Fit the whole photo for the group"
                  onClick={() => st.adjustGroupPhotos({ fit: "contain", zoom: 1, panX: 0, panY: 0 })}
                >
                  Fit
                </button>
              </div>
            </div>
          </>
        )}

        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center", marginTop: 14 }}
          onClick={() => st.clearSelection()}
        >
          Clear group (Esc)
        </button>
      </aside>
    );
  }

  // ---------- TYPO selected ----------
  if (selectedTypo) {
    const pt = (spread?.typos ?? []).find((t) => t.id === selectedTypo);
    const typo = pt ? getTypo(pt.typoId) : undefined;
    if (pt) {
      return (
        <aside className="props">{tabs}
          <h3>Typo{typo ? ` · ${typo.texts.length} texts` : ""}</h3>
          <div className="prop-group">
            <div className="prop-label">Size ({Math.round(pt.w * 100)}%)</div>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.01}
              value={pt.w}
              onChange={(e) => updateTypo(pt.id, { w: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
          <div className="prop-group">
            <div className="prop-label">Color</div>
            <div className="prop-row">
              <button
                className={"btn" + (pt.color === null ? " primary" : "")}
                onClick={() => updateTypo(pt.id, { color: null })}
              >
                Original
              </button>
              <input
                type="color"
                className="swatch"
                value={pt.color ?? "#ffffff"}
                onChange={(e) => updateTypo(pt.id, { color: e.target.value })}
              />
            </div>
            <div className="hint-sm">“Original” = keep each text's color · pick a color = flood one color.</div>
          </div>
          <ArrangeDecorRow decorKey={`y${pt.id}`} />
          <button className="danger" onClick={() => removeTypo(pt.id)}>
            <IconTrash width={15} height={15} /> Delete typo
          </button>
        </aside>
      );
    }
  }

  // ---------- ELEMENT / STICKER selected ----------
  if (selectedElement) {
    const pe = (spread?.elements ?? []).find((e) => e.id === selectedElement);
    if (pe) {
      const opacity = pe.opacity ?? 1;
      return (
        <aside className="props">{tabs}
          <h3>Element</h3>
          <div className="prop-group">
            <div className="prop-label">Size ({Math.round(pe.w * 100)}%)</div>
            <input
              type="range"
              min={0.03}
              max={1.5}
              step={0.01}
              value={pe.w}
              onChange={(e) => updateElement(pe.id, { w: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
          <div className="prop-group">
            <div className="prop-label">Opacity ({Math.round(opacity * 100)}%)</div>
            <input
              type="range"
              min={0.05}
              max={1}
              step={0.05}
              value={opacity}
              onChange={(e) => updateElement(pe.id, { opacity: parseFloat(e.target.value) })}
              style={{ width: "100%" }}
            />
          </div>
          <ArrangeDecorRow decorKey={`e${pe.id}`} />
          <button className="danger" onClick={() => removeElement(pe.id)}>
            <IconTrash width={15} height={15} /> Delete element
          </button>
        </aside>
      );
    }
  }

  // ---------- TEXT selected ----------
  if (selectedText) {
    if (selectedText.kind === "tpl" && tpl) {
      const i = selectedText.index;
      const base = tpl.texts[i];
      const ed = spread.textEdits[i] ?? {};
      const content = ed.content ?? base?.content ?? "";
      const font = ed.font ?? base?.font ?? "";
      const color = ed.color ?? base?.color ?? "#222222";
      const sizeScale = ed.sizeScale ?? 1;
      return (
        <aside className="props">{tabs}
          <h3>Text (from layout)</h3>
          <div className="prop-group">
            <div className="prop-label">Content</div>
            <textarea className="input" rows={3} value={content}
              onChange={(e) => editTplText(i, { content: e.target.value })} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Font</div>
            <FontPicker value={font} onPick={(v) => editTplText(i, { font: v })} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Font size ×{sizeScale.toFixed(2)}</div>
            <input type="range" min={0.3} max={3} step={0.05} value={sizeScale}
              onChange={(e) => editTplText(i, { sizeScale: parseFloat(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Color</div>
            <input type="color" className="swatch" value={color}
              onChange={(e) => editTplText(i, { color: e.target.value })} />
          </div>
          <ArrangeDecorRow decorKey={`t${i}`} />
          {Object.keys(ed).length > 0 && (
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center", marginBottom: 8 }}
              onClick={() => resetTplText(i)}
            >
              ↺ Restore original text
            </button>
          )}
          <button className="danger" onClick={() => deleteTplText(i)}>
            <IconTrash width={15} height={15} /> Delete this text
          </button>
        </aside>
      );
    }
    if (selectedText.kind === "added") {
      const a = spread.addedTexts.find((t) => t.id === selectedText.id);
      if (!a) return <aside className="props" />;
      return (
        <aside className="props">{tabs}
          <h3>Added text</h3>
          <div className="prop-group">
            <div className="prop-label">Content</div>
            <textarea className="input" rows={3} value={a.content}
              onChange={(e) => updateAddedText(a.id, { content: e.target.value })} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Font</div>
            <FontPicker value={a.font} onPick={(v) => updateAddedText(a.id, { font: v })} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Font size</div>
            <input type="range" min={0.015} max={0.12} step={0.002} value={a.sizeFrac}
              onChange={(e) => updateAddedText(a.id, { sizeFrac: parseFloat(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Color</div>
            <input type="color" className="swatch" value={a.color}
              onChange={(e) => updateAddedText(a.id, { color: e.target.value })} />
          </div>
          <ArrangeDecorRow decorKey={`a${a.id}`} />
          <button className="danger" onClick={() => removeAddedText(a.id)}>
            <IconTrash width={15} height={15} /> Delete this text
          </button>
        </aside>
      );
    }
  }

  // ---------- SLOT selected ----------
  // Mode split (SmartAlbums): in LAYOUT mode a slot click = edit the FRAME
  // (position/size/arrange/align); outside it = edit the PHOTO. Photo-swap
  // dragging only exists outside layout mode.
  if (selectedSlot !== null) {
    const imgId = spread?.imageIds[selectedSlot];
    const img = imgId ? images.find((im) => im.id === imgId) : undefined;
    const st = useAlbum.getState();

    if (!spreadSelected && img) {
      return (
        <aside className="props">{tabs}
          <PhotoEditSections slot={selectedSlot} header withArrange />
        </aside>
      );
    }

    // Normal mode + empty frame: photo actions don't apply, frame editing
    // belongs to layout mode — point the user there.
    if (!spreadSelected) {
      return (
        <aside className="props">{tabs}
          <h3>Frame #{selectedSlot + 1}</h3>
          <div className="prop-empty">
            Empty frame — drag a photo from the tray below.
            <br />
            <br />
            Want to edit the frame (position/size/alignment)?
            <br />
            Click the spread background to enter <b>layout edit mode</b>.
          </div>
        </aside>
      );
    }

    // §7.3 LAYOUT mode: exact frame position/size in cm (spread coordinates).
    const size = st.size;
    const cm = tpl ? spreadCmFor(tpl, size) : null;
    const eff =
      tpl && selectedSlot < tpl.slots.length
        ? { ...tpl.slots[selectedSlot], ...(spread?.slotRects?.[selectedSlot] ?? {}) }
        : spread?.slotRects?.[selectedSlot];
    const setFrameCm = (field: "x" | "y" | "w" | "h", valCm: number) => {
      if (!cm || !eff || !Number.isFinite(valCm)) return;
      const div = field === "x" || field === "w" ? cm.w : cm.h;
      useAlbum.getState().setSlotRect(selectedSlot, { ...eff, [field]: valCm / div });
    };
    const frameFields = (["x", "y", "w", "h"] as const).map((f) => ({
      f,
      label: { x: "X", y: "Y", w: "W", h: "H" }[f],
      val: eff && cm ? (eff[f] * (f === "x" || f === "w" ? cm.w : cm.h)).toFixed(1) : "",
    }));

    return (
      <aside className="props">{tabs}
        <h3>Frame #{selectedSlot + 1}</h3>
        {eff && cm && (
          <div className="prop-group">
            <div className="prop-label">Frame (cm — position on the spread)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {frameFields.map(({ f, label, val }) => (
                <label key={f} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
                  <span style={{ width: 34, color: "var(--text-faint)" }}>{label}</span>
                  <input
                    className="input"
                    type="number"
                    step={0.1}
                    value={val}
                    onChange={(e) => setFrameCm(f, parseFloat(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        <ArrangeRow slot={selectedSlot} />
        <AlignRows slot={selectedSlot} />
        {/* the photo in this frame is editable right here too */}
        {img && <PhotoEditSections slot={selectedSlot} />}
        {!img && <div className="prop-empty">Empty frame — drag a photo from the tray below.</div>}
      </aside>
    );
  }

  // ---------- LAYOUT selected (click the spread background) ----------
  return (
    <aside className="props">{tabs}
      {activeTab === "photo" ? (
        <div className="prop-empty">
          Select a photo on the canvas to edit (border, radius, rotate, swap…).
        </div>
      ) : (
        <>
      <h3>Layout · {spreadLabel(spreads, currentIndex)}</h3>
      <AlbumConfig />
      <BackgroundSection />
      {spread?.isCover && (
        <div className="prop-group">
          <div className="prop-label">Cover size</div>
          <div className="prop-row">
            <button
              className={"btn" + ((spread.pages ?? 2) === 1 ? " primary" : "")}
              onClick={() => useAlbum.getState().setCoverPages(1)}
            >
              1 trang
            </button>
            <button
              className={"btn" + ((spread.pages ?? 2) === 2 ? " primary" : "")}
              onClick={() => useAlbum.getState().setCoverPages(2)}
            >
              2 pages (wrap)
            </button>
          </div>
          <div className="hint-sm">1 page = front cover · 2 pages = full front + back wrap.</div>
        </div>
      )}
      {/* print guides (⌘B): red = trim (lab cut), green = safe zone */}
      <div className="prop-group">
        <div className="prop-label" title="Toggle with ⌘B (Ctrl+B)">Print guides</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 60, color: "#ef6666" }}>▦ Trim (red)</span>
            <input
              className="input"
              type="number"
              step={0.5}
              min={0}
              value={settings.trimMm}
              onChange={(e) =>
                useAlbum.getState().setSettings({ trimMm: Math.max(0, parseFloat(e.target.value) || 0) })
              }
            />
            <span style={{ color: "var(--text-faint)" }}>mm</span>
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 66, color: "#3ec78a" }}>▢ Safe</span>
            <input
              className="input"
              type="number"
              step={0.5}
              min={0}
              value={settings.safeMm}
              onChange={(e) =>
                useAlbum.getState().setSettings({ safeMm: Math.max(0, parseFloat(e.target.value) || 0) })
              }
            />
            <span style={{ color: "var(--text-faint)" }}>mm</span>
          </label>
        </div>
        <div className="hint-sm" style={{ marginTop: 6 }}>
          <b>⌘B</b> toggles · Red = trim edge · Green = safe zone. Screen only.
        </div>
      </div>
      <div className="prop-group">
        <div className="prop-label">Spacing</div>
        <div className="prop-row" style={{ marginBottom: 8 }}>
          <span style={{ width: 62, fontSize: 11, color: "var(--text-dim)" }}>Photo gap</span>
          <input
            type="range"
            min={0}
            max={0.05}
            step={0.002}
            value={spread?.margin ?? 0}
            onChange={(e) => setMargin(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 30, textAlign: "right", fontSize: 11 }}>
            {Math.round((spread?.margin ?? 0) * 1000) / 10}
          </span>
        </div>
        <div className="prop-row" style={{ marginBottom: 8 }}>
          <span style={{ width: 62, fontSize: 11, color: "var(--text-dim)" }}>Edge pad</span>
          <input
            type="range"
            min={0}
            max={0.08}
            step={0.002}
            value={spread?.padding ?? 0}
            onChange={(e) => useAlbum.getState().setPadding(parseFloat(e.target.value))}
            style={{ flex: 1 }}
          />
          <span style={{ width: 30, textAlign: "right", fontSize: 11 }}>
            {Math.round((spread?.padding ?? 0) * 1000) / 10}
          </span>
        </div>
        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center" }}
          onClick={() => useAlbum.getState().applySpacingAll()}
        >
          Apply to whole album
        </button>
      </div>
      {spread?.bgImageId && (
        <div className="prop-group">
          <div className="prop-label">Background photo (full-bleed)</div>
          <button
            className="btn primary"
            style={{ width: "100%", justifyContent: "center" }}
            title="Pull the background photo into a frame to resize / edit like a normal photo"
            onClick={() => useAlbum.getState().backgroundToSlot()}
          >
            ⤡ Shrink into a frame
          </button>
          <button
            className="btn"
            style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            onClick={() => useAlbum.getState().removeBackground()}
          >
            Remove background photo
          </button>
        </div>
      )}

      <div className="prop-empty">
        Photos drag to swap frames · click a photo to edit it.
      </div>
        </>
      )}
    </aside>
  );
}
