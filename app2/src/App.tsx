import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";

const clampN = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function loadPx(key: string, def: number): number {
  const v = parseInt(localStorage.getItem(key) ?? "", 10);
  return Number.isFinite(v) ? v : def;
}

/** Drag bar between panels — reports mouse deltas while held. */
function ResizeHandle({
  className,
  onMove,
}: {
  className: string;
  onMove: (dx: number, dy: number) => void;
}) {
  return (
    <div
      className={className}
      onMouseDown={(e) => {
        e.preventDefault();
        let px = e.clientX;
        let py = e.clientY;
        const mm = (ev: MouseEvent) => {
          onMove(ev.clientX - px, ev.clientY - py);
          px = ev.clientX;
          py = ev.clientY;
        };
        const mu = () => {
          window.removeEventListener("mousemove", mm);
          window.removeEventListener("mouseup", mu);
        };
        window.addEventListener("mousemove", mm);
        window.addEventListener("mouseup", mu);
      }}
    />
  );
}
import { Welcome } from "./components/Welcome";
import { LeftPanel } from "./components/LeftPanel";
import { SpreadCanvas } from "./components/SpreadCanvas";
import { SpreadsFilmstrip } from "./components/SpreadsFilmstrip";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { PhotoTray } from "./components/PhotoTray";
import { TooltipLayer } from "./components/TooltipLayer";
import { LayoutDock } from "./components/LayoutStrip";
import { ExportDialog } from "./components/ExportDialog";
import { AutoDesignDialog } from "./components/AutoDesignDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { FlipShow } from "./components/FlipShow";
import { getTemplate } from "./engine/templates";
import { restoreLibraries } from "./flows/typoImport";
import { openProject, saveAsCopy, saveNow, startAutosave } from "./flows/projectIO";
import { importDroppedFiles } from "./ipc/import";
import { useAlbum } from "./store/album";
import { syncRecentMenu, useProject } from "./store/project";
import { clearHistory, initHistory, redo, undo } from "./store/history";
import { IconExport, IconFlip, IconLayout, IconSettings, IconSparkle } from "./icons";
import { mod } from "./engine/platform";
import "./App.css";

function App() {
  const projectPath = useProject((s) => s.path);
  const projectName = useProject((s) => s.name);
  const saveState = useProject((s) => s.saveState);
  const closeProject = useProject((s) => s.closeProject);

  const size = useAlbum((s) => s.size);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const images = useAlbum((s) => s.images);
  const resetAlbum = useAlbum((s) => s.resetAlbum);
  const spreadSelected = useAlbum((s) => s.spreadSelected);
  const selectedSlot = useAlbum((s) => s.selectedSlot);
  const selectedText = useAlbum((s) => s.selectedText);
  const selectedTypo = useAlbum((s) => s.selectedTypo);
  const selectedElement = useAlbum((s) => s.selectedElement);
  const multiSel = useAlbum((s) => s.multiSel);
  const layoutDock = useAlbum((s) => s.layoutDockOpen);
  const importing = useAlbum((s) => s.importing);
  const setLayoutDock = useAlbum((s) => s.setLayoutDock);
  const addImages = useAlbum((s) => s.addImages);
  const [showExport, setShowExport] = useState(false);
  const [showDesign, setShowDesign] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showFlip, setShowFlip] = useState(false);
  const [dropping, setDropping] = useState(false);

  // Resizable panels (drag bars) — remembered across sessions.
  const [trayH, setTrayH] = useState(() => loadPx("albumstudio2.ui.trayH", 190));
  const [propsW, setPropsW] = useState(() => loadPx("albumstudio2.ui.propsW", 240));
  const [leftW, setLeftW] = useState(() => loadPx("albumstudio2.ui.leftW", 300));
  const [leftOpen, setLeftOpen] = useState(
    () => localStorage.getItem("albumstudio2.ui.leftOpen") === "1"
  );
  const [trayMin, setTrayMin] = useState(
    () => localStorage.getItem("albumstudio2.ui.trayMin") === "1"
  );
  const [propsMin, setPropsMin] = useState(
    () => localStorage.getItem("albumstudio2.ui.propsMin") === "1"
  );
  useEffect(() => localStorage.setItem("albumstudio2.ui.trayH", String(trayH)), [trayH]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.propsW", String(propsW)), [propsW]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.leftW", String(leftW)), [leftW]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.leftOpen", leftOpen ? "1" : "0"), [leftOpen]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.trayMin", trayMin ? "1" : "0"), [trayMin]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.propsMin", propsMin ? "1" : "0"), [propsMin]);

  // Editor collapsed + the user selects something on the canvas (photo, layout,
  // text, typo, element, group) → pop the editor open. PropertiesPanel already
  // points itself at the matching tab. Only a NEW selection reopens it, so the
  // user can still close it while a selection stays active.
  useEffect(() => {
    const hasSel =
      selectedSlot !== null ||
      !!selectedText ||
      selectedTypo !== null ||
      selectedElement !== null ||
      spreadSelected ||
      multiSel.length > 0;
    if (hasSel) setPropsMin(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSlot, selectedText, selectedTypo, selectedElement, spreadSelected, multiSel]);

  // Restore imported packs (layout + typo) — metadata only, thumbnails stay on
  // disk. OS-font scanning was removed: template/typo/added text now render with
  // the webview's default font family.
  useEffect(() => {
    void restoreLibraries().catch(() => {});
  }, []);

  // Drag images from Finder/Explorer straight into the window to add them. OS
  // file drops carry a "Files" type — internal HTML5 drags (panel→slot, tray
  // reorder) never do, so those are left untouched (dragDropEnabled stays off).
  useEffect(() => {
    const hasFiles = (dt: DataTransfer | null) =>
      !!dt && Array.from(dt.types || []).includes("Files");
    const onOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      setDropping(true);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      setDropping(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      void importDroppedFiles(files, (ev) => {
        if (ev.kind === "image") {
          const { kind, ...meta } = ev;
          void kind;
          addImages([meta]);
        }
      }).catch((err) => alert("Import dropped images error: " + String(err)));
    };
    const onLeave = (e: DragEvent) => {
      if (e.relatedTarget === null) setDropping(false);
    };
    window.addEventListener("dragover", onOver);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragleave", onLeave);
    return () => {
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragleave", onLeave);
    };
  }, [addImages]);

  // Kill the webview's native right-click menu (Open Image / Download / Inspect
  // …) everywhere — our own context menus handle right-click. Text fields keep
  // theirs so copy/paste still works.
  useEffect(() => {
    const onCtx = (e: MouseEvent) => {
      // Dev: keep the native menu (Reload / Inspect Element). Shift+right-click
      // is an escape hatch to the native menu in any build.
      if (import.meta.env.DEV || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
    };
    window.addEventListener("contextmenu", onCtx);
    return () => window.removeEventListener("contextmenu", onCtx);
  }, []);

  // Tauri doesn't wire Cmd/Ctrl+R to reload like a browser — bind it ourselves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        window.location.reload();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Autosave for the lifetime of the app.
  useEffect(() => startAutosave(), []);
  // App-level Undo/Redo history (⌘Z / ⌘⇧Z) — effect cleanup unsubscribes so
  // a remount always re-wires onto the live store.
  useEffect(() => initHistory(), []);

  // ONE dispatcher for both entrances (native menu event + JS keydown): the
  // 350ms guard stops double-fire when an OS accelerator AND the webview both
  // deliver the same combo (possible on Windows).
  const lastMenuRun = useRef<Record<string, number>>({});
  const menuAction = (id: string) => {
    // undo/redo are stepped rapidly (⌘Z ⌘Z ⌘Z…) — the double-fire guard would
    // swallow the repeats and look broken; a tiny 80ms guard still kills the
    // Windows accelerator+keydown double without hurting fast stepping.
    const guardMs = id === "app_undo" || id === "app_redo" ? 80 : 350;
    const now = Date.now();
    if (now - (lastMenuRun.current[id] ?? 0) < guardMs) return;
    lastMenuRun.current[id] = now;
    if (id === "app_undo" || id === "app_redo") {
      // inside a text field the NATIVE text undo must win, not the app history
      const el = document.activeElement as HTMLElement | null;
      const editing =
        el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (editing) {
        document.execCommand(id === "app_undo" ? "undo" : "redo");
      } else if (id === "app_undo") {
        undo();
      } else {
        redo();
      }
    } else if (id === "file_save") {
      void saveNow();
    } else if (id === "file_save_as") {
      void saveAsCopy().catch((err) => alert("Save copy error: " + String(err)));
    } else if (id === "file_new") {
      void (async () => {
        await saveNow();
        useProject.getState().requestWizard(true);
        useProject.getState().closeProject();
        useAlbum.getState().resetAlbum();
        clearHistory();
      })();
    } else if (id === "file_open") {
      void (async () => {
        await saveNow();
        await openProject().catch((err) => alert("Couldn't open project: " + String(err)));
      })();
    } else if (id.startsWith("recent:")) {
      const p = id.slice("recent:".length);
      void (async () => {
        await saveNow();
        await openProject(p).catch((err) => alert("Couldn't open project: " + String(err)));
      })();
    }
  };
  const menuActionRef = useRef(menuAction);
  menuActionRef.current = menuAction;

  // Native menu (Tệp/Xem trên macOS & Windows) → menu-cmd events.
  useEffect(() => {
    syncRecentMenu(); // đổ danh sách "Mở gần đây" vào menu ngay khi app mở
    const un = listen<string>("menu-cmd", (e) => menuActionRef.current(e.payload));
    return () => {
      void un.then((f) => f());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Q = 3D show (no modifier) — but never while typing in a field.
      if (!e.metaKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "q") {
        const el = document.activeElement as HTMLElement | null;
        const editing =
          el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
        if (!editing && useAlbum.getState().spreads.length) {
          e.preventDefault();
          setShowFlip((v) => !v);
        }
        return;
      }
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z") {
        const el = document.activeElement as HTMLElement | null;
        const editing =
          el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
        if (editing) return; // native text undo trong ô chữ
        e.preventDefault();
        menuActionRef.current(e.shiftKey ? "app_redo" : "app_undo");
      } else if (k === "y") {
        // Windows quen Ctrl+Y = redo
        e.preventDefault();
        menuActionRef.current("app_redo");
      } else if (k === "s") {
        e.preventDefault();
        menuActionRef.current(e.shiftKey ? "file_save_as" : "file_save");
      } else if (k === "e") {
        e.preventDefault();
        setShowExport(true);
      } else if (k === "d") {
        e.preventDefault();
        if (e.shiftKey) useAlbum.getState().redesignSpread();
        else if (!useAlbum.getState().importing) setShowDesign(true);
      } else if (k === "b") {
        e.preventDefault();
        useAlbum.getState().toggleBleed();
      } else if (k === "r") {
        e.preventDefault();
        useAlbum.getState().toggleRuler();
      } else if (k === "n") {
        e.preventDefault();
        menuActionRef.current("file_new");
      } else if (k === "o") {
        e.preventDefault();
        menuActionRef.current("file_open");
      } else if (e.key === "=" || e.key === "+" || e.code === "Equal" || e.code === "NumpadAdd") {
        // match the PHYSICAL key too — Vietnamese input methods / numpads can
        // report a different e.key and the shortcut silently died
        e.preventDefault();
        const z = useAlbum.getState().viewZoom;
        useAlbum.getState().setViewZoom(Math.min(4, z * 1.25));
      } else if (e.key === "-" || e.code === "Minus" || e.code === "NumpadSubtract") {
        e.preventDefault();
        const z = useAlbum.getState().viewZoom;
        useAlbum.getState().setViewZoom(Math.max(1, z / 1.25));
      } else if (e.key === "0" || e.code === "Digit0" || e.code === "Numpad0") {
        e.preventDefault();
        useAlbum.getState().setViewZoom(1);
      } else if (e.key === "1" || e.code === "Digit1" || e.code === "Numpad1") {
        // 100% = real print size — the canvas owns the math, so just signal it
        e.preventDefault();
        window.dispatchEvent(new Event("albumstudio:zoom100"));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Zoom shortcuts arrive as NATIVE events (lib.rs): macOS qua menu accelerator,
  // Windows qua RegisterHotKey khi cửa sổ focus — bộ gõ không chặn được.
  useEffect(() => {
    const un = listen<string>("zoom-cmd", (e) => {
      const st = useAlbum.getState();
      if (e.payload === "zoom_in") st.setViewZoom(Math.min(4, st.viewZoom * 1.25));
      else if (e.payload === "zoom_out") st.setViewZoom(Math.max(1, st.viewZoom / 1.25));
      else if (e.payload === "zoom_fit") st.setViewZoom(1);
      else if (e.payload === "zoom_100") window.dispatchEvent(new Event("albumstudio:zoom100"));
    });
    return () => {
      void un.then((f) => f());
    };
  }, []);

  async function backToWelcome() {
    await saveNow();
    closeProject();
    resetAlbum();
  }

  if (!projectPath || !size)
    return (
      <>
        <Welcome />
        <TooltipLayer />
      </>
    );

  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);
  const saveLabel =
    saveState === "saved" ? "Saved" : saveState === "error" ? "Save error!" : "Saving…";

  return (
    <div className="app">
      <TooltipLayer />
      <header className="topbar">
        <div className="topleft">
          <div className="brand">
            <div className="brand-mark" onClick={backToWelcome} title="Back to home">
              A
            </div>
            <div className="brand-text">
              <div className="name">{projectName}</div>
              <div className="sub">
                {size} · {spreads.length} spread ·{" "}
                <span className={saveState === "error" ? "save-err" : ""}>{saveLabel}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="toolbar">
          <div className="toolbar-row">
            <button
              className={"tbtn" + (layoutDock ? " active" : "")}
              title="Layout (click again to close)"
              onClick={() => setLayoutDock(!layoutDock)}
            >
              <IconLayout />
            </button>
          </div>
          <div className="toolbar-status">
            {spreads.length} spread ({spreads.length * 2} trang) ·{" "}
            {new Set(spreads.flatMap((sp) => sp.imageIds.filter(Boolean))).size}/{images.length} photos used{tpl ? ` · ${tpl.name}` : ""}
          </div>
        </div>

        <div className="topright">
          <button
            className="btn"
            onClick={() => setShowDesign(true)}
            disabled={!images.length || importing}
            title={importing ? "Importing photos — wait to finish before Auto Design" : `Auto-build the album (${mod("D")})`}
          >
            <IconSparkle />
            {importing ? "Importing photos…" : "Auto Design"}
          </button>
          <button
            className="btn"
            onClick={() => setShowFlip(true)}
            disabled={!spreads.length}
            title="Client view — 3D album flip (Q)"
          >
            <IconFlip />
            3D Show
          </button>
          <button className="btn primary" onClick={() => setShowExport(true)}>
            <IconExport />
            Export album
          </button>
          <button
            className="btn icon"
            title="Settings · load font / layout / typo packs"
            onClick={() => setShowSettings(true)}
          >
            <IconSettings />
          </button>
        </div>
      </header>

      {/* right editing panel claims a FULL-HEIGHT column; the left stack (canvas
          + photo tray) shares only the remaining width so the tray never runs
          under the panel. Collapsing the panel gives that width back. */}
      <div className="main">
        <div className="left-stack">
          <div className="body">
            {leftOpen ? (
              <div className="left-host" style={{ width: leftW }}>
                <ResizeHandle
                  className="rz rz-v-left"
                  onMove={(dx) => setLeftW((w) => clampN(w + dx, 220, 520))}
                />
                <button
                  className="left-min"
                  onClick={() => setLeftOpen(false)}
                  title="Collapse library"
                >
                  ‹
                </button>
                <LeftPanel />
              </div>
            ) : (
              <button className="left-restore" onClick={() => setLeftOpen(true)} title="Open library">
                Library ›
              </button>
            )}
            <div className="center">
              {layoutDock && <LayoutDock onClose={() => setLayoutDock(false)} />}
              <div className="workzone">
                <SpreadCanvas />
              </div>
              {!spreadSelected && <SpreadsFilmstrip />}
            </div>
          </div>
          {/* the photo tray yields its space while the layout dock is open */}
          {!layoutDock &&
            (trayMin ? (
              <button className="tray-restore" onClick={() => setTrayMin(false)} title="Open photo tray">
                ▴ Photos ({images.length})
              </button>
            ) : (
              <div className="photo-tray-host" style={{ height: trayH }}>
                <ResizeHandle
                  className="rz rz-h"
                  onMove={(_, dy) => setTrayH((h) => clampN(h - dy, 110, 460))}
                />
                <button
                  className="tray-min"
                  title="Collapse photo tray"
                  onClick={() => setTrayMin(true)}
                >
                  −
                </button>
                <PhotoTray />
              </div>
            ))}
        </div>
        {/* editing panel: collapsible to a slim rail — the canvas re-measures
            itself (ResizeObserver) so the spread just re-centers, never breaks */}
        {propsMin ? (
          <button className="props-restore" onClick={() => setPropsMin(false)} title="Open editor panel">
            ‹ Editor
          </button>
        ) : (
          <div className="props-host" style={{ width: propsW }}>
            <ResizeHandle
              className="rz rz-v"
              onMove={(dx) => setPropsW((w) => clampN(w - dx, 200, 460))}
            />
            <button className="props-min" onClick={() => setPropsMin(true)} title="Collapse editor panel">
              ›
            </button>
            <PropertiesPanel />
          </div>
        )}
      </div>
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showDesign && <AutoDesignDialog onClose={() => setShowDesign(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
      {showFlip && <FlipShow onClose={() => setShowFlip(false)} />}
      {dropping && (
        <div className="drop-overlay">
          <div className="drop-overlay-box">＋ Drop photos here to add</div>
        </div>
      )}
    </div>
  );
}

export default App;
