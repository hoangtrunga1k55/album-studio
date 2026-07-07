import { getTemplate } from "../engine/templates";
import { getTypo } from "../engine/typos";
import { useAlbum } from "../store/album";
import { useFonts } from "../store/fonts";
import { pickAndLoadFonts, fontAliases } from "../ipc/fonts";
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
  const beginSwap = useAlbum((s) => s.beginSwap);
  const setMargin = useAlbum((s) => s.setMargin);
  const editTplText = useAlbum((s) => s.editTplText);
  const deleteTplText = useAlbum((s) => s.deleteTplText);
  const resetTplText = useAlbum((s) => s.resetTplText);
  const updateAddedText = useAlbum((s) => s.updateAddedText);
  const removeAddedText = useAlbum((s) => s.removeAddedText);
  const addText = useAlbum((s) => s.addText);
  const fonts = useFonts((s) => s.fonts);
  const addFonts = useFonts((s) => s.addFonts);

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
  if (selectedSlot !== null) {
    const imgId = spread?.imageIds[selectedSlot];
    const img = imgId ? images.find((im) => im.id === imgId) : undefined;
    return (
      <aside className="props">
        <h3>Ô ảnh #{selectedSlot + 1}</h3>
        {img ? (
          <>
            <div className="prop-meta">
              <div>Ảnh: <b>{img.name}</b></div>
              <div>Kích thước: <b>{img.width}×{img.height}</b></div>
            </div>
            <button
              className="btn"
              style={{ width: "100%", justifyContent: "center", marginTop: 12 }}
              onClick={() => beginSwap(selectedSlot)}
            >
              Đổi chỗ ảnh…
            </button>
            <div className="hint-sm">Bấm rồi chọn ô khác để hoán đổi 2 ảnh.</div>
            <button className="danger" onClick={() => clearSlot(selectedSlot)} style={{ marginTop: 10 }}>
              <IconTrash width={15} height={15} /> Gỡ ảnh
            </button>
          </>
        ) : (
          <div className="prop-empty">Ô trống. Cuộn để zoom, kéo để chỉnh khung sau khi có ảnh.</div>
        )}
      </aside>
    );
  }

  // ---------- nothing selected: page ----------
  function add(content: string) {
    const family = fonts[0]?.family ?? "Be Vietnam Pro";
    addText({ content, font: family, color: "#222222", sizeFrac: 0.035, x: 0.4, y: 0.45 });
  }
  return (
    <aside className="props">
      <h3>Trang</h3>
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
      <div className="prop-empty">Click chữ hoặc ô ảnh trên canvas để chỉnh.</div>
    </aside>
  );
}
