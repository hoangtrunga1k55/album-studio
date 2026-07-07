import { useEffect, useState } from "react";
import { Welcome } from "./components/Welcome";
import { LeftPanel } from "./components/LeftPanel";
import { SpreadCanvas } from "./components/SpreadCanvas";
import { SpreadsFilmstrip } from "./components/SpreadsFilmstrip";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { LayoutGallery } from "./components/LayoutGallery";
import { ExportDialog } from "./components/ExportDialog";
import { AutoDesignDialog } from "./components/AutoDesignDialog";
import { getTemplate } from "./engine/templates";
import { registerBundledFonts } from "./engine/bundledFonts";
import { loadTemplateFontsFromFolder, savedFontFolder } from "./engine/fontLibrary";
import { loadTypoFolder, savedTypoFolder } from "./ipc/typos";
import { saveNow, startAutosave } from "./flows/projectIO";
import { useAlbum } from "./store/album";
import { useFonts } from "./store/fonts";
import { useTypos } from "./store/typos";
import { useProject } from "./store/project";
import {
  IconExport,
  IconLayout,
  IconSettings,
  IconShuffle,
  IconSparkle,
  IconText,
} from "./icons";
import { DENSITY_LABELS } from "./engine/autoLayout";
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
  const shuffleCurrent = useAlbum((s) => s.shuffleCurrent);
  const resetAlbum = useAlbum((s) => s.resetAlbum);
  const addText = useAlbum((s) => s.addText);
  const density = useAlbum((s) => s.density);
  const setDensity = useAlbum((s) => s.setDensity);
  const addFonts = useFonts((s) => s.addFonts);
  const setFontIndex = useFonts((s) => s.setIndex);
  const fonts = useFonts((s) => s.fonts);
  const setTypos = useTypos((s) => s.setTypos);
  const [showGallery, setShowGallery] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showDesign, setShowDesign] = useState(false);

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
            <button className="tbtn active" title="Layout" onClick={() => setShowGallery(true)}>
              <IconLayout />
            </button>
            <button className="tbtn" title="Đổi layout (Space)" onClick={shuffleCurrent}>
              <IconShuffle />
            </button>
            <span className="tbtn-sep" />
            <button
              className="tbtn"
              title="Thêm chữ"
              onClick={() =>
                addText({
                  content: "Nội dung mới",
                  font: fonts[0]?.family ?? "Be Vietnam Pro",
                  color: "#222222",
                  sizeFrac: 0.035,
                  x: 0.4,
                  y: 0.45,
                })
              }
            >
              <IconText />
            </button>
          </div>
          <div className="toolbar-status">
            {tpl ? `${tpl.name} · ${tpl.slotCount} ô` : "—"} · {spread?.imageIds.length ?? 0} ảnh · {images.length} đã nạp
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
            title="Tự dàn cả album (⌘D)"
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
          <SpreadCanvas />
          <SpreadsFilmstrip />
        </div>
        <PropertiesPanel />
      </div>

      {showGallery && <LayoutGallery onClose={() => setShowGallery(false)} />}
      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {showDesign && <AutoDesignDialog onClose={() => setShowDesign(false)} />}
    </div>
  );
}

export default App;
