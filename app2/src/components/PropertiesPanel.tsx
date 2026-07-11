import { useState } from "react";
import { getTemplate, spreadCmFor } from "../engine/templates";
import { getTypo } from "../engine/typos";
import { PhotoNavigator } from "./PhotoNavigator";
import { useAlbum } from "../store/album";
import { useFonts } from "../store/fonts";
import { useTypos } from "../store/typos";
import { pickAndLoadFonts, fontAliases } from "../ipc/fonts";
import { importTypoLibrary } from "../flows/typoImport";
import { TYPO_DND_KEY } from "../constants";
import { FontPicker } from "./FontPicker";
import { IconTrash } from "../icons";

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
  const updateTypo = useAlbum((s) => s.updateTypo);
  const removeTypo = useAlbum((s) => s.removeTypo);
  const bgColor = useAlbum((s) => s.bgColor);
  const setBgColor = useAlbum((s) => s.setBgColor);
  const clearSlot = useAlbum((s) => s.clearSlot);
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
          <button className="danger" onClick={() => removeAddedText(a.id)}>
            <IconTrash width={15} height={15} /> Xoá chữ này
          </button>
        </aside>
      );
    }
  }

  // ---------- SLOT selected ----------
  // SmartAlbums click model: photo clicked → PHOTO editing only; empty frame
  // clicked → FRAME (layout) editing. Photos move between frames by dragging.
  if (selectedSlot !== null) {
    const imgId = spread?.imageIds[selectedSlot];
    const img = imgId ? images.find((im) => im.id === imgId) : undefined;
    const st = useAlbum.getState();

    if (img) {
      const t = spread.transforms[selectedSlot] ?? { zoom: 1, panX: 0, panY: 0 };
      // Frame geometry in real units — drives the navigator ratio + info block.
      const size = st.size;
      const cmAll = tpl ? spreadCmFor(tpl, size) : null;
      const effRect =
        tpl && selectedSlot < tpl.slots.length
          ? { ...tpl.slots[selectedSlot], ...(spread?.slotRects?.[selectedSlot] ?? {}) }
          : spread?.slotRects?.[selectedSlot];
      const frameWcm = effRect && cmAll ? effRect.w * cmAll.w : null;
      const frameHcm = effRect && cmAll ? effRect.h * cmAll.h : null;
      const frameRatio = frameWcm && frameHcm ? frameWcm / frameHcm : 1;
      const setT = (next: typeof t) => st.setSlotTransform(selectedSlot, next);
      // Free rotation (SmartAlbums "Angle") — lives on the frame rect.
      const angle = spread?.slotRects?.[selectedSlot]?.rotDeg ?? 0;
      const setAngle = (deg: number) =>
        st.setSlotRect(selectedSlot, {
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
        <aside className="props">
          <h3 className="props-title" title={img.name}>
            {img.name}
            {ppi !== null && ppi < 200 && (
              <span className="ppi-warn" title={`In sẽ mờ — ${ppi} PPI (nên ≥ 200)`}>⚠</span>
            )}
          </h3>

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

          <div className="prop-group" style={{ marginTop: 12 }}>
            <div className="prop-row">
              <button className="btn" onClick={() => st.rotateSlot(selectedSlot)} title="Xoay ảnh 90° trong khung">
                ⟳ 90°
              </button>
              <button className="btn" onClick={() => st.flipSlot(selectedSlot, "h")} title="Lật ngang">
                ⇋
              </button>
              <button className="btn" onClick={() => st.flipSlot(selectedSlot, "v")} title="Lật dọc">
                ⇵
              </button>
              <button
                className="btn"
                onClick={() =>
                  st.setSlotFit(selectedSlot, (t.fit ?? "cover") === "cover" ? "contain" : "cover")
                }
                title="Phủ kín khung / hiện trọn ảnh"
              >
                {(t.fit ?? "cover") === "cover" ? "Trọn ảnh" : "Phủ kín"}
              </button>
            </div>
          </div>

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
            onClick={() => st.beginSwap(selectedSlot)}
            title="Phím S — rồi bấm ô đích để hoán đổi 2 ảnh (kéo ảnh sang ô khác cũng được)"
          >
            ⇄ Đổi chỗ ảnh… (S)
          </button>
          <button className="danger" onClick={() => clearSlot(selectedSlot)} style={{ marginTop: 10 }}>
            <IconTrash width={15} height={15} /> Gỡ ảnh khỏi khung
          </button>
        </aside>
      );
    }

    // §7.3 exact frame position/size in cm (spread coordinates).
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
        <div className="prop-empty">Khung trống — kéo ảnh từ khay dưới vào.</div>
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
      <h3>Layout · spread {currentIndex + 1}</h3>
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
