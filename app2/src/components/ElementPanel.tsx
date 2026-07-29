import { useEffect, useMemo, useState } from "react";
import {
  pickElementFolder,
  saveElementFolder,
  savedElementFolder,
  scanElementFolder,
} from "../ipc/elements";
import { fileUrl } from "../ipc/library";
import { elementFromItem, ensureElementImage } from "../engine/elements";
import { elementCategories, useElements } from "../store/elements";
import { useAlbum } from "../store/album";
import { ELEMENT_DND_KEY } from "../constants";
import "./ImagePanel.css";
import "./ElementPanel.css";

/** F3 — Element / Sticker library. Load a FOLDER of PNG/SVG assets (sub-folders
 *  = categories); drag or click a thumbnail to drop it onto the current spread. */
export function ElementPanel() {
  const elements = useElements((s) => s.elements);
  const setElements = useElements((s) => s.setElements);
  const addElement = useAlbum((s) => s.addElement);
  const [loading, setLoading] = useState(false);
  const [cat, setCat] = useState<string>("all");

  async function scan(path: string) {
    setLoading(true);
    try {
      const items = await scanElementFolder(path);
      setElements(items.map(elementFromItem));
    } catch (err) {
      alert("Couldn't load element folder: " + String(err));
    } finally {
      setLoading(false);
    }
  }

  // Restore the last-loaded folder on mount.
  useEffect(() => {
    const saved = savedElementFolder();
    if (saved && elements.length === 0) void scan(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function pick() {
    const path = await pickElementFolder();
    if (!path) return;
    saveElementFolder(path);
    await scan(path);
  }

  const cats = useMemo(() => elementCategories(elements), [elements]);
  const shown = cat === "all" ? elements : elements.filter((e) => e.category === cat);

  function place(id: string) {
    void ensureElementImage(id); // pixels load on first use
    addElement(id, 0.4, 0.4);
  }

  return (
    <>
      <div className="panel-actions" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button
          className="btn primary"
          onClick={pick}
          disabled={loading}
          title="Choose an element folder (transparent PNG/SVG) — each subfolder is a group"
        >
          {loading ? "Loading…" : "＋ Load element folder"}
        </button>
        <div className="folder-msg">
          {elements.length > 0
            ? `${elements.length} elements · drag/click to place on a spread`
            : "Not loaded — choose a PNG/SVG folder (ribbons, seals, florals, borders…)"}
        </div>
      </div>

      {cats.length > 1 && (
        <div className="ip-filters">
          <button className={"ip-filter" + (cat === "all" ? " active" : "")} onClick={() => setCat("all")}>
            All
          </button>
          {cats.map((c) => (
            <button
              key={c}
              className={"ip-filter" + (cat === c ? " active" : "")}
              onClick={() => setCat(c)}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      <div className="el-grid">
        {shown.map((e) => (
          <button
            key={e.id}
            className="el-cell"
            title={`${e.name} — drag or click to place`}
            draggable
            onDragStart={(ev) => ev.dataTransfer.setData(ELEMENT_DND_KEY, e.id)}
            onClick={() => place(e.id)}
          >
            <img className="el-thumb" src={fileUrl(e.path)} alt={e.name} loading="lazy" />
          </button>
        ))}
      </div>

      {elements.length === 0 && !loading && (
        <div className="ip-empty">
          Drag & drop decorative elements (ribbons, pins, seals, florals, borders…).
          <br />
          Click <b>＋ Load element folder</b> to choose a PNG/SVG folder.
        </div>
      )}
      {elements.length > 0 && shown.length === 0 && (
        <div className="ip-empty">No elements in this group.</div>
      )}
    </>
  );
}
