import { useEffect, useState } from "react";
import { loadRecents } from "../store/project";
import "./CustomMenuBar.css";

/** Dark HTML menu bar (Windows) — replaces the light Win32 menu so File/View
 *  match the app background. macOS keeps its native menu. */
export function CustomMenuBar({
  onFile,
  onZoom,
}: {
  onFile: (id: string) => void;
  onZoom: (id: string) => void;
}) {
  const [open, setOpen] = useState<"file" | "view" | null>(null);
  const recents = open === "file" ? loadRecents() : [];

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const fire = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(null);
    fn();
  };

  return (
    <div className="cmenu" onClick={stop}>
      <button
        className={"cmenu-top" + (open === "file" ? " open" : "")}
        onClick={(e) => { e.stopPropagation(); setOpen(open === "file" ? null : "file"); }}
        onMouseEnter={() => open && setOpen("file")}
      >
        File
      </button>
      <button
        className={"cmenu-top" + (open === "view" ? " open" : "")}
        onClick={(e) => { e.stopPropagation(); setOpen(open === "view" ? null : "view"); }}
        onMouseEnter={() => open && setOpen("view")}
      >
        View
      </button>

      {open === "file" && (
        <div className="cmenu-drop" style={{ left: 0 }} onClick={stop}>
          <button className="cmenu-item" onClick={fire(() => onFile("file_new"))}>
            <span>New Project…</span><kbd>Ctrl+N</kbd>
          </button>
          <button className="cmenu-item" onClick={fire(() => onFile("file_open"))}>
            <span>Open Project…</span><kbd>Ctrl+O</kbd>
          </button>
          <div className="cmenu-sep" />
          <div className="cmenu-label">Open Recent</div>
          {recents.length === 0 ? (
            <div className="cmenu-empty">(Empty)</div>
          ) : (
            recents.slice(0, 8).map((r) => (
              <button
                key={r.path}
                className="cmenu-item"
                title={r.path}
                onClick={fire(() => onFile("recent:" + r.path))}
              >
                <span className="cmenu-recent">{r.name}</span>
              </button>
            ))
          )}
          <div className="cmenu-sep" />
          <button className="cmenu-item" onClick={fire(() => onFile("file_save"))}>
            <span>Save</span><kbd>Ctrl+S</kbd>
          </button>
          <button className="cmenu-item" onClick={fire(() => onFile("file_save_as"))}>
            <span>Save as Copy…</span><kbd>Ctrl+Shift+S</kbd>
          </button>
        </div>
      )}

      {open === "view" && (
        <div className="cmenu-drop" style={{ left: 44 }} onClick={stop}>
          <button className="cmenu-item" onClick={fire(() => onZoom("zoom_in"))}>
            <span>Zoom In</span><kbd>Ctrl+=</kbd>
          </button>
          <button className="cmenu-item" onClick={fire(() => onZoom("zoom_out"))}>
            <span>Zoom Out</span><kbd>Ctrl+-</kbd>
          </button>
          <button className="cmenu-item" onClick={fire(() => onZoom("zoom_fit"))}>
            <span>Fit to View</span><kbd>Ctrl+0</kbd>
          </button>
          <button className="cmenu-item" onClick={fire(() => onZoom("zoom_100"))}>
            <span>Actual Print Size</span><kbd>Ctrl+1</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
