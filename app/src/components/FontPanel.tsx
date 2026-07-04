import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { pickAndLoadFonts } from "../ipc/fonts";
import { loadTemplateFontsFromFolder, saveFontFolder } from "../engine/fontLibrary";
import { useFonts } from "../store/fonts";
import { IconImagePlus } from "../icons";
import "./FontPanel.css";

export function FontPanel() {
  const fonts = useFonts((s) => s.fonts);
  const addFonts = useFonts((s) => s.addFonts);
  const setIndex = useFonts((s) => s.setIndex);
  const index = useFonts((s) => s.index);
  const [loading, setLoading] = useState(false);
  const [folderMsg, setFolderMsg] = useState("");

  async function pickFonts() {
    setLoading(true);
    try {
      addFonts(await pickAndLoadFonts());
    } catch (err) {
      alert("Không nạp được font: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  async function pickFolder() {
    const folder = await open({ directory: true, multiple: false });
    if (typeof folder !== "string") return;
    setLoading(true);
    setFolderMsg("Đang quét kho font…");
    try {
      const r = await loadTemplateFontsFromFolder(folder);
      saveFontFolder(folder);
      addFonts(r.loaded);
      setIndex(r.entries);
      setFolderMsg(`Đã index ${r.total} font · chọn được cả kho · nạp ${r.loaded.length} cho template`);
    } catch (err) {
      setFolderMsg("Lỗi quét: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="panel-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button className="btn primary" onClick={pickFolder} disabled={loading}>
          <IconImagePlus />
          {loading ? "Đang xử lý…" : "Thêm thư mục font (kho)"}
        </button>
        <button className="btn" onClick={pickFonts} disabled={loading}>
          Thêm font lẻ
        </button>
        {folderMsg && <div className="folder-msg">{folderMsg}</div>}
        {!folderMsg && index.length > 0 && (
          <div className="folder-msg">Kho {index.length} font · chọn được khi sửa chữ</div>
        )}
      </div>

      {fonts.length > 0 && (
        <div className="panel-subbar">
          <span className="panel-count">{fonts.length} font đã nạp</span>
        </div>
      )}

      <div className="font-list">
        {fonts.map((f) => (
          <div className="font-row" key={f.family}>
            <div className="font-head">
              <span className="font-name">{f.family}</span>
              <span className={"font-tag" + (f.hasVietnamese ? " ok" : " no")}>
                {f.hasVietnamese ? "Có dấu" : "Thiếu dấu"}
              </span>
            </div>
            <div className="font-sample" style={{ fontFamily: `"${f.family}"` }}>
              Tình yêu — Áàảãạ Ăắ Êế Ôố Ưữ
            </div>
          </div>
        ))}
      </div>

      {fonts.length === 0 && !loading && (
        <div className="ip-empty">
          Bấm <b>Thêm font</b> để nạp font của bạn
          <br />
          (.ttf / .otf / .woff2)
        </div>
      )}
    </>
  );
}
