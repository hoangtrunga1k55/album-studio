import { useMemo, useState } from "react";
import { loadSystemFonts, missingFontNames } from "../engine/fontLibrary";
import { useFonts } from "../store/fonts";
import { IconSearch } from "../icons";
import "./FontPanel.css";

type Filter = "all" | "vn";
const LIST_CAP = 300;

/** Font manager — fonts come entirely from the machine's OS font folders.
 *  Browse/search the installed library and see which template fonts are still
 *  missing (so the user can install them). */
export function FontPanel() {
  const index = useFonts((s) => s.index);
  const setIndex = useFonts((s) => s.setIndex);
  const addFonts = useFonts((s) => s.addFonts);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  async function rescan() {
    setLoading(true);
    try {
      const r = await loadSystemFonts();
      addFonts(r.loaded);
      setIndex(r.entries);
    } catch (err) {
      alert("Couldn't scan system fonts: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  const missing = useMemo(() => missingFontNames(index), [index]);

  // De-duplicate the index by family for a clean browse list.
  const families = useMemo(() => {
    const seen = new Set<string>();
    const out: { family: string; vn: boolean }[] = [];
    for (const e of index) {
      if (seen.has(e.family)) continue;
      seen.add(e.family);
      out.push({ family: e.family, vn: e.hasVietnamese });
    }
    return out.sort((a, b) => a.family.localeCompare(b.family));
  }, [index]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return families.filter(
      (f) => (filter === "all" || f.vn) && (!s || f.family.toLowerCase().includes(s))
    );
  }, [families, q, filter]);

  const shown = filtered.slice(0, LIST_CAP);

  return (
    <>
      <div className="panel-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          className="btn primary"
          onClick={rescan}
          disabled={loading}
          title="Rescan the machine font folders — install a font pack then click to refresh"
        >
          {loading ? "Scanning…" : "⟳ Rescan system fonts"}
        </button>
        <div className="folder-msg">
          {index.length > 0
            ? `${families.length} fonts on this machine · used directly when editing text`
            : "No fonts found — install fonts then rescan"}
        </div>
      </div>

      {/* fonts the templates/typos need but the machine doesn't have */}
      {missing.length > 0 && (
        <div className="font-missing">
          <div className="fm-head">⚠ {missing.length} template fonts not installed</div>
          <div className="fm-hint">
            Install these fonts (Library/Fonts or Windows Fonts) then click{" "}
            <b>Rescan system fonts</b> — template text will render correctly.
          </div>
          <div className="fm-list">
            {missing.slice(0, 40).map((n) => (
              <span key={n} className="fm-chip">{n}</span>
            ))}
            {missing.length > 40 && <span className="fm-more">+{missing.length - 40}…</span>}
          </div>
        </div>
      )}

      <div className="ip-tools">
        <div className="search-wrap">
          <IconSearch width={15} height={15} />
          <input placeholder="Search fonts…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className="ip-filters">
        <button className={"ip-filter" + (filter === "all" ? " active" : "")} onClick={() => setFilter("all")}>
          All
        </button>
        <button className={"ip-filter" + (filter === "vn" ? " active" : "")} onClick={() => setFilter("vn")}>
          Vietnamese
        </button>
        <span className="panel-count" style={{ marginLeft: "auto" }}>
          {filtered.length} font
        </span>
      </div>

      <div className="font-list">
        {shown.map((f) => (
          <div className="font-row" key={f.family}>
            <div className="font-head">
              <span className="font-name">{f.family}</span>
              {!f.vn && <span className="font-tag no">No diacritics</span>}
            </div>
            {/* OS-installed → render preview by family name directly */}
            <div className="font-sample" style={{ fontFamily: `"${f.family}"` }}>
              Tình yêu — Áàảãạ Ăắ Êế Ôố Ưữ
            </div>
          </div>
        ))}
        {filtered.length > LIST_CAP && (
          <div className="fp-more">… {filtered.length - LIST_CAP} more fonts — type to filter</div>
        )}
        {index.length > 0 && filtered.length === 0 && (
          <div className="ip-empty">No fonts match “{q}”.</div>
        )}
      </div>

      {index.length === 0 && !loading && (
        <div className="ip-empty">
          Install fonts on the machine (Font Book / Windows Fonts)
          <br />
          then click <b>⟳ Rescan system fonts</b>.
        </div>
      )}
    </>
  );
}