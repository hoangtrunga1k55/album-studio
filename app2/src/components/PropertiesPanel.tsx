import { useState } from "react";
import { getTemplate, spreadCmFor } from "../engine/templates";
import { getTypo } from "../engine/typos";
import { PhotoNavigator } from "./PhotoNavigator";
import { spreadLabel, useAlbum, type ArrangeOp } from "../store/album";
import { useFonts } from "../store/fonts";
import { useTypos } from "../store/typos";
import { pickAndLoadFonts, fontAliases } from "../ipc/fonts";
import { importTypoLibrary } from "../flows/typoImport";
import { TYPO_DND_KEY } from "../constants";
import { FontPicker } from "./FontPicker";
import { IconTrash } from "../icons";

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
          <button className="btn" title="Mép trái trang" onClick={() => put(0, me.y)}>⇤</button>
          <button className="btn" title="Giữa ngang trang" onClick={() => put((1 - me.w) / 2, me.y)}>↔</button>
          <button className="btn" title="Mép phải trang" onClick={() => put(1 - me.w, me.y)}>⇥</button>
          <button className="btn" title="Mép trên trang" onClick={() => put(me.x, 0)}>⤒</button>
          <button className="btn" title="Giữa dọc trang" onClick={() => put(me.x, (1 - me.h) / 2)}>↕</button>
          <button className="btn" title="Mép dưới trang" onClick={() => put(me.x, 1 - me.h)}>⤓</button>
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

          <div className="prop-label" style={{ marginTop: 12 }}>Tông màu</div>
          <div className="sa-rows">
            <div className="sa-row">
              <span className="sa-name">Sáng:</span>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={Math.round((t.brightness ?? 0) * 100)}
                onChange={(e) => setT({ ...t, brightness: parseInt(e.target.value, 10) / 100 })}
              />
              <span className="sa-val">{Math.round((t.brightness ?? 0) * 100)}</span>
              <button
                className="sa-reset"
                title="Về 0"
                disabled={(t.brightness ?? 0) === 0}
                onClick={() => setT({ ...t, brightness: 0 })}
              >
                ×
              </button>
            </div>
            <div className="sa-row">
              <span className="sa-name">T.phản:</span>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={t.contrast ?? 0}
                onChange={(e) => setT({ ...t, contrast: parseInt(e.target.value, 10) })}
              />
              <span className="sa-val">{t.contrast ?? 0}</span>
              <button
                className="sa-reset"
                title="Về 0"
                disabled={(t.contrast ?? 0) === 0}
                onClick={() => setT({ ...t, contrast: 0 })}
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

const SNIPPETS = [
  "Mãi mãi bên nhau",
  "Trọn đời yêu thương",
  "Hạnh phúc trăm năm",
  "Tình yêu vĩnh cửu",
  "Ngày chung đôi",
  "Save the date",
];

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
  const bgColor = useAlbum((s) => s.bgColor);
  const setBgColor = useAlbum((s) => s.setBgColor);
  const setMargin = useAlbum((s) => s.setMargin);
  const editTplText = useAlbum((s) => s.editTplText);
  const deleteTplText = useAlbum((s) => s.deleteTplText);
  const resetTplText = useAlbum((s) => s.resetTplText);
  const updateAddedText = useAlbum((s) => s.updateAddedText);
  const removeAddedText = useAlbum((s) => s.removeAddedText);
  const addText = useAlbum((s) => s.addText);
  const tool = useAlbum((s) => s.tool);
  const addTypoToSpread = useAlbum((s) => s.addTypo);
  const typos = useTypos((s) => s.typos);
  const fonts = useFonts((s) => s.fonts);
  const addFonts = useFonts((s) => s.addFonts);
  const [typoBusy, setTypoBusy] = useState(false);

  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);

  const loadedSet = new Set(fonts.flatMap((f) => fontAliases(f)));

  // fonts referenced by templates but not yet loaded (whole album)
  const missing = new Set<string>();
  for (const sp of spreads) {
    const t = getTemplate(sp.templateId);
    t?.texts.forEach((tx, i) => {
      const f = sp.textEdits[i]?.font ?? tx.font;
      if (f && !loadedSet.has(f)) missing.add(f);
    });
    sp.addedTexts.forEach((a) => {
      if (a.font && !loadedSet.has(a.font)) missing.add(a.font);
    });
  }
  const missingList = [...missing];

  async function importFonts() {
    addFonts(await pickAndLoadFonts());
  }


  // ---------- GROUP selected (Shift-click nhiều phần tử) ----------
  const multiSel = useAlbum.getState().multiSel;
  if (multiSel.length >= 2) {
    const st = useAlbum.getState();
    const photoIdx = multiSel
      .filter((k) => k[0] === "s")
      .map((k) => parseInt(k.slice(1), 10))
      .filter((i) => !!spread?.imageIds[i]);
    const first = photoIdx.length ? spread.transforms[photoIdx[0]] : undefined;
    const gb = first?.brightness ?? 0;
    const gc = first?.contrast ?? 0;
    const counts = {
      s: multiSel.filter((k) => k[0] === "s").length,
      t: multiSel.filter((k) => k[0] === "t" || k[0] === "a").length,
      y: multiSel.filter((k) => k[0] === "y").length,
    };
    return (
      <aside className="props">
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
            : "Nhóm để chỉnh cơ bản (tông màu…). Muốn DI CHUYỂN: vào chế độ sửa layout rồi quây lại."}
        </div>

        {photoIdx.length > 0 && (
          <>
            <div className="prop-label" style={{ marginTop: 14 }}>
              Tông màu ({photoIdx.length} ảnh)
            </div>
            <div className="sa-rows">
              <div className="sa-row">
                <span className="sa-name">Sáng:</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={Math.round(gb * 100)}
                  onChange={(e) =>
                    st.adjustGroupPhotos({ brightness: parseInt(e.target.value, 10) / 100 })
                  }
                />
                <span className="sa-val">{Math.round(gb * 100)}</span>
                <button
                  className="sa-reset"
                  title="Về 0"
                  disabled={gb === 0}
                  onClick={() => st.adjustGroupPhotos({ brightness: 0 })}
                >
                  ×
                </button>
              </div>
              <div className="sa-row">
                <span className="sa-name">T.phản:</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  step={1}
                  value={gc}
                  onChange={(e) => st.adjustGroupPhotos({ contrast: parseInt(e.target.value, 10) })}
                />
                <span className="sa-val">{gc}</span>
                <button
                  className="sa-reset"
                  title="Về 0"
                  disabled={gc === 0}
                  onClick={() => st.adjustGroupPhotos({ contrast: 0 })}
                >
                  ×
                </button>
              </div>
            </div>
            <div className="prop-group" style={{ marginTop: 10 }}>
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
        <aside className="props">
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
        <aside className="props">
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
                Font “{font}” chưa nạp → đang thay thế.{" "}
                <button onClick={importFonts}>Nạp font</button>
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
        <aside className="props">
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
        <aside className="props">
          <PhotoEditSections slot={selectedSlot} header withArrange />
        </aside>
      );
    }

    // Normal mode + empty frame: photo actions don't apply, frame editing
    // belongs to layout mode — point the user there.
    if (!spreadSelected) {
      return (
        <aside className="props">
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
      <aside className="props">
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
  function add(content: string) {
    const family = fonts[0]?.family ?? "Be Vietnam Pro";
    addText({ content, font: family, color: "#222222", sizeFrac: 0.035, x: 0.4, y: 0.45 });
  }
  async function importTypos() {
    setTypoBusy(true);
    try {
      await importTypoLibrary();
    } catch (e) {
      alert("Nạp typo lỗi: " + String(e));
    } finally {
      setTypoBusy(false);
    }
  }
  const st = useAlbum.getState();
  return (
    <aside className="props">
      <h3>Layout · {spreadLabel(spreads, currentIndex)}</h3>
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
      <div className="prop-group">
        <div className="prop-label">Bố cục</div>
        <div className="prop-row">
          <button className="btn" onClick={() => st.setLayoutDock(true)}>
            Đổi layout…
          </button>
          <button className="btn" onClick={() => st.shuffleCurrent()} title="Space">
            Ngẫu nhiên
          </button>
        </div>
        <button
          className={"btn" + (tool === "drawSlot" ? " primary" : "")}
          style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
          onClick={() => st.setTool(tool === "drawSlot" ? "select" : "drawSlot")}
        >
          {tool === "drawSlot" ? "Đang vẽ — kéo trên spread (Esc thoát)" : "＋ Vẽ khung ảnh mới"}
        </button>
      </div>
      {missingList.length > 0 && (
        <div className="font-warn">
          <b>⚠ {missingList.length} font template chưa nạp</b>
          <div className="font-warn-list">
            {missingList.slice(0, 8).join(", ")}
            {missingList.length > 8 ? "…" : ""}
          </div>
          <button className="btn" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={importFonts}>
            Nạp font gốc để đúng kiểu chữ
          </button>
        </div>
      )}
      <div className="prop-group">
        <div className="prop-label">Màu nền</div>
        <div className="prop-row">
          <input type="color" className="swatch" value={bgColor} onChange={(e) => setBgColor(e.target.value)} />
          <input className="input" value={bgColor.toUpperCase()} onChange={(e) => setBgColor(e.target.value)} />
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
            className="btn"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={() => useAlbum.getState().removeBackground()}
          >
            Gỡ ảnh nền
          </button>
        </div>
      )}

      <div className="prop-group">
        <div className="prop-label">Thêm chữ</div>
        <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => add("Nội dung mới")}>
          + Chữ trống
        </button>
        <div className="snippets">
          {SNIPPETS.map((s) => (
            <button key={s} className="snippet" onClick={() => add(s)}>{s}</button>
          ))}
        </div>
      </div>
      <div className="prop-group">
        <div className="prop-label">Typo trang trí</div>
        {typos.length > 0 ? (
          <>
            <div className="pp-typos">
              {typos.map((t) => (
                <figure
                  key={t.id}
                  className="pp-typo"
                  title="Bấm để chèn vào spread (kéo thả cũng được)"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(TYPO_DND_KEY, t.id);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => addTypoToSpread(t.id, 0.34, 0.4)}
                >
                  <img src={t.preview} alt="" draggable={false} />
                </figure>
              ))}
            </div>
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
              onClick={importTypos}
              disabled={typoBusy}
            >
              {typoBusy ? "Đang nạp…" : "Đổi thư mục typo…"}
            </button>
          </>
        ) : (
          <button
            className="btn"
            style={{ width: "100%", justifyContent: "center" }}
            onClick={importTypos}
            disabled={typoBusy}
          >
            {typoBusy ? "Đang nạp…" : "Nạp kho typo…"}
          </button>
        )}
      </div>
      <div className="prop-empty">
        Ở chế độ layout, ảnh chỉ để kéo đổi chỗ giữa các khung.
        <br />
        Click thẳng vào ảnh để chỉnh ảnh.
      </div>
    </aside>
  );
}
