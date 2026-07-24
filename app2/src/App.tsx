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
import { NextSpreadZone, PrevSpreadZone } from "./components/WorkZones";
import { TooltipLayer } from "./components/TooltipLayer";
import { LayoutDock } from "./components/LayoutStrip";
import { ExportDialog } from "./components/ExportDialog";
import { AutoDesignDialog } from "./components/AutoDesignDialog";
import { SettingsDialog } from "./components/SettingsDialog";
import { getTemplate } from "./engine/templates";
import { loadSystemFonts } from "./engine/fontLibrary";
import { restoreLibraries } from "./flows/typoImport";
import { openProject, saveAsCopy, saveNow, startAutosave } from "./flows/projectIO";
import { useAlbum } from "./store/album";
import { useFonts } from "./store/fonts";
import { syncRecentMenu, useProject } from "./store/project";
import { clearHistory, initHistory, redo, undo } from "./store/history";
import { IconExport, IconLayout, IconSettings, IconSparkle } from "./icons";
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
  const addFonts = useFonts((s) => s.addFonts);
  const setFontIndex = useFonts((s) => s.setIndex);
  const spreadSelected = useAlbum((s) => s.spreadSelected);
  const layoutDock = useAlbum((s) => s.layoutDockOpen);
  const importing = useAlbum((s) => s.importing);
  const setLayoutDock = useAlbum((s) => s.setLayoutDock);
  const [showExport, setShowExport] = useState(false);
  const [showDesign, setShowDesign] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // Resizable panels (drag bars) — remembered across sessions.
  const [trayH, setTrayH] = useState(() => loadPx("albumstudio2.ui.trayH", 190));
  const [propsW, setPropsW] = useState(() => loadPx("albumstudio2.ui.propsW", 240));
  const [trayMin, setTrayMin] = useState(
    () => localStorage.getItem("albumstudio2.ui.trayMin") === "1"
  );
  const [propsMin, setPropsMin] = useState(
    () => localStorage.getItem("albumstudio2.ui.propsMin") === "1"
  );
  useEffect(() => localStorage.setItem("albumstudio2.ui.trayH", String(trayH)), [trayH]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.propsW", String(propsW)), [propsW]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.trayMin", trayMin ? "1" : "0"), [trayMin]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.propsMin", propsMin ? "1" : "0"), [propsMin]);

  // Fonts come entirely from the machine now. Load the typo pack first so its
  // font names count as "needed", then index the OS font folders and load
  // everything templates + typos require.
  useEffect(() => {
    (async () => {
      // imported packs (layout + typo) — metadata only, thumbnails stay on disk
      await restoreLibraries().catch(() => {});
      try {
        const sys = await loadSystemFonts();
        addFonts(sys.loaded);
        setFontIndex(sys.entries);
      } catch {
        /* ignore */
      }
    })();
  }, [addFonts, setFontIndex]);

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
      void saveAsCopy().catch((err) => alert("Lưu bản sao lỗi: " + String(err)));
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
        await openProject().catch((err) => alert("Không mở được project: " + String(err)));
      })();
    } else if (id.startsWith("recent:")) {
      const p = id.slice("recent:".length);
      void (async () => {
        await saveNow();
        await openProject(p).catch((err) => alert("Không mở được project: " + String(err)));
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
    saveState === "saved" ? "Đã lưu" : saveState === "error" ? "Lỗi lưu!" : "Đang lưu…";

  return (
    <div className="app">
      <TooltipLayer />
      <header className="topbar">
        <div className="topleft">
          <div className="brand">
            <div className="brand-mark" onClick={backToWelcome} title="Về màn hình chính">
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
              title="Layout (bấm lại để đóng)"
              onClick={() => setLayoutDock(!layoutDock)}
            >
              <IconLayout />
            </button>
          </div>
          <div className="toolbar-status">
            {spreads.length} spread ({spreads.length * 2} trang) ·{" "}
            {new Set(spreads.flatMap((sp) => sp.imageIds.filter(Boolean))).size}/{images.length} ảnh
            đã dùng{tpl ? ` · ${tpl.name}` : ""}
          </div>
        </div>

        <div className="topright">
          <button
            className="btn"
            onClick={() => setShowDesign(true)}
            disabled={!images.length || importing}
            title={importing ? "Đang nhập ảnh — chờ xong để Auto Design" : `Tự dàn cả album (${mod("D")})`}
          >
            <IconSparkle />
            {importing ? "Đang nhập ảnh…" : "Auto Design"}
          </button>
          <button className="btn primary" onClick={() => setShowExport(true)}>
            <IconExport />
            Xuất album
          </button>
          <button
            className="btn icon"
            title="Cài đặt · nạp kho font / layout / typo"
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
            <LeftPanel />
            <div className="center">
              {layoutDock && <LayoutDock onClose={() => setLayoutDock(false)} />}
              {/* layout mode = focused spread editor: side zones + filmstrip hide */}
              <div className="workzone">
                {!spreadSelected && <PrevSpreadZone />}
                <SpreadCanvas />
                {!spreadSelected && <NextSpreadZone />}
              </div>
              {!spreadSelected && <SpreadsFilmstrip />}
            </div>
          </div>
          {/* the photo tray yields its space while the layout dock is open */}
          {!layoutDock &&
            (trayMin ? (
              <button className="tray-restore" onClick={() => setTrayMin(false)} title="Mở khay ảnh">
                ▴ Ảnh ({images.length})
              </button>
            ) : (
              <div className="photo-tray-host" style={{ height: trayH }}>
                <ResizeHandle
                  className="rz rz-h"
                  onMove={(_, dy) => setTrayH((h) => clampN(h - dy, 110, 460))}
                />
                <button
                  className="tray-min"
                  title="Thu gọn khay ảnh"
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
          <button className="props-restore" onClick={() => setPropsMin(false)} title="Mở bảng chỉnh sửa">
            ‹ Chỉnh sửa
          </button>
        ) : (
          <div className="props-host" style={{ width: propsW }}>
            <ResizeHandle
              className="rz rz-v"
              onMove={(dx) => setPropsW((w) => clampN(w - dx, 200, 460))}
            />
            <button className="props-min" onClick={() => setPropsMin(true)} title="Thu gọn bảng chỉnh sửa">
              ›
            </button>
            <PropertiesPanel />
          </div>
        )}
      </div>
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showDesign && <AutoDesignDialog onClose={() => setShowDesign(false)} />}
      {showSettings && <SettingsDialog onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default App;
