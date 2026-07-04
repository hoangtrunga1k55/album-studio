import { useState } from "react";
import { TYPO_DND_KEY } from "../constants";
import { loadTypoFolder, pickTypoFolder, saveTypoFolder } from "../ipc/typos";
import { loadTemplateFontsFromFolder, savedFontFolder } from "../engine/fontLibrary";
import { useAlbum } from "../store/album";
import { useTypos } from "../store/typos";
import { useFonts } from "../store/fonts";
import "./TypoPanel.css";

export function TypoPanel() {
  const addTypo = useAlbum((s) => s.addTypo);
  const hasAlbum = useAlbum((s) => s.spreads.length > 0);
  const typos = useTypos((s) => s.typos);
  const setTypos = useTypos((s) => s.setTypos);
  const addFonts = useFonts((s) => s.addFonts);
  const setFontIndex = useFonts((s) => s.setIndex);
  const [busy, setBusy] = useState(false);

  async function importTypos() {
    const path = await pickTypoFolder();
    if (!path) return;
    setBusy(true);
    try {
      const list = await loadTypoFolder(path);
      setTypos(list);
      saveTypoFolder(path);
      // Resolve the fonts the new typos reference (needs the font kho folder).
      const folder = savedFontFolder();
      if (folder) {
        const r = await loadTemplateFontsFromFolder(folder);
        addFonts(r.loaded);
        setFontIndex(r.entries);
      }
    } catch (e) {
      alert("Nạp typo lỗi: " + String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="panel-subbar" style={{ paddingTop: 10, gap: 8, flexWrap: "wrap" }}>
        <button className="btn" onClick={importTypos} disabled={busy}>
          {busy ? "Đang nạp…" : typos.length ? "Đổi thư mục typo" : "Thêm thư mục typo (kho)"}
        </button>
        <span className="panel-count">
          {typos.length ? `Bấm (hoặc kéo) typo lên spread · ${typos.length} mẫu` : "Chưa nạp kho typo"}
        </span>
      </div>
      <div className="typo-grid">
        {typos.map((t) => (
          <figure
            key={t.id}
            className="typo-cell"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(TYPO_DND_KEY, t.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            onClick={() => hasAlbum && addTypo(t.id, 0.34, 0.4)}
            title="Bấm để chèn vào spread"
          >
            <img src={t.preview} alt="" draggable={false} />
          </figure>
        ))}
        {typos.length === 0 && (
          <div className="ip-empty">
            Chưa có typo. Bấm <b>“Thêm thư mục typo”</b> rồi trỏ tới thư mục kho typo (Tizino cấp).
          </div>
        )}
      </div>
    </>
  );
}