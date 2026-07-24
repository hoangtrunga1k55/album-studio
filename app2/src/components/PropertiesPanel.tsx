import { useState } from "react";
import { getTemplate, spreadCmFor } from "../engine/templates";
import { ensureTypoDeco, getTypo } from "../engine/typos";
import { PhotoNavigator } from "./PhotoNavigator";
import { spreadLabel, useAlbum, type ArrangeOp } from "../store/album";
import { useFonts } from "../store/fonts";
import { useTypos } from "../store/typos";
import { fontAliases } from "../ipc/fonts";
import { loadSystemFonts } from "../engine/fontLibrary";
import { TYPO_DND_KEY } from "../constants";
import { FontPicker } from "./FontPicker";
import { AlbumConfig } from "./AlbumConfig";
import { IconTrash } from "../icons";

type PanelTab = "layout" | "photo" | "typo";

/** The 3 tabs at the top of the right panel — Layout / Ảnh / Typo. */
function PanelTabs({ active, onPick }: { active: PanelTab; onPick: (t: PanelTab) => void }) {
  const items: { id: PanelTab; label: string }[] = [
    { id: "layout", label: "Layout" },
    { id: "photo", label: "Ảnh" },
    { id: "typo", label: "Typo" },
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
      <div className="prop-label">{label ?? "Sắp lớp (khi chồng nhau)"}</div>
      <div className="prop-row">
        <button className="btn" title="Lên trên cùng" onClick={() => onOp("front")}>⬆</button>
        <button className="btn" title="Lên một lớp" onClick={() => onOp("forward")}>↑</button>
        <button className="btn" title="Xuống một lớp" onClick={() => onOp("backward")}>↓</button>
        <button className="btn" title="Xuống dưới cùng" onClick={() => onOp("back")}>⬇</button>
      </div>
    </div>
  );
}

/** Arrange row for photo frames (`s<i>` in the unified z-order). */
function ArrangeRow({ slot }: { slot: number }) {
  const arrange = useAlbum((s) => s.arrangeZ);
  return <ArrangeButtons label="Sắp lớp (ảnh/chữ/typo chồng nhau)" onOp={(op) => arrange(`s${slot}`, op)} />;
}

/** Arrange row for texts and typos (same unified z-order as photos). */
function ArrangeDecorRow({ decorKey }: { decorKey: string }) {
  const arrange = useAlbum((s) => s.arrangeZ);
  return <ArrangeButtons label="Sắp lớp (ảnh/chữ/typo chồng nhau)" onOp={(op) => arrange(decorKey, op)} />;
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
        <div className="prop-label">Căn theo trang</div>
        <div className="prop-row">
          <button className="btn" title="Mép trái trang" onClick={() => alignGroup("left")}>⇤</button>
          <button className="btn" title="Giữa ngang trang" onClick={() => alignGroup("hcenter")}>↔</button>
          <button className="btn" title="Mép phải trang" onClick={() => alignGroup("right")}>⇥</button>
          <button className="btn" title="Mép trên trang" onClick={() => alignGroup("top")}>⤒</button>
          <button className="btn" title="Giữa dọc trang" onClick={() => alignGroup("vmiddle")}>↕</button>
          <button className="btn" title="Mép dưới trang" onClick={() => alignGroup("bottom")}>⤓</button>
        </div>
      </div>
      <div className="prop-group">
        <div className="prop-label">Căn theo khung mốc ⚓</div>
        {alignAnchor === null || alignAnchor === slot ? (
          <>
            <button
              className={"btn" + (alignAnchor === slot ? " primary" : "")}
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => setAlignAnchor(alignAnchor === slot ? null : slot)}
            >
              {alignAnchor === slot ? "⚓ Đang là mốc — bấm để bỏ (G)" : "⚓ Đặt khung này làm mốc (G)"}
            </button>
            {alignAnchor === null && (
              <div className="hint-sm">Đặt mốc → chọn khung khác → căn giữa/trên/dưới theo mốc.</div>
            )}
          </>
        ) : anchor ? (
          <>
            {/* single-axis translate only — the other coordinate stays put */}
            <div className="prop-row">
              <button
                className="btn"
                title="Thẳng mép TRÁI với mốc (giữ nguyên chiều dọc)"
                onClick={() => put(anchor.x, me.y)}
              >
                ⇤ Trái
              </button>
              <button
                className="btn"
                title="Thẳng TÂM NGANG với mốc (giữ nguyên chiều dọc)"
                onClick={() => put(anchor.x + (anchor.w - me.w) / 2, me.y)}
              >
                ↔ Giữa
              </button>
              <button
                className="btn"
                title="Thẳng mép PHẢI với mốc (giữ nguyên chiều dọc)"
                onClick={() => put(anchor.x + anchor.w - me.w, me.y)}
              >
                ⇥ Phải
              </button>
            </div>
            <div className="prop-row" style={{ marginTop: 6 }}>
              <button
                className="btn"
                title="Thẳng mép TRÊN với mốc (giữ nguyên chiều ngang)"
                onClick={() => put(me.x, anchor.y)}
              >
                ⤒ Trên
              </button>
              <button
                className="btn"
                title="Thẳng TÂM DỌC với mốc (giữ nguyên chiều ngang)"
                onClick={() => put(me.x, anchor.y + (anchor.h - me.h) / 2)}
              >
                ↕ Giữa
              </button>
              <button
                className="btn"
                title="Thẳng mép DƯỚI với mốc (giữ nguyên chiều ngang)"
                onClick={() => put(me.x, anchor.y + anchor.h - me.h)}
              >
                ⤓ Dưới
              </button>
            </div>
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
              title="Bỏ khung mốc"
              onClick={() => setAlignAnchor(null)}
            >
              ✕ Bỏ mốc
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
                <span className="ppi-warn" title={`In sẽ mờ — ${ppi} PPI (nên ≥ 200)`}>⚠</span>
              )}
            </h3>
          ) : (
            <div className="prop-label" style={{ marginTop: 14 }}>Ảnh trong khung</div>
          )}

          <div className="prop-label">Thiết kế</div>
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
                title="Về 100%"
                disabled={zoomPct === 100}
                onClick={() => setT({ ...t, zoom: 1, panX: 0, panY: 0 })}
              >
                ×
              </button>
            </div>
            <div className="sa-row">
              <span className="sa-name">Góc xoay:</span>
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
                title="Về 0°"
                disabled={angle === 0}
                onClick={() => setAngle(0)}
              >
                ×
              </button>
            </div>
          </div>

          <div className="prop-label" style={{ marginTop: 12 }}>Viền · Bo góc · Đục</div>
          <div className="sa-rows">
            <div className="sa-row">
              <span className="sa-name">Viền:</span>
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
                title="Màu viền"
                style={{ width: 26, height: 20, padding: 0, border: "none", background: "none", cursor: "pointer" }}
              />
              <button
                className="sa-reset"
                title="Theo cài đặt album"
                disabled={t.borderPt == null && t.borderColor == null}
                onClick={() => setT({ ...t, borderPt: undefined, borderColor: undefined })}
              >
                ×
              </button>
            </div>
            <div className="sa-row">
              <span className="sa-name">Bo góc:</span>
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
                title="Vuông góc"
                disabled={!t.radiusPt}
                onClick={() => setT({ ...t, radiusPt: undefined })}
              >
                ×
              </button>
            </div>
            <div className="sa-row">
              <span className="sa-name">Đục:</span>
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
              <button className="btn" onClick={() => st.rotateSlot(slot)} title="Xoay ảnh 90° trong khung">
                ⟳ 90°
              </button>
              <button className="btn" onClick={() => st.flipSlot(slot, "h")} title="Lật ngang">
                ⇋
              </button>
              <button className="btn" onClick={() => st.flipSlot(slot, "v")} title="Lật dọc">
                ⇵
              </button>
              <button
                className="btn"
                onClick={() =>
                  st.setSlotFit(slot, (t.fit ?? "cover") === "cover" ? "contain" : "cover")
                }
                title="Phủ kín khung / hiện trọn ảnh"
              >
                {(t.fit ?? "cover") === "cover" ? "Trọn ảnh" : "Phủ kín"}
              </button>
            </div>
          </div>

          {withArrange && <ArrangeRow slot={slot} />}

          <div className="prop-label" style={{ marginTop: 14 }}>Thông tin ảnh</div>
          <div className="sa-info">
            {frameWcm && frameHcm && (
              <div><span>Khung R×C</span><b>{frameWcm.toFixed(1)} × {frameHcm.toFixed(1)} cm</b></div>
            )}
            {ppi !== null && (
              <div>
                <span>PPI hiệu dụng</span>
                <b style={ppi < 200 ? { color: "#f59e0b" } : undefined}>{ppi}</b>
              </div>
            )}
            <div><span>Kích thước gốc</span><b>{img.width} × {img.height} px</b></div>
            <div><span>Đã dùng</span><b>{usedCount} lần</b></div>
          </div>

          <button
            className="btn"
            style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
            onClick={() => st.beginSwap(slot)}
            title="Phím S — rồi bấm ô đích để hoán đổi 2 ảnh (kéo ảnh sang ô khác cũng được)"
          >
            ⇄ Đổi chỗ ảnh… (S)
          </button>
          <button className="danger" onClick={() => st.clearSlot(slot)} style={{ marginTop: 10 }}>
            <IconTrash width={15} height={15} /> Gỡ ảnh khỏi khung
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
  const spreadSelected = useAlbum((s) => s.spreadSelected);
  const updateTypo = useAlbum((s) => s.updateTypo);
  const removeTypo = useAlbum((s) => s.removeTypo);
  const settings = useAlbum((s) => s.settings);
  const setMargin = useAlbum((s) => s.setMargin);
  const editTplText = useAlbum((s) => s.editTplText);
  const deleteTplText = useAlbum((s) => s.deleteTplText);
  const resetTplText = useAlbum((s) => s.resetTplText);
  const updateAddedText = useAlbum((s) => s.updateAddedText);
  const removeAddedText = useAlbum((s) => s.removeAddedText);
  const addTypoToSpread = useAlbum((s) => s.addTypo);
  const typos = useTypos((s) => s.typos);
  const fonts = useFonts((s) => s.fonts);
  const addFonts = useFonts((s) => s.addFonts);
  const [typoCat, setTypoCat] = useState<string>("all");
  const typoCats = [...new Set(typos.map((t) => t.category ?? "khac"))].sort();
  const shownTypos = typoCat === "all" ? typos : typos.filter((t) => (t.category ?? "khac") === typoCat);

  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);

  const loadedSet = new Set(fonts.flatMap((f) => fontAliases(f)));

  // Fonts come from the machine now — re-scan after the user installs the
  // missing ones (no more manual per-file loading).
  const [fontBusy, setFontBusy] = useState(false);
  async function rescanFonts() {
    setFontBusy(true);
    try {
      const r = await loadSystemFonts();
      addFonts(r.loaded);
    } finally {
      setFontBusy(false);
    }
  }


  // ---------- 3-tab shell (Layout / Ảnh / Typo) ----------
  const multiSel = useAlbum((s) => s.multiSel);
  const clearSelection = useAlbum((s) => s.clearSelection);
  // panel-level view when nothing on the canvas is selected
  const [bgTab, setBgTab] = useState<PanelTab>("layout");
  // which tab lights up follows the current selection; else the panel view
  const activeTab: PanelTab = selectedTypo
    ? "typo"
    : multiSel.length >= 2 || selectedSlot !== null
      ? "photo"
      : selectedText
        ? "layout"
        : bgTab;
  const pickTab = (t: PanelTab) => {
    if (t === activeTab) return;
    setBgTab(t);
    // tabs are panel-level views — drop any canvas selection to reveal them
    clearSelection();
  };
  const tabs = <PanelTabs active={activeTab} onPick={pickTab} />;

  // Typo picker gallery — shown in the Typo tab (insert by click or drag).
  const typoGallery = (
    <div className="prop-group">
      <div className="prop-label">Typo trang trí</div>
      {typos.length > 0 ? (
        <>
          <div className="typo-tabs">
            <button
              className={"typo-tab" + (typoCat === "all" ? " active" : "")}
              onClick={() => setTypoCat("all")}
            >
              Tất cả ({typos.length})
            </button>
            {typoCats.map((c) => (
              <button
                key={c}
                className={"typo-tab" + (typoCat === c ? " active" : "")}
                onClick={() => setTypoCat(c)}
                title={`Nhóm typo: ${c}`}
              >
                {c} ({typos.filter((t) => (t.category ?? "khac") === c).length})
              </button>
            ))}
          </div>
          <div className="pp-typos">
            {shownTypos.map((t) => (
              <figure
                key={t.id}
                className="pp-typo"
                title={`${t.category ?? ""} · bấm để chèn (kéo thả cũng được)`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(TYPO_DND_KEY, t.id);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => {
                  void ensureTypoDeco(t.id);
                  addTypoToSpread(t.id, 0.34, 0.4);
                }}
              >
                <img src={t.preview} alt="" draggable={false} loading="lazy" />
              </figure>
            ))}
          </div>
        </>
      ) : (
        <div className="hint-sm">Chưa có kho typo — nạp trong ⚙ Cài đặt.</div>
      )}
    </div>
  );

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
        <h3>Nhóm · {multiSel.length} phần tử</h3>
        <div className="prop-meta">
          <div>
            {counts.s > 0 && <>Ảnh: <b>{counts.s}</b> · </>}
            {counts.t > 0 && <>Chữ: <b>{counts.t}</b> · </>}
            {counts.y > 0 && <>Typo: <b>{counts.y}</b></>}
          </div>
        </div>
        <div className="hint-sm" style={{ marginTop: 6 }}>
          {spreadSelected
            ? "Kéo khung tím trên canvas để di chuyển cả nhóm. Shift-click để thêm/bớt."
            : "Nhóm để chỉnh nhanh ảnh (phủ kín/trọn ảnh). Muốn DI CHUYỂN/CĂN: vào chế độ sửa layout rồi quây lại."}
        </div>

        {spreadSelected && (
          <>
            <div className="prop-group" style={{ marginTop: 14 }}>
              <div className="prop-label">Căn hàng (theo mép trang)</div>
              <div className="prop-row">
                <button className="btn" title="Thẳng mép trái" onClick={() => st.alignGroup("left")}>⇤</button>
                <button className="btn" title="Thẳng tâm ngang" onClick={() => st.alignGroup("hcenter")}>↔</button>
                <button className="btn" title="Thẳng mép phải" onClick={() => st.alignGroup("right")}>⇥</button>
                <button className="btn" title="Thẳng mép trên" onClick={() => st.alignGroup("top")}>⤒</button>
                <button className="btn" title="Thẳng tâm dọc" onClick={() => st.alignGroup("vmiddle")}>↕</button>
                <button className="btn" title="Thẳng mép dưới" onClick={() => st.alignGroup("bottom")}>⤓</button>
              </div>
            </div>
            <div className="prop-group">
              <div className="prop-label">Phân bố đều (cần ≥ 3 phần tử)</div>
              <div className="prop-row">
                <button
                  className="btn"
                  title="Khoảng cách NGANG giữa các phần tử bằng nhau (giữ phần tử ngoài cùng)"
                  disabled={multiSel.length < 3}
                  onClick={() => st.distributeGroup("h")}
                >
                  ⇹ Ngang đều
                </button>
                <button
                  className="btn"
                  title="Khoảng cách DỌC giữa các phần tử bằng nhau (giữ phần tử ngoài cùng)"
                  disabled={multiSel.length < 3}
                  onClick={() => st.distributeGroup("v")}
                >
                  ⇳ Dọc đều
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
                  title="Phủ kín khung cho cả nhóm"
                  onClick={() => st.adjustGroupPhotos({ fit: "cover", zoom: 1, panX: 0, panY: 0 })}
                >
                  Phủ kín
                </button>
                <button
                  className="btn"
                  title="Hiện trọn ảnh cho cả nhóm"
                  onClick={() => st.adjustGroupPhotos({ fit: "contain", zoom: 1, panX: 0, panY: 0 })}
                >
                  Trọn ảnh
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
          Bỏ chọn nhóm (Esc)
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
          <h3>Typo{typo ? ` · ${typo.texts.length} chữ` : ""}</h3>
          <div className="prop-group">
            <div className="prop-label">Kích thước ({Math.round(pt.w * 100)}%)</div>
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
            <div className="prop-label">Màu</div>
            <div className="prop-row">
              <button
                className={"btn" + (pt.color === null ? " primary" : "")}
                onClick={() => updateTypo(pt.id, { color: null })}
              >
                Gốc
              </button>
              <input
                type="color"
                className="swatch"
                value={pt.color ?? "#ffffff"}
                onChange={(e) => updateTypo(pt.id, { color: e.target.value })}
              />
            </div>
            <div className="hint-sm">“Gốc” = giữ màu từng chữ · chọn màu = tô 1 màu.</div>
          </div>
          <ArrangeDecorRow decorKey={`y${pt.id}`} />
          <button className="danger" onClick={() => removeTypo(pt.id)}>
            <IconTrash width={15} height={15} /> Xoá typo
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
          <h3>Chữ (từ layout)</h3>
          <div className="prop-group">
            <div className="prop-label">Nội dung</div>
            <textarea className="input" rows={3} value={content}
              onChange={(e) => editTplText(i, { content: e.target.value })} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Font</div>
            <FontPicker value={font} onPick={(v) => editTplText(i, { font: v })} />
            {font && !loadedSet.has(font) && (
              <div className="font-warn-sm">
                Font “{font}” chưa cài trên máy → đang thay thế. Cài font này vào máy rồi{" "}
                <button onClick={rescanFonts} disabled={fontBusy}>
                  {fontBusy ? "đang quét…" : "quét lại"}
                </button>
              </div>
            )}
          </div>
          <div className="prop-group">
            <div className="prop-label">Cỡ chữ ×{sizeScale.toFixed(2)}</div>
            <input type="range" min={0.3} max={3} step={0.05} value={sizeScale}
              onChange={(e) => editTplText(i, { sizeScale: parseFloat(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Màu</div>
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
              ↺ Khôi phục chữ gốc
            </button>
          )}
          <button className="danger" onClick={() => deleteTplText(i)}>
            <IconTrash width={15} height={15} /> Xoá chữ này
          </button>
        </aside>
      );
    }
    if (selectedText.kind === "added") {
      const a = spread.addedTexts.find((t) => t.id === selectedText.id);
      if (!a) return <aside className="props" />;
      return (
        <aside className="props">{tabs}
          <h3>Chữ thêm mới</h3>
          <div className="prop-group">
            <div className="prop-label">Nội dung</div>
            <textarea className="input" rows={3} value={a.content}
              onChange={(e) => updateAddedText(a.id, { content: e.target.value })} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Font</div>
            <FontPicker value={a.font} onPick={(v) => updateAddedText(a.id, { font: v })} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Cỡ chữ</div>
            <input type="range" min={0.015} max={0.12} step={0.002} value={a.sizeFrac}
              onChange={(e) => updateAddedText(a.id, { sizeFrac: parseFloat(e.target.value) })} style={{ width: "100%" }} />
          </div>
          <div className="prop-group">
            <div className="prop-label">Màu</div>
            <input type="color" className="swatch" value={a.color}
              onChange={(e) => updateAddedText(a.id, { color: e.target.value })} />
          </div>
          <ArrangeDecorRow decorKey={`a${a.id}`} />
          <button className="danger" onClick={() => removeAddedText(a.id)}>
            <IconTrash width={15} height={15} /> Xoá chữ này
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
          <h3>Khung ảnh #{selectedSlot + 1}</h3>
          <div className="prop-empty">
            Khung trống — kéo ảnh từ khay dưới vào.
            <br />
            <br />
            Muốn chỉnh khung (vị trí/kích thước/căn chỉnh)?
            <br />
            Click nền spread để vào <b>chế độ sửa layout</b>.
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
      label: { x: "X", y: "Y", w: "Rộng", h: "Cao" }[f],
      val: eff && cm ? (eff[f] * (f === "x" || f === "w" ? cm.w : cm.h)).toFixed(1) : "",
    }));

    return (
      <aside className="props">{tabs}
        <h3>Khung ảnh #{selectedSlot + 1}</h3>
        {eff && cm && (
          <div className="prop-group">
            <div className="prop-label">Khung (cm — toạ độ trên spread)</div>
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
        {!img && <div className="prop-empty">Khung trống — kéo ảnh từ khay dưới vào.</div>}
      </aside>
    );
  }

  // ---------- LAYOUT selected (click the spread background) ----------
  return (
    <aside className="props">{tabs}
      {activeTab === "typo" ? (
        typoGallery
      ) : activeTab === "photo" ? (
        <div className="prop-empty">
          Chọn một ảnh trên canvas để chỉnh (viền, bo góc, xoay, đổi chỗ…).
        </div>
      ) : (
        <>
      <h3>Layout · {spreadLabel(spreads, currentIndex)}</h3>
      <AlbumConfig />
      {spread?.isCover && (
        <div className="prop-group">
          <div className="prop-label">Khổ bìa</div>
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
              2 trang (ôm)
            </button>
          </div>
          <div className="hint-sm">1 trang = bìa trước · 2 trang = trải cả mặt trước + sau.</div>
        </div>
      )}
      {/* print guides (⌘B): red = trim (lab cut), green = safe zone */}
      <div className="prop-group">
        <div className="prop-label" title="Bật/tắt bằng ⌘B (Ctrl+B)">Đường canh in ấn</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5 }}>
            <span style={{ width: 60, color: "#ef6666" }}>▦ Xén (đỏ)</span>
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
            <span style={{ width: 66, color: "#3ec78a" }}>▢ An toàn</span>
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
        <div className="hint-sm" style={{ marginTop: 8 }}>
          <b>⌘B</b> (Ctrl+B) để bật/tắt. Đỏ = mép lab có thể xén · Xanh = vùng an toàn giữ mặt/chữ bên trong. Chỉ hiển thị, không in ra.
        </div>
      </div>
      <div className="prop-group">
        <div className="prop-label">Khoảng cách ảnh ({Math.round((spread?.margin ?? 0) * 1000) / 10}%)</div>
        <input
          type="range"
          min={0}
          max={0.05}
          step={0.002}
          value={spread?.margin ?? 0}
          onChange={(e) => setMargin(parseFloat(e.target.value))}
          style={{ width: "100%" }}
        />
      </div>
      <div className="prop-group">
        <div className="prop-label">Lề mép spread ({Math.round((spread?.padding ?? 0) * 1000) / 10}%)</div>
        <input
          type="range"
          min={0}
          max={0.08}
          step={0.002}
          value={spread?.padding ?? 0}
          onChange={(e) => useAlbum.getState().setPadding(parseFloat(e.target.value))}
          style={{ width: "100%" }}
        />
        <button
          className="btn"
          style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
          onClick={() => useAlbum.getState().applySpacingAll()}
        >
          Áp dụng khoảng cách cho cả album
        </button>
      </div>
      {spread?.bgImageId && (
        <div className="prop-group">
          <div className="prop-label">Ảnh nền (full-bleed)</div>
          <button
            className="btn primary"
            style={{ width: "100%", justifyContent: "center" }}
            title="Đưa ảnh nền vào khung để thu nhỏ / chỉnh như ảnh thường"
            onClick={() => useAlbum.getState().backgroundToSlot()}
          >
            ⤡ Thu về khung ảnh
          </button>
          <button
            className="btn"
            style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
            onClick={() => useAlbum.getState().removeBackground()}
          >
            Gỡ ảnh nền
          </button>
        </div>
      )}

      <div className="prop-empty">
        Ở chế độ layout, ảnh chỉ để kéo đổi chỗ giữa các khung.
        <br />
        Click thẳng vào ảnh để chỉnh ảnh.
      </div>
        </>
      )}
    </aside>
  );
}
