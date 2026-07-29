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
import { saveAlbumTemplate } from "../flows/albumTemplate";
import { useAlbum } from "../store/album";
import { IconClose } from "../icons";

/** One-stop setup: the three libraries the app needs (fonts from the machine,
 *  layout pack, typo pack). Reachable from the ⚙ button in the topbar. */
export function SettingsDialog({ onClose }: { onClose: () => void }) {
  const fontIndex = useFonts((s) => s.index);
  const setFontIndex = useFonts((s) => s.setIndex);
  const addFonts = useFonts((s) => s.addFonts);
  const layouts = useLibrary((s) => s.layouts);
  const typos = useLibrary((s) => s.typos);
  const spreadCount = useAlbum((s) => s.spreads.length);
  const [savedTpl, setSavedTpl] = useState(false);
  const [busy, setBusy] = useState<"font" | "layout" | "typo" | "sync-layout" | "sync-typo" | null>(null);
  const [msg, setMsg] = useState("");
  // online packs (GitHub Release) — the app only downloads what changed
  const [layoutUrl, setLayoutUrl] = useState(savedLayoutUrl() ?? "");
  const [typoUrl, setTypoUrl] = useState(savedTypoUrl() ?? "");
  const [prog, setProg] = useState<{ done: number; total: number } | null>(null);

  async function sync(kind: "layout" | "typo", url: string) {
    if (!url.trim()) {
      setMsg("Paste the pack's release link in the box above first.");
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
          ? `${kind} pack is already up to date (${r.kept} files).`
          : `Updated ${kind} pack: downloaded ${r.downloaded} new files, removed ${r.removed}, kept ${r.kept}.`
      );
    } catch (e) {
      setMsg("Update error: " + String(e));
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
      setMsg(`Machine fonts: ${r.entries.length} fonts · loaded ${r.loaded.length} for templates`);
    } catch (e) {
      setMsg("Font scan error: " + String(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickLayouts() {
    setBusy("layout");
    setMsg("");
    try {
      const ok = await importLayoutLibrary();
      if (ok) setMsg("Layout pack loaded.");
    } catch (e) {
      setMsg("Load layout pack error: " + String(e));
    } finally {
      setBusy(null);
    }
  }

  async function pickTypos() {
    setBusy("typo");
    setMsg("");
    try {
      const ok = await importTypoLibrary();
      if (ok) setMsg("Typo pack loaded.");
    } catch (e) {
      setMsg("Load typo pack error: " + String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: "min(560px, 94vw)" }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Settings · Resource libraries</h2>
          <button className="btn icon" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
          {/* ---- fonts ---- */}
          <div>
            <div className="prop-label">1 · Fonts (from your computer)</div>
            <div className="set-row">
              <span className="set-stat">
                {fontIndex.length > 0 ? `${fontIndex.length} fonts on machine` : "No fonts found"}
              </span>
              <button className="btn" onClick={rescanFonts} disabled={busy !== null}>
                {busy === "font" ? "Scanning…" : "⟳ Rescan"}
              </button>
            </div>
            {missing.length > 0 ? (
              <div className="set-warn">
                ⚠ {missing.length} template fonts not installed: {missing.slice(0, 6).join(", ")}
                {missing.length > 6 ? "…" : ""}
                <div className="hint-sm">
                  Install these fonts (Mac: Font Book · Windows: select file → right-click →
                  Install) then click Rescan.
                </div>
              </div>
            ) : (
              <div className="hint-sm">All fonts available for the templates in use.</div>
            )}
          </div>

          {/* ---- layout library ---- */}
          <div>
            <div className="prop-label">2 · Layout pack (Tizino)</div>
            <div className="set-row">
              <span className="set-stat">
                {layouts.length > 0
                  ? `${layouts.length} items · ${layoutCats.length} groups: ${layoutCats.join(", ")}`
                  : "Not loaded"}
              </span>
              <button className="btn" onClick={pickLayouts} disabled={busy !== null}>
                {busy === "layout" ? "Loading…" : layouts.length ? "Change folder…" : "Load pack…"}
              </button>
            </div>
            <div className="hint-sm">
              {savedLayoutLibrary() ?? "Choose the layout pack folder (each subfolder = 1 group: cover-25x35, layout-30x30…)"}
            </div>
            <div className="prop-row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Online pack link (GitHub Release)…"
                value={layoutUrl}
                onChange={(e) => setLayoutUrl(e.target.value)}
              />
              <button
                className="btn"
                onClick={() => sync("layout", layoutUrl)}
                disabled={busy !== null}
                title="Downloads only new/changed items — not the whole pack"
              >
                {busy === "sync-layout" ? "Downloading…" : "⟳ Update"}
              </button>
            </div>
          </div>

          {/* ---- typo library ---- */}
          <div>
            <div className="prop-label">3 · Typo pack</div>
            <div className="set-row">
              <span className="set-stat">
                {typos.length > 0
                  ? `${typos.length} typos · ${typoCats.length} groups: ${typoCats.join(", ")}`
                  : "Not loaded"}
              </span>
              <button className="btn" onClick={pickTypos} disabled={busy !== null}>
                {busy === "typo" ? "Loading…" : typos.length ? "Change folder…" : "Load pack…"}
              </button>
            </div>
            <div className="hint-sm">
              {savedTypoLibrary() ?? "Choose the typo pack folder (subfolder = group: vn, korea, fashion…)"}
            </div>
            <div className="prop-row" style={{ marginTop: 8 }}>
              <input
                className="input"
                placeholder="Online pack link (GitHub Release)…"
                value={typoUrl}
                onChange={(e) => setTypoUrl(e.target.value)}
              />
              <button
                className="btn"
                onClick={() => sync("typo", typoUrl)}
                disabled={busy !== null}
              >
                {busy === "sync-typo" ? "Downloading…" : "⟳ Update"}
              </button>
            </div>
          </div>

          {/* ---- album template (F5) ---- */}
          <div>
            <div className="prop-label">4 · Album template (saves the whole set, no photos)</div>
            <div className="set-row">
              <span className="set-stat">
                {spreadCount > 0 ? `${spreadCount} spreads — save the layout to reuse for other clients` : "No album yet"}
              </span>
              <button
                className="btn"
                disabled={spreadCount === 0}
                onClick={async () => {
                  const ok = await saveAlbumTemplate();
                  if (ok) {
                    setSavedTpl(true);
                    setTimeout(() => setSavedTpl(false), 2500);
                  }
                }}
              >
                Save as template…
              </button>
            </div>
            <div className="hint-sm">
              {savedTpl
                ? "✓ Album template saved."
                : "Keeps layout + text + typo + elements + backgrounds, drops client photos. Create a new album from a template on the home screen."}
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
            Done
          </button>
        </div>
      </div>
    </div>
  );
}