import { useEffect, useState } from "react";

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
import { CoverDropZone, NextSpreadZone } from "./components/WorkZones";
import { LayoutDock } from "./components/LayoutStrip";
import { ExportDialog } from "./components/ExportDialog";
import { AutoDesignDialog } from "./components/AutoDesignDialog";
import { getTemplate } from "./engine/templates";
import { registerBundledFonts } from "./engine/bundledFonts";
import { loadTemplateFontsFromFolder, savedFontFolder } from "./engine/fontLibrary";
import { loadTypoFolder, savedTypoFolder } from "./ipc/typos";
import { openProject, saveNow, startAutosave } from "./flows/projectIO";
import { useAlbum } from "./store/album";
import { useFonts } from "./store/fonts";
import { useTypos } from "./store/typos";
import { useProject } from "./store/project";
import { IconExport, IconLayout, IconSettings, IconSparkle } from "./icons";
import { DENSITY_LABELS } from "./engine/autoLayout";
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
  const density = useAlbum((s) => s.density);
  const setDensity = useAlbum((s) => s.setDensity);
  const addFonts = useFonts((s) => s.addFonts);
  const setFontIndex = useFonts((s) => s.setIndex);
  const setTypos = useTypos((s) => s.setTypos);
  const spreadSelected = useAlbum((s) => s.spreadSelected);
  const layoutDock = useAlbum((s) => s.layoutDockOpen);
  const setLayoutDock = useAlbum((s) => s.setLayoutDock);
  const [showExport, setShowExport] = useState(false);
  const [showDesign, setShowDesign] = useState(false);

  // Resizable panels (drag bars) — remembered across sessions.
  const [trayH, setTrayH] = useState(() => loadPx("albumstudio2.ui.trayH", 190));
  const [propsW, setPropsW] = useState(() => loadPx("albumstudio2.ui.propsW", 240));
  const [trayMin, setTrayMin] = useState(
    () => localStorage.getItem("albumstudio2.ui.trayMin") === "1"
  );
  useEffect(() => localStorage.setItem("albumstudio2.ui.trayH", String(trayH)), [trayH]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.propsW", String(propsW)), [propsW]);
  useEffect(() => localStorage.setItem("albumstudio2.ui.trayMin", trayMin ? "1" : "0"), [trayMin]);

  // Load the user-imported libraries (font kho, typo pack) once at startup.
  useEffect(() => {
    (async () => {
      addFonts(await registerBundledFonts());
      const typoFolder = savedTypoFolder();
      if (typoFolder) {
        try {
          setTypos(await loadTypoFolder(typoFolder));
        } catch {
          /* ignore */
        }
      }
      const folder = savedFontFolder();
      if (folder) {
        try {
          const r = await loadTemplateFontsFromFolder(folder);
          addFonts(r.loaded);
          setFontIndex(r.entries);
        } catch {
          /* ignore */
        }
      }
    })();
  }, [addFonts, setFontIndex, setTypos]);

  // Autosave for the lifetime of the app.
  useEffect(() => startAutosave(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        void saveNow();
      } else if (k === "e") {
        e.preventDefault();
        setShowExport(true);
      } else if (k === "d") {
        e.preventDefault();
        if (e.shiftKey) useAlbum.getState().redesignSpread();
        else setShowDesign(true);
      } else if (k === "b") {
        e.preventDefault();
        useAlbum.getState().toggleBleed();
      } else if (k === "r") {
        e.preventDefault();
        useAlbum.getState().toggleRuler();
      } else if (k === "n") {
        // New Album: save current work, go to Welcome with the wizard open.
        e.preventDefault();
        void (async () => {
          await saveNow();
          useProject.getState().requestWizard(true);
          useProject.getState().closeProject();
          useAlbum.getState().resetAlbum();
        })();
      } else if (k === "o") {
        e.preventDefault();
        void (async () => {
          await saveNow();
          await openProject().catch((err) => alert("Không mở được project: " + String(err)));
        })();
      } else if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        const z = useAlbum.getState().viewZoom;
        useAlbum.getState().setViewZoom(Math.min(3, z * 1.15));
      } else if (e.key === "-") {
        e.preventDefault();
        const z = useAlbum.getState().viewZoom;
        useAlbum.getState().setViewZoom(Math.max(1, z / 1.15));
      } else if (e.key === "0") {
        e.preventDefault();
        useAlbum.getState().setViewZoom(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function backToWelcome() {
    await saveNow();
    closeProject();
    resetAlbum();
  }

  if (!projectPath || !size) return <Welcome />;

  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);
  const saveLabel =
    saveState === "saved" ? "Đã lưu" : saveState === "error" ? "Lỗi lưu!" : "Đang lưu…";

  return (
    <div className="app">
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
          <div className="dseg-group" title="Mật độ ảnh/spread">
            {DENSITY_LABELS.map((d) => (
              <button
                key={d.id}
                className={"dseg" + (density === d.id ? " active" : "")}
                onClick={() => setDensity(d.id)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button
            className="btn"
            onClick={() => setShowDesign(true)}
            disabled={!images.length}
            title={`Tự dàn cả album (${mod("D")})`}
          >
            <IconSparkle />
            Auto Design
          </button>
          <button className="btn primary" onClick={() => setShowExport(true)}>
            <IconExport />
            Xuất album
          </button>
          <button className="btn icon" title="Cài đặt">
            <IconSettings />
          </button>
        </div>
      </header>

      <div className="body">
        <LeftPanel />
        <div className="center">
          {layoutDock && <LayoutDock onClose={() => setLayoutDock(false)} />}
          {/* layout mode = focused spread editor: side zones + filmstrip hide */}
          <div className="workzone">
            {!spreadSelected && <CoverDropZone />}
            <SpreadCanvas />
            {!spreadSelected && <NextSpreadZone />}
          </div>
          {!spreadSelected && <SpreadsFilmstrip />}
        </div>
        {/* the editing panel is ALWAYS visible — its content follows the selection */}
        <div className="props-host" style={{ width: propsW }}>
          <ResizeHandle
            className="rz rz-v"
            onMove={(dx) => setPropsW((w) => clampN(w - dx, 200, 460))}
          />
          <PropertiesPanel />
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
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showDesign && <AutoDesignDialog onClose={() => setShowDesign(false)} />}
    </div>
  );
}

export default App;
