import { open } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { importFiles } from "../ipc/import";
import { useAlbum } from "../store/album";
import { IMAGE_DND_KEY } from "../constants";
import { IconImagePlus, IconSearch } from "../icons";
import "./ImagePanel.css";

const THUMB_SIZES = [80, 110, 150] as const;
const IMG_EXT = ["jpg", "jpeg", "png", "tif", "tiff", "heic", "heif"];

export function ImagePanel() {
  const images = useAlbum((s) => s.images);
  const addImages = useAlbum((s) => s.addImages);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const toggleImage = useAlbum((s) => s.toggleImage);

  const selectedIds = spreads[currentIndex]?.imageIds ?? [];

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [thumbSize, setThumbSize] = useState<number>(110);

  async function pickImages() {
    const paths = await open({
      multiple: true,
      directory: false,
      filters: [{ name: "Ảnh", extensions: IMG_EXT }],
    });
    if (!paths || (Array.isArray(paths) && paths.length === 0)) return;
    const list = Array.isArray(paths) ? paths : [paths];

    setScanning(true);
    setProgress({ done: 0, total: list.length });
    try {
      await importFiles(list, (e) => {
        if (e.kind === "started") setProgress({ done: 0, total: e.total });
        else if (e.kind === "image") {
          const { kind, ...meta } = e;
          void kind;
          addImages([meta]);
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        } else if (e.kind === "failed") {
          setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
        } else if (e.kind === "done") {
          setScanning(false);
        }
      });
    } catch (err) {
      setScanning(false);
      alert("Không import được: " + String(err));
    }
  }

  const visible = useMemo(() => {
    const sorted = [...images].sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
    const q = query.trim().toLowerCase();
    return q ? sorted.filter((i) => i.name.toLowerCase().includes(q)) : sorted;
  }, [images, query]);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <>
      <div className="panel-actions">
        <button className="btn primary" onClick={pickImages} disabled={scanning}>
          <IconImagePlus />
          {scanning ? "Đang nạp…" : "Chọn ảnh"}
        </button>
      </div>

      <div className="search-wrap">
        <IconSearch width={15} height={15} />
        <input placeholder="Tìm theo tên…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {scanning ? (
        <div className="ip-progress">
          <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
          <span>{pct}%</span>
        </div>
      ) : (
        <div className="panel-subbar">
          <span className="panel-count">
            {images.length > 0 ? `${images.length} ảnh · chọn ${selectedIds.length}` : ""}
          </span>
          <div className="size-seg">
            {THUMB_SIZES.map((s) => (
              <button key={s} className={thumbSize === s ? "active" : ""} onClick={() => setThumbSize(s)}>
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ip-grid" style={{ ["--cell" as string]: `${thumbSize}px` }}>
        {visible.map((img) => {
          const order = selectedIds.indexOf(img.id);
          const sel = order >= 0;
          return (
            <figure
              key={img.id}
              className={"ip-cell" + (sel ? " selected" : "")}
              title={`${img.name}\n${img.capturedAt}`}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(IMAGE_DND_KEY, img.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => toggleImage(img.id)}
            >
              <img src={img.thumb} alt={img.name} loading="lazy" draggable={false} />
              {sel && <span className="ip-badge">{order + 1}</span>}
            </figure>
          );
        })}
      </div>

      {images.length === 0 && !scanning && (
        <div className="ip-empty">
          Bấm <b>Chọn ảnh</b> để thêm ảnh
          <br />
          rồi click ảnh để xếp vào spread
        </div>
      )}
    </>
  );
}
