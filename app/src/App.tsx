import { open, save } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { importFiles } from "./ipc/import";
import { saveProjectFile, openProjectFile } from "./ipc/project";
import { LeftPanel } from "./components/LeftPanel";
import { SpreadCanvas } from "./components/SpreadCanvas";
import { SpreadsFilmstrip } from "./components/SpreadsFilmstrip";
import { PropertiesPanel } from "./components/PropertiesPanel";
import { LayoutGallery } from "./components/LayoutGallery";
import { ExportDialog } from "./components/ExportDialog";
import { NewAlbum } from "./components/NewAlbum";
import { getTemplate } from "./engine/templates";
import { registerBundledFonts } from "./engine/bundledFonts";
import { loadTemplateFontsFromFolder, savedFontFolder } from "./engine/fontLibrary";
import { loadTypoFolder, savedTypoFolder } from "./ipc/typos";
import { useAlbum } from "./store/album";
import { useFonts } from "./store/fonts";
import { useTypos } from "./store/typos";
import {
  IconCrop,
  IconExport,
  IconLayout,
  IconLock,
  IconSettings,
  IconShuffle,
  IconSparkle,
  IconText,
} from "./icons";
import { DENSITY_LABELS } from "./engine/autoLayout";
import "./App.css";

function App() {
  const size = useAlbum((s) => s.size);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const images = useAlbum((s) => s.images);
  const shuffleCurrent = useAlbum((s) => s.shuffleCurrent);
  const resetAlbum = useAlbum((s) => s.resetAlbum);
  const applyProject = useAlbum((s) => s.applyProject);
  const addImages = useAlbum((s) => s.addImages);
  const addText = useAlbum((s) => s.addText);
  const density = useAlbum((s) => s.density);
  const setDensity = useAlbum((s) => s.setDensity);
  const autoDesign = useAlbum((s) => s.autoDesign);
  const addFonts = useFonts((s) => s.addFonts);
  const setFontIndex = useFonts((s) => s.setIndex);
  const fonts = useFonts((s) => s.fonts);
  const setTypos = useTypos((s) => s.setTypos);
  const [showGallery, setShowGallery] = useState(false);
  const [showExport, setShowExport] = useState(false);

  useEffect(() => {
    (async () => {
      addFonts(await registerBundledFonts());
      // Load the imported typo kho first so its fonts are included below.
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") {
        e.preventDefault();
        saveProject();
      } else if (k === "o") {
        e.preventDefault();
        openProject();
      } else if (k === "e") {
        e.preventDefault();
        setShowExport(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function saveProject() {
    const st = useAlbum.getState();
    if (!st.size) return;
    const proj = {
      version: 1,
      size: st.size,
      bgColor: st.bgColor,
      density: st.density,
      currentIndex: st.currentIndex,
      imagePaths: st.images.map((i) => i.path),
      spreads: st.spreads,
    };
    let path = await save({
      defaultPath: "album.album",
      filters: [{ name: "Album Studio", extensions: ["album"] }],
    });
    if (!path) return;
    if (!path.endsWith(".album")) path += ".album";
    try {
      await saveProjectFile(path, JSON.stringify(proj));
    } catch (e) {
      alert("Lưu lỗi: " + String(e));
    }
  }

  async function openProject() {
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Album Studio", extensions: ["album"] }],
    });
    if (typeof path !== "string") return;
    try {
      const proj = JSON.parse(await openProjectFile(path));
      applyProject({
        size: proj.size,
        bgColor: proj.bgColor,
        density: proj.density,
        currentIndex: proj.currentIndex,
        spreads: proj.spreads,
      });
      if (Array.isArray(proj.imagePaths) && proj.imagePaths.length) {
        await importFiles(proj.imagePaths, (e) => {
          if (e.kind === "image") {
            const { kind, ...meta } = e;
            void kind;
            addImages([meta]);
          }
        });
      }
    } catch (e) {
      alert("Mở lỗi: " + String(e));
    }
  }

  if (!size) return <NewAlbum />;

  const spread = spreads[currentIndex];
  const tpl = getTemplate(spread?.templateId ?? null);

  return (
    <div className="app">
      <header className="topbar">
        <div className="topleft">
          <div className="brand">
            <div className="brand-mark" onClick={resetAlbum} title="Đổi tỉ lệ album">
              A
            </div>
            <div className="brand-text">
              <div className="name">Album Studio</div>
              <div className="sub">{size} · {spreads.length} spread</div>
            </div>
          </div>
          <button className="btn" onClick={openProject}>Mở</button>
          <button className="btn" onClick={saveProject}>Lưu</button>
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
            <button className="tbtn" title="Cắt ảnh (sắp có)" disabled>
              <IconCrop />
            </button>
            <button className="tbtn" title="Khoá (sắp có)" disabled>
              <IconLock />
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
          <button className="btn" onClick={autoDesign} disabled={!images.length} title="Tự dàn cả album">
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
    </div>
  );
}

export default App;
