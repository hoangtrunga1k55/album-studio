import { useEffect, useState } from "react";
import { loadRecents, forgetRecent } from "../store/project";
import "./CustomMenuBar.css";

/** Last path segment (handles both \ and /). */
const baseName = (p: string) => p.replace(/[\\/]+$/, "").split(/[\\/]/).pop() || p;

/** Prefer a clean project name; fall back to the folder name when the stored
 *  "name" is actually a path (older recents stored the full path). */
const displayName = (name: string, path: string) =>
  name && !/[\\/]/.test(name) ? name : baseName(path);

/** Dark HTML menu bar (Windows) — replaces the light Win32 menu so File matches
 *  the app background. macOS keeps its native menu. Open Recent is a flyout
 *  submenu (mirrors the macOS File menu). */
export function CustomMenuBar({ onFile }: { onFile: (id: string) => void; onZoom?: (id: string) => void }) {
  const [open, setOpen] = useState<"file" | null>(null);
  const [recentOpen, setRecentOpen] = useState(false);
  const [tick, setTick] = useState(0); // bump to re-read recents after a remove
  const recents = open === "file" ? loadRecents() : [];
  void tick;

  useEffect(() => {
    if (!open) return;
    const close = () => { setOpen(null); setRecentOpen(false); };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [open]);

  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const fire = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen(null);
    setRecentOpen(false);
    fn();
  };

  return (
    <div className="cmenu" onClick={stop}>
      <button
        className={"cmenu-top" + (open === "file" ? " open" : "")}
        onClick={(e) => { e.stopPropagation(); setOpen(open === "file" ? null : "file"); }}
      >
        File
      </button>

      {open === "file" && (
        <div className="cmenu-drop" style={{ left: 0 }} onClick={stop}>
          <button className="cmenu-item" onClick={fire(() => onFile("file_new"))} onMouseEnter={() => setRecentOpen(false)}>
            <span>New Project…</span><kbd>Ctrl+N</kbd>
          </button>
          <button className="cmenu-item" onClick={fire(() => onFile("file_open"))} onMouseEnter={() => setRecentOpen(false)}>
            <span>Open Project…</span><kbd>Ctrl+O</kbd>
          </button>
          <div className="cmenu-sep" />

          {/* Open Recent → flyout submenu (macOS-style) */}
          <div
            className={"cmenu-item cmenu-sub" + (recentOpen ? " open" : "")}
            onMouseEnter={() => setRecentOpen(true)}
          >
            <span>Open Recent</span>
            <span className="cmenu-caret">›</span>
            {recentOpen && (
              <div className="cmenu-flyout" onClick={stop}>
                {recents.length === 0 ? (
                  <div className="cmenu-empty">(Empty)</div>
                ) : (
                  recents.slice(0, 12).map((r) => (
                    <div
                      key={r.path}
                      className="cmenu-recent-row"
                      title={r.path}
                      onClick={fire(() => onFile("recent:" + r.path))}
                    >
                      <span className="cmenu-recent-name">{displayName(r.name, r.path)}</span>
                      <button
                        className="cmenu-recent-x"
                        title="Remove from list"
                        onClick={(e) => {
                          e.stopPropagation();
                          forgetRecent(r.path);
                          setTick((n) => n + 1);
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <div className="cmenu-sep" />
          <button className="cmenu-item" onClick={fire(() => onFile("file_save"))} onMouseEnter={() => setRecentOpen(false)}>
            <span>Save</span><kbd>Ctrl+S</kbd>
          </button>
          <button className="cmenu-item" onClick={fire(() => onFile("file_save_as"))} onMouseEnter={() => setRecentOpen(false)}>
            <span>Save as Copy…</span><kbd>Ctrl+Shift+S</kbd>
          </button>
        </div>
      )}
    </div>
  );
}
