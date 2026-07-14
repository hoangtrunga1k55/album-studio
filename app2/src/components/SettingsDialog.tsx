import { useState } from "react";
import { loadSystemFonts, missingFontNames } from "../engine/fontLibrary";
import { importLayoutLibrary, importTypoLibrary, syncPackFromRelease } from "../flows/typoImport";
import {
  savedLayoutLibrary,
  savedLayoutUrl,
  savedTypoLibrary,
  savedTypoUrl,
} from "../ipc/library";
import { useFonts } from "../store/fonts";
import { categoriesOf, useLibrary } from "../store/library";
import { IconClose } from "../icons";

/** One-stop setup: the three libraries the app needs (fonts from the machine,
 *  layout pack, typo pack). Reachable from the ⚙ button in the topbar. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const fontIndex = useFonts((s) => s.index);
  const setFontIndex = useFonts((s) => s.setIndex);
  const addFonts = useFonts((s) => s.addFonts);
  const layouts = useLibrary((s) => s.layouts);
  const typos = useLibrary((s) => s.typos);
  const [busy, setBusy] = useState<"font" | "layout" | "typo" | "sync-layout" | "sync-typo" | null>(null);
  const [msg, setMsg] = useState("");
  // online packs (GitHub Release) — the app only downloads what changed
  const [layoutUrl, setLayoutUrl] = useState(savedLayoutUrl() ?? "");
  const [typoUrl, setTypoUrl] = useState(savedTypoUrl() ?? "");
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);

  async function sync(kind: "layout" | "typo", url: string) {
    if (!url.trim()) {
      setMsg("Dán link release của kho vào ô bên trên trước.");
      return;
    }
    setBusy(kind === "layout" ? "sync-layout" : "sync-typo");
    setMsg("");
    setProg({ done: 0, total: 0 });
    try {
      const r = await syncPackFromRelease(kind, url.trim(), (done, total) =>
        setProg({ done, total })
      );
      setMsg(
        r.downloaded === 0 && r.removed === 0
          ? `Kho ${kind} đã là bản mới nhất (${r.kept} file).`
          : `Cập nhật kho ${kind}: tải ${r.downloaded} file mới, gỡ ${r.removed}, giữ ${r.kept}.`
      );
    } catch (e) {
      setMsg("Lỗi cập nhật: " + String(e));
    } finally {
      setBusy(null);
      setProg(null);
    }
  }

  const missing = missingFontNames(fontIndex);
  const layoutCats = categoriesOf(layouts);
  const typoCats = categoriesOf(typos);

  async function rescanFonts() {
    setBusy("font");
    setMsg("");
    try {
      const r = await loadSystemFonts();
      addFonts(r.loaded);
      setFontIndex(r.entries);
      setMsg(`Font máy: ${r.entries.length} font · nạp ${r.loaded.length} cho mẫu`);
    } catch (e) {
      setMsg("Lỗi quét font: " + String(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickLayouts() {
    setBusy("layout");
    setMsg("");
    try {
      const ok = await importLayoutLibrary();
      if (ok) setMsg("Đã nạp kho layout.");
    } catch (e) {
      setMsg("Lỗi nạp kho layout: " + String(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickTypos() {
    setBusy("typo");
    setMsg("");
    try {
      const ok = await importTypoLibrary();
      if (ok) setMsg("Đã nạp kho typo.");
    } catch (e) {
      setMsg("Lỗi nạp kho typo: " + String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(560px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Cài đặt · Kho tài nguyên</h2>
          <button className="btn icon" onClick={onClose} aria-label="Đóng">
            <IconClose />
          </button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* ---- fonts ---- */}
          <div>
            <div className="prop-label">1 · Font (lấy từ máy tính)</div>
            <div className="set-row">
              <span className="set-stat">
                {fontIndex.length > 0 ? `${fontIndex.length} font trên máy` : "Chưa thấy font"}
              </span>
              <button className="btn" onClick={rescanFonts} disabled={busy !== null}>
                {busy === "font" ? "Đang quét…" : "⟳ Quét lại"}
              </button>
            </div>
            {missing.length > 0 ? (
              <div className="set-warn">
                ⚠ {missing.length} font mẫu chưa cài trên máy: {missing.slice(0, 6).join(", ")}
                {missing.length > 6 ? "…" : ""}
                <div className="hint-sm">
                  Cài các font này vào máy (Mac: Font Book · Windows: chọn file → chuột phải →
                  Install) rồi bấm Quét lại.
                </div>
              </div>
            ) : (
              <div className="hint-sm">Đủ font cho các mẫu đang dùng.</div>
            )}
          </div>

          {/* ---- layout library ---- */}
          <div>
            <div className="prop-label">2 · Kho layout (Tizino)</div>
            <div className="set-row">
              <span className="set-stat">
                {layouts.length > 0
                  ? `${layouts.length} mẫu · ${layoutCats.length} nhóm: ${layoutCats.join(", ")}`
                  : "Chưa nạp"}
              </span>
              <button className="btn" onClick={pickLayouts} disabled={busy !== null}>
                {busy === "layout" ? "Đang nạp…" : layouts.length ? "Đổi thư mục…" : "Nạp kho…"}
              </button>
            </div>
            <div className="hint-sm">
              {savedLayoutLibrary() ?? "Chọn thư mục kho layout (mỗi thư mục con = 1 nhóm: cover-25x35, layout-30x30…)"}
            </div>
            <div className="prop-row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Link kho trên mạng (GitHub Release)…"
                value={layoutUrl}
                onChange={(e) => setLayoutUrl(e.target.value)}
              />
              <button
                className="btn"
                onClick={() => sync("layout", layoutUrl)}
                disabled={busy !== null}
                title="Chỉ tải mẫu mới/đã đổi — không tải lại cả kho"
              >
                {busy === "sync-layout" ? "Đang tải…" : "⟳ Cập nhật"}
              </button>
            </div>
          </div>

          {/* ---- typo library ---- */}
          <div>
            <div className="prop-label">3 · Kho typo</div>
            <div className="set-row">
              <span className="set-stat">
                {typos.length > 0
                  ? `${typos.length} typo · ${typoCats.length} nhóm: ${typoCats.join(", ")}`
                  : "Chưa nạp"}
              </span>
              <button className="btn" onClick={pickTypos} disabled={busy !== null}>
                {busy === "typo" ? "Đang nạp…" : typos.length ? "Đổi thư mục…" : "Nạp kho…"}
              </button>
            </div>
            <div className="hint-sm">
              {savedTypoLibrary() ?? "Chọn thư mục kho typo (thư mục con = nhóm: vn, korea, fashion…)"}
            </div>
            <div className="prop-row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Link kho trên mạng (GitHub Release)…"
                value={typoUrl}
                onChange={(e) => setTypoUrl(e.target.value)}
              />
              <button
                className="btn"
                onClick={() => sync("typo", typoUrl)}
                disabled={busy !== null}
              >
                {busy === "sync-typo" ? "Đang tải…" : "⟳ Cập nhật"}
              </button>
            </div>
          </div>

          {prog && prog.total > 0 && (
            <div className="ip-progress" style={{ padding: 0 }}>
              <div className="bar">
                <div className="fill" style={{ width: `${(prog.done / prog.total) * 100}%` }} />
              </div>
              <span>
                {prog.done}/{prog.total}
              </span>
            </div>
          )}
          {msg && <div className="ok-msg">{msg}</div>}
        </div>

        <div className="modal-foot">
          <button className="btn primary" onClick={onClose}>
            Xong
          </button>
        </div>
      </div>
    </div>
  );
}