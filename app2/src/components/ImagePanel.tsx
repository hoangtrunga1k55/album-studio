import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useMemo, useState } from "react";
import { importFiles, importFolder, type ImportEvent } from "../ipc/import";
import { useAlbum } from "../store/album";
import { IMAGE_DND_KEY } from "../constants";
import { IconFolder, IconImagePlus, IconSearch } from "../icons";
import "./ImagePanel.css";

const IMG_EXT = ["jpg", "jpeg", "png", "tif", "tiff", "heic", "heif"];
const THUMB_MIN = 80;
const THUMB_MAX = 200;
/** color labels (keys 6–9): red / yellow / green / blue. */
const LABEL_COLORS = ["", "#ef4444", "#f59e0b", "#10b981", "#3b82f6"];

type SortBy = "date" | "name" | "rating";
type Filter = "all" | "used" | "unused" | "starred" | "rejected";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "used", label: "Đã dùng" },
  { id: "unused", label: "Chưa dùng" },
  { id: "starred", label: "★" },
  { id: "rejected", label: "Loại" },
];

export function ImagePanel() {
  const images = useAlbum((s) => s.images);
  const addImages = useAlbum((s) => s.addImages);
  const spreads = useAlbum((s) => s.spreads);
  const toggleImage = useAlbum((s) => s.toggleImage);
  const addToSpread = useAlbum((s) => s.addToSpread);
  const photoMeta = useAlbum((s) => s.photoMeta);
  const selected = useAlbum((s) => s.selectedPhotos);
  const setSelected = useAlbum((s) => s.setSelectedPhotos);

  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [scanning, setScanning] = useState(false);
  const [query, setQuery] = useState("");
  const [thumbSize, setThumbSize] = useState(110);
  const [sortBy, setSortBy] = useState<SortBy>("date");
  const [filter, setFilter] = useState<Filter>("all");
  /** color-label filter (null = off) — combines with the main filter. */
  const [labelFilter, setLabelFilter] = useState<1 | 2 | 3 | 4 | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null); // shift-range anchor

  // ---- import ----
  function onEvent(e: ImportEvent) {
    if (e.kind === "started") {
      setProgress({ done: 0, total: e.total });
      useAlbum.getState().setImporting(true);
    }
    else if (e.kind === "image") {
      const { kind, ...meta } = e;
      void kind;
      addImages([meta]);
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    } else if (e.kind === "failed") {
      setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
    } else if (e.kind === "done") {
      setScanning(false);
      useAlbum.getState().setImporting(false);
    }
  }

  async function pickImages() {
    const paths = await open({ multiple: true, directory: false, filters: [{ name: "Ảnh", extensions: IMG_EXT }] });
    if (!paths || (Array.isArray(paths) && paths.length === 0)) return;
    setScanning(true);
    setProgress(null);
    try {
      await importFiles(Array.isArray(paths) ? paths : [paths], onEvent);
    } catch (err) {
      setScanning(false);
      useAlbum.getState().setImporting(false);
      alert("Không import được: " + String(err));
    }
  }

  async function pickFolder() {
    const dir = await open({ multiple: false, directory: true });
    if (typeof dir !== "string") return;
    setScanning(true);
    setProgress(null);
    try {
      await importFolder(dir, onEvent);
    } catch (err) {
      setScanning(false);
      useAlbum.getState().setImporting(false);
      alert("Không import được thư mục: " + String(err));
    }
  }

  // ---- usage counts across the whole album ----
  const usedCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const sp of spreads)
      for (const id of sp.imageIds) if (id) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [spreads]);

  // ---- sort + filter (SmartAlbums §4.3) ----
  const visible = useMemo(() => {
    let list = [...images];
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name, undefined, { numeric: true });
      if (sortBy === "rating")
        return (photoMeta[b.id]?.rating ?? 0) - (photoMeta[a.id]?.rating ?? 0) || a.capturedAt.localeCompare(b.capturedAt);
      return a.capturedAt.localeCompare(b.capturedAt);
    });
    if (filter === "rejected") list = list.filter((i) => photoMeta[i.id]?.rejected);
    else {
      list = list.filter((i) => !photoMeta[i.id]?.rejected);
      if (filter === "used") list = list.filter((i) => usedCount.has(i.id));
      else if (filter === "unused") list = list.filter((i) => !usedCount.has(i.id));
      else if (filter === "starred") list = list.filter((i) => (photoMeta[i.id]?.rating ?? 0) > 0);
    }
    if (labelFilter) list = list.filter((i) => photoMeta[i.id]?.label === labelFilter);
    const q = query.trim().toLowerCase();
    return q ? list.filter((i) => i.name.toLowerCase().includes(q)) : list;
  }, [images, query, sortBy, filter, labelFilter, photoMeta, usedCount]);

  // ---- selection (click / cmd / shift) ----
  function onCellClick(e: React.MouseEvent, id: string) {
    if (e.shiftKey && anchor) {
      const ids = visible.map((v) => v.id);
      const a = ids.indexOf(anchor);
      const b = ids.indexOf(id);
      if (a >= 0 && b >= 0) {
        setSelected(ids.slice(Math.min(a, b), Math.max(a, b) + 1));
        return;
      }
    }
    if (e.metaKey || e.ctrlKey) {
      setSelected(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
    } else {
      setSelected([id]);
    }
    setAnchor(id);
  }

  // ---- keys on the selection: 1–5/0 rating · X reject · Enter add to spread ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const st = useAlbum.getState();
      if (st.selectedPhotos.length === 0) return;
      if (e.key >= "0" && e.key <= "5") {
        e.preventDefault();
        st.ratePhotos(st.selectedPhotos, parseInt(e.key, 10));
      } else if (e.key >= "6" && e.key <= "9") {
        // color labels (§4.3): 6=đỏ 7=vàng 8=xanh lá 9=xanh dương
        e.preventDefault();
        st.labelPhotos(st.selectedPhotos, (parseInt(e.key, 10) - 5) as 1 | 2 | 3 | 4);
      } else if (e.key.toLowerCase() === "x") {
        e.preventDefault();
        st.toggleRejected(st.selectedPhotos);
        st.setSelectedPhotos([]);
      } else if (e.key === "Enter") {
        e.preventDefault();
        st.addToSpread(st.selectedPhotos);
      } else if (e.key === "Delete" || e.key === "Backspace") {
        // Canvas owns Delete while a slot/text/typo is selected — don't double-fire.
        if (st.selectedSlot === null && !st.selectedText && !st.selectedTypo) {
          e.preventDefault();
          st.removeImages(st.selectedPhotos);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pct = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const rejectedCount = images.filter((i) => photoMeta[i.id]?.rejected).length;

  return (
    <>
      <div className="ip-head">
      <div className="panel-actions ip-actions">
        <button className="btn primary" onClick={pickImages} disabled={scanning}>
          <IconImagePlus />
          {scanning ? "Đang nạp…" : "Chọn ảnh"}
        </button>
        <button className="btn" onClick={pickFolder} disabled={scanning} title="Import cả thư mục ảnh">
          <IconFolder />
        </button>
      </div>

      <div className="ip-tools">
        <div className="search-wrap">
          <IconSearch width={15} height={15} />
          <input placeholder="Tìm theo tên…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="ip-sort" value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)} title="Sắp xếp">
          <option value="date">Ngày chụp</option>
          <option value="name">Tên file</option>
          <option value="rating">Sao ★</option>
        </select>
      </div>

      <div className="ip-filters">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            className={"ip-filter" + (filter === f.id ? " active" : "")}
            onClick={() => setFilter(f.id)}
            title={f.id === "rejected" ? `${rejectedCount} ảnh đã loại` : undefined}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="ip-filters">
        <span className="ip-row-label">Nhãn:</span>
        {([1, 2, 3, 4] as const).map((l) => (
          <button
            key={l}
            className={"ip-labelfilter" + (labelFilter === l ? " active" : "")}
            style={{ ["--dot" as string]: LABEL_COLORS[l] }}
            onClick={() => setLabelFilter(labelFilter === l ? null : l)}
            title={`Lọc theo nhãn màu (phím ${l + 5} để gán)`}
          />
        ))}
        <input
          className="ip-zoom"
          type="range"
          min={THUMB_MIN}
          max={THUMB_MAX}
          value={thumbSize}
          onChange={(e) => setThumbSize(parseInt(e.target.value, 10))}
          title="Cỡ thumbnail"
        />
      </div>

      {scanning ? (
        <div className="ip-progress">
          <div className="bar"><div className="fill" style={{ width: `${pct}%` }} /></div>
          <span>{progress ? `${progress.done}/${progress.total}` : ""} — {pct}%</span>
        </div>
      ) : (
        images.length > 0 && (
          <div className="panel-subbar">
            <span className="panel-count">
              {visible.length}/{images.length} ảnh
              {selected.length > 0 ? ` · chọn ${selected.length}` : ""}
            </span>
            {selected.length > 0 && (
              <>
                <button
                  className="ip-tospread"
                  onClick={() => addToSpread(selected)}
                  title="Đưa các ảnh đang chọn vào spread hiện tại (Enter)"
                >
                  → Spread ({selected.length})
                </button>
                <button
                  className="ip-remove"
                  onClick={() => useAlbum.getState().removeImages(selected)}
                  title="Xoá khỏi album (Delete) — file gốc trên máy không bị xoá"
                >
                  Xoá ({selected.length})
                </button>
              </>
            )}
          </div>
        )
      )}
      </div>

      <div className="ip-grid" style={{ ["--cell" as string]: `${thumbSize}px` }}>
        {visible.map((img) => {
          const meta = photoMeta[img.id];
          const used = usedCount.get(img.id) ?? 0;
          const isSel = selected.includes(img.id);
          return (
            <figure
              key={img.id}
              className={
                "ip-cell" +
                (isSel ? " selected" : "") +
                (meta?.rejected ? " rejected" : "") +
                (used > 0 ? " used" : "")
              }
              title={`${img.name}\n${img.capturedAt}\nDouble-click: thêm/bỏ khỏi spread · 1–5: sao · X: loại`}
              draggable
              onDragStart={(e) => {
                // Dragging a selected photo carries the whole selection.
                const ids = isSel && selected.length > 1 ? selected : [img.id];
                e.dataTransfer.setData(IMAGE_DND_KEY, ids.join(","));
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={(e) => onCellClick(e, img.id)}
              onDoubleClick={() =>
                isSel && selected.length > 1 ? addToSpread(selected) : toggleImage(img.id)
              }
            >
              <img src={img.thumb} alt={img.name} loading="lazy" draggable={false} />
              {isSel && <span className="ip-check">✓</span>}
              {meta?.label && (
                <span className="ip-label" style={{ background: LABEL_COLORS[meta.label] }} />
              )}
              {used > 1 && <span className="ip-used" title={`Dùng ${used} lần trong album`}>{used}</span>}
              {used === 1 && <span className="ip-used one" title="Đã dùng trong album">✓</span>}
              {(meta?.rating ?? 0) > 0 && (
                <span className="ip-stars">{"★".repeat(meta!.rating!)}</span>
              )}
            </figure>
          );
        })}
      </div>

      {images.length === 0 && !scanning && (
        <div className="ip-empty">
          Bấm <b>Chọn ảnh</b> hoặc import thư mục.
          <br />
          Click chọn · phím <b>1–5</b> gán sao · <b>X</b> loại
          <br />
          Double-click thêm vào spread · kéo thả vào ô
        </div>
      )}
    </>
  );
}