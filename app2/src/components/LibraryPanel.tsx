/** Left-dock resource browser (TIZINO-style "kho"): one grid of thumbnails per
 *  resource kind — ALBUM layouts / TYPO / ELEMENT — filtered by category.
 *  Clicking a cell drops that trained asset onto the current spread:
 *   - ALBUM  → applies the layout to the current spread (photos kept)
 *   - TYPO   → inserts the typo design
 *   - ELEMENT→ adds the sticker/element */

import { useState } from "react";
import { useAlbum } from "../store/album";
import { useLibrary } from "../store/library";
import { useTypos } from "../store/typos";
import { useElements } from "../store/elements";
import { fileUrl, type LayoutItem } from "../ipc/library";
import { pickElementFolder, saveElementFolder } from "../ipc/elements";
import { ensureTypoDeco } from "../engine/typos";
import { ensureElementImage } from "../engine/elements";
import { ensureLibraryTemplate } from "../flows/libraryLayout";
import { loadElementLibrary } from "../flows/typoImport";
import "./LibraryPanel.css";

type Kind = "album" | "typo" | "element";

const KINDS: { id: Kind; label: string }[] = [
  { id: "album", label: "ALBUM" },
  { id: "typo", label: "TYPO" },
  { id: "element", label: "ELEMENT" },
];

const distinctCats = (items: { category?: string }[]) =>
  [...new Set(items.map((i) => i.category || "khac"))].sort((a, b) => a.localeCompare(b));

export function LibraryPanel() {
  const [kind, setKind] = useState<Kind>("album");
  const [cat, setCat] = useState<string>("");

  const layouts = useLibrary((s) => s.layouts);
  const typos = useTypos((s) => s.typos);
  const elements = useElements((s) => s.elements);
  const applyTemplate = useAlbum((s) => s.applyTemplate);
  const addTypo = useAlbum((s) => s.addTypo);
  const addElement = useAlbum((s) => s.addElement);
  const hasAlbum = useAlbum((s) => s.size !== null && s.spreads.length > 0);
  const [elBusy, setElBusy] = useState(false);

  const pickKind = (k: Kind) => setKind(k);

  /** Inserting into a spread needs an album — guard so a click before creating
   *  one shows a friendly message instead of breaking the canvas. */
  function requireAlbum(): boolean {
    if (hasAlbum) return true;
    alert("Vui lòng tạo album trước khi thêm layout / typo / element.");
    return false;
  }

  /** Element library has no Settings entry — load its folder from here. */
  async function loadElements() {
    const p = await pickElementFolder();
    if (!p) return;
    setElBusy(true);
    try {
      saveElementFolder(p);
      await loadElementLibrary(p);
    } catch (err) {
      alert("Couldn't load element folder: " + String(err));
    } finally {
      setElBusy(false);
    }
  }

  async function pickLayout(item: LayoutItem) {
    if (!requireAlbum()) return;
    const t = await ensureLibraryTemplate(item);
    if (t) applyTemplate(t.id);
  }

  // Group the active kind's items by category → one section each (items in a
  // category share an aspect, so thumbnails show FULL, aligned, no letterbox).
  const catOf = (c?: string) => c || "khac";
  const cats =
    kind === "album"
      ? distinctCats(layouts)
      : kind === "typo"
        ? distinctCats(typos)
        : distinctCats(elements);
  const isEmpty =
    kind === "album" ? layouts.length === 0 : kind === "typo" ? typos.length === 0 : elements.length === 0;
  // selected category tab (fall back to the first available)
  const activeCat = cats.includes(cat) ? cat : cats[0] ?? "";

  const renderCell = (c: string) => {
    if (kind === "album") {
      return layouts
        .filter((l) => catOf(l.category) === c)
        .map((l) => (
          <button
            key={l.id}
            className="kho-cell album"
            title={`${l.name} · ${l.slotCount} slots`}
            onClick={() => void pickLayout(l)}
          >
            {l.thumbPath ? (
              <img src={fileUrl(l.thumbPath)} alt={l.name} draggable={false} />
            ) : (
              <span className="kho-ph">{l.slotCount}</span>
            )}
          </button>
        ));
    }
    if (kind === "typo") {
      return typos
        .filter((t) => catOf(t.category) === c)
        .map((t) => (
          <button
            key={t.id}
            className="kho-cell"
            title={t.category ?? ""}
            onClick={() => {
              if (!requireAlbum()) return;
              void ensureTypoDeco(t.id);
              addTypo(t.id, 0.34, 0.4);
            }}
          >
            <img src={t.preview} alt="" loading="lazy" draggable={false} />
          </button>
        ));
    }
    return elements
      .filter((e) => catOf(e.category) === c)
      .map((e) => (
        <button
          key={e.id}
          className="kho-cell checker"
          title={e.name}
          onClick={() => {
            if (!requireAlbum()) return;
            void ensureElementImage(e.id);
            addElement(e.id, 0.4, 0.4);
          }}
        >
          <img src={fileUrl(e.path)} alt="" loading="lazy" draggable={false} />
        </button>
      ));
  };

  return (
    <div className="kho">
      {/* resource kind */}
      <div className="kho-kinds">
        {KINDS.map((k) => (
          <button
            key={k.id}
            className={"kho-kind" + (kind === k.id ? " active" : "")}
            onClick={() => pickKind(k.id)}
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* element library loads its own folder (no Settings entry) */}
      {kind === "element" && (
        <div className="kho-load">
          <button className="btn" onClick={loadElements} disabled={elBusy}>
            {elBusy ? "Loading…" : elements.length ? "＋ Change element folder" : "＋ Load element folder"}
          </button>
        </div>
      )}

      {isEmpty ? (
        <div className="kho-empty">
          {kind === "element"
            ? "No elements yet. Load a PNG/SVG folder (ribbons, seals, florals…) above."
            : "No " + kind + " assets yet. Import a pack folder in ⚙ Settings."}
        </div>
      ) : (
        <>
          {/* category tabs (no "All") */}
          <div className="kho-cats">
            {cats.map((c) => (
              <button
                key={c}
                className={"kho-cat" + (c === activeCat ? " active" : "")}
                onClick={() => setCat(c)}
                title={c}
              >
                {c.replace(/[-_]+/g, " ").toUpperCase()}
              </button>
            ))}
          </div>
          <div className="kho-scroll">
            <div className={"kho-grid" + (kind === "album" ? " album" : "")}>{renderCell(activeCat)}</div>
          </div>
        </>
      )}
    </div>
  );
}