import { useMemo, useState } from "react";
import { useFonts } from "../store/fonts";
import { loadFontFiles, registerLoaded } from "../ipc/fonts";
import "./FontPicker.css";

interface Item {
  name: string;
  path?: string;
  loaded: boolean;
}

/** Font selector over the whole library (5000+); loads a font on demand when picked. */
export function FontPicker({ value, onPick }: { value: string; onPick: (family: string) => void }) {
  const fonts = useFonts((s) => s.fonts);
  const index = useFonts((s) => s.index);
  const addFonts = useFonts((s) => s.addFonts);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  const families = useMemo<Item[]>(() => {
    const seen = new Set<string>();
    const out: Item[] = [];
    for (const f of fonts)
      if (!seen.has(f.family)) {
        seen.add(f.family);
        out.push({ name: f.family, loaded: true });
      }
    for (const e of index)
      if (!seen.has(e.family)) {
        seen.add(e.family);
        out.push({ name: e.family, path: e.path, loaded: false });
      }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [fonts, index]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (s ? families.filter((f) => f.name.toLowerCase().includes(s)) : families).slice(0, 120);
  }, [families, q]);

  async function pick(f: Item) {
    if (!f.loaded && f.path) {
      setBusy(true);
      try {
        const loaded = await loadFontFiles([f.path]);
        await Promise.all(loaded.map(registerLoaded));
        addFonts(loaded);
      } catch {
        /* ignore */
      }
      setBusy(false);
    }
    onPick(f.name);
    setOpen(false);
    setQ("");
  }

  return (
    <div className="fontpick">
      <button type="button" className="input fontpick-btn" onClick={() => setOpen((o) => !o)}>
        <span style={{ fontFamily: value ? `"${value}"` : undefined }}>{value || "(mặc định)"}</span>
        <span className="fp-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="fp-backdrop" onClick={() => setOpen(false)} />
          <div className="fontpick-pop">
            <input
              autoFocus
              className="input"
              placeholder="Tìm trong kho…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            <div className="fontpick-list">
              {filtered.map((f) => (
                <button type="button" key={f.name} className="fontpick-item" onClick={() => pick(f)}>
                  <span style={{ fontFamily: f.loaded ? `"${f.name}"` : undefined }}>{f.name}</span>
                  {!f.loaded && <span className="fp-tag">tải</span>}
                </button>
              ))}
              {filtered.length === 0 && <div className="fp-empty">Không thấy font</div>}
            </div>
            {busy && <div className="fp-busy">Đang tải font…</div>}
            <div className="fp-count">{families.length} font trong kho</div>
          </div>
        </>
      )}
    </div>
  );
}
