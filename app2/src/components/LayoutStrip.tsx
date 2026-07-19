import { useEffect, useState } from "react";
import {
  coverTemplates,
  getTemplate,
  libraryTemplate,
  registerLibraryTemplate,
  suggestionTemplates,
  templateFromJson,
  type Template,
  type TemplateSource,
} from "../engine/templates";
import { ensureFonts } from "../engine/fontLibrary";
import { fileUrl, readLayoutBgPath, readLayoutJson, type LayoutItem } from "../ipc/library";
import { useFonts } from "../store/fonts";
import { useAlbum } from "../store/album";
import { categoriesOf, useLibrary } from "../store/library";

/** One layout thumbnail (frames only). Hover previews it live on the spread,
 *  click commits it — SmartAlbums behavior. */
function LayoutThumb({ t, active, onApply }: { t: Template; active: boolean; onApply: () => void }) {
  const setPreview = useAlbum((s) => s.setPreviewTemplate);
  return (
    <button
      className={"ls-thumb" + (active ? " active" : "")}
      title={`${t.name} · ${t.slotCount} ô`}
      onMouseEnter={() => setPreview(t.id)}
      onMouseLeave={() => setPreview(null)}
      onClick={onApply}
    >
      <span className="ls-box" style={{ aspectRatio: String(t.ratioWH || 2) }}>
        {t.slots.map((s, i) => (
          <span
            key={i}
            className="ls-slot"
            style={{
              left: `${s.x * 100}%`,
              top: `${s.y * 100}%`,
              width: `${s.w * 100}%`,
              height: `${s.h * 100}%`,
            }}
          />
        ))}
      </span>
      <span className="ls-count">{t.slotCount}</span>
    </button>
  );
}

/** Library layout: shows the pack's THUMBNAIL image (served from disk, lazy).
 *  The real JSON is parsed on hover/click — nothing heavy is loaded upfront. */
function LibraryThumb({
  item,
  active,
  busy,
  onPick,
  onHover,
}: {
  item: LayoutItem;
  active: boolean;
  busy: boolean;
  onPick: () => void;
  onHover: (over: boolean) => void;
}) {
  const known = libraryTemplate(item.id);
  return (
    <button
      className={"ls-thumb ls-lib" + (active ? " active" : "") + (busy ? " busy" : "")}
      title={`${item.name} · ${item.category}${known ? ` · ${known.slotCount} ô` : ""}`}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onClick={onPick}
    >
      {item.thumbPath ? (
        <img className="ls-img" src={fileUrl(item.thumbPath)} alt={item.name} loading="lazy" />
      ) : (
        <span className="ls-box" style={{ aspectRatio: "2" }} />
      )}
      {known && <span className="ls-count">{known.slotCount}</span>}
    </button>
  );
}

/** Layouts relevant to the current spread: same photo count first, rest after
 *  (all of them when the spread is still empty). */
function useStripTemplates(): { list: Template[]; currentId: string; photoCount: number } {
  const size = useAlbum((s) => s.size);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const spread = spreads[currentIndex];
  const currentId = spread?.templateId ?? "";
  const photoCount = spread?.imageIds.filter(Boolean).length ?? 0;
  if (!size) return { list: [], currentId, photoCount };
  // The cover browses its OWN layout pool, never the spread designs.
  const all = spread?.isCover ? coverTemplates(size) : suggestionTemplates(size);
  const list = [...all].sort((a, b) => {
    if (photoCount > 0) {
      const am = a.slotCount === photoCount ? 0 : 1;
      const bm = b.slotCount === photoCount ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    return a.slotCount - b.slotCount || a.id.localeCompare(b.id);
  });
  return { list, currentId, photoCount };
}

const BUILTIN_TABS: { id: "all" | TemplateSource; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "basic", label: "Cơ bản" },
  { id: "custom", label: "Mẫu của tôi" },
];

/** Album size a pack category targets, parsed from its folder name
 *  ("cover-25x35" / "layout 30x30" → "25x35" / "30x30"). null = any size. */
function catSize(category: string): string | null {
  const m = /(\d{2,3})\s*[x×]\s*(\d{2,3})/i.exec(category);
  return m ? `${m[1]}x${m[2]}` : null;
}

/** Does this pack category belong to the cover spread? */
const isCoverCat = (c: string) => /^(cover|bia|bìa)/i.test(c);

/** Layout picker (topbar Layout button): a DOCKED horizontal panel that
 *  pushes the canvas down (SmartAlbums style). Built-in layouts + every
 *  category of the imported pack (cover-25x35, layout-30x30…) as tabs;
 *  pack layouts show their real thumbnail and load the JSON when picked. */
export function LayoutDock({ onClose }: { onClose: () => void }) {
  const applyTemplate = useAlbum((s) => s.applyTemplate);
  const setPreview = useAlbum((s) => s.setPreviewTemplate);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const size = useAlbum((s) => s.size);
  const isCover = !!spreads[currentIndex]?.isCover;
  const { list, currentId, photoCount } = useStripTemplates();
  const library = useLibrary((s) => s.layouts);
  const [tab, setTab] = useState<string>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Drop the hover preview ONLY when the panel closes. Keeping this in the
  // effect above would kill a live preview on every parent re-render (e.g. the
  // layout's fonts finishing loading a few seconds after the hover).
  useEffect(() => () => setPreview(null), [setPreview]);

  // Built-in pool, narrowed to the spread's photo count when it has photos.
  const want = Math.max(1, photoCount);
  const matches = list.filter((t) => t.slotCount === want);
  const pool = photoCount > 0 && matches.length > 0 ? matches : list;
  const bySrc = (src: "all" | TemplateSource) =>
    src === "all" ? pool : pool.filter((t) => (t.source ?? "tizino") === src);

  // Pack layouts: only the ones for THIS album size and this spread kind
  // (cover vs normal). They all live under one "Tizino" tab.
  const libAll = library.filter((i) => {
    if (isCover !== isCoverCat(i.category)) return false;
    const cs = catSize(i.category);
    return !cs || !size || cs === size;
  });
  // …and, like the built-in pool, narrowed to the spread's photo count: a
  // 2-photo spread only sees 2-slot layouts. (Fall back to the whole pack when
  // no layout has that many slots, so the tab is never empty.)
  const libMatches = libAll.filter((i) => i.slotCount === want);
  const libItems = photoCount > 0 && libMatches.length > 0 ? libMatches : libAll;
  const cats = categoriesOf(libItems);
  // "Tất cả" really means ALL: built-ins + the whole Tizino pack together
  // (hover previews work the same in both — LibraryThumb parses on hover).
  const libShown = tab === "tizino" || tab === "all" ? libItems : [];

  /** Parse a pack layout on demand and cache it as a real Template. */
  async function loadLibrary(item: LayoutItem): Promise<Template | undefined> {
    const cached = libraryTemplate(item.id);
    if (cached) return cached;
    setBusyId(item.id);
    try {
      const raw = JSON.parse(await readLayoutJson(item.jsonPath));
      // preview plate: the pack's own bg (hi-res is re-read at export time)
      const bg = item.bgPath ? (await readLayoutBgPath(item.bgPath).catch(() => null)) ?? undefined : undefined;
      const tpl = registerLibraryTemplate(
        templateFromJson(item.id, item.name, raw, isCoverCat(item.category) ? "cover" : "spread", bg)
      );
      // this layout's fonts only become "needed" now — load them from the machine
      const fs = useFonts.getState();
      const names = tpl.texts.map((t) => t.font ?? "").filter(Boolean);
      void ensureFonts(names, fs.index).then((loaded) => loaded.length && fs.addFonts(loaded));
      return tpl;
    } catch {
      return undefined;
    } finally {
      setBusyId(null);
    }
  }

  const builtinShown =
    tab === "all" || tab === "basic" || tab === "custom"
      ? bySrc(tab as "all" | TemplateSource)
      : [];

  return (
    <div className="layout-dock" onMouseLeave={() => setPreview(null)}>
      <div className="lp-bar">
        <span className="lp-head">
          {photoCount > 0 ? `Layout ${photoCount} ảnh` : "Tất cả layout"}
        </span>
        <span className="lp-tabs">
          {BUILTIN_TABS.map((t) => (
            <button
              key={t.id}
              className={"lp-tab" + (tab === t.id ? " active" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({bySrc(t.id).length + (t.id === "all" ? libItems.length : 0)})
            </button>
          ))}
          {libItems.length > 0 && (
            <button
              className={"lp-tab lib" + (tab === "tizino" ? " active" : "")}
              onClick={() => setTab("tizino")}
              title={`Kho layout Tizino${size ? ` · khổ ${size}` : ""}${
                cats.length ? ` · nhóm: ${cats.join(", ")}` : ""
              }`}
            >
              Tizino ({libItems.length})
            </button>
          )}
        </span>
        <span className="lp-head">hover = xem trước · click = áp dụng</span>
        <button className="lp-close" title="Đóng (Esc)" onClick={onClose}>
          ✕
        </button>
      </div>
      <div className="ld-row">
        {builtinShown.map((t) => (
          <LayoutThumb
            key={t.id}
            t={t}
            active={t.id === currentId}
            onApply={() => applyTemplate(t.id)}
          />
        ))}
        {libShown.map((item) => (
          <LibraryThumb
            key={item.id}
            item={item}
            active={item.id === currentId}
            busy={busyId === item.id}
            onHover={async (over) => {
              if (!over) {
                setPreview(null);
                return;
              }
              const t = await loadLibrary(item);
              if (t) setPreview(t.id);
            }}
            onPick={async () => {
              const t = await loadLibrary(item);
              if (t) applyTemplate(t.id);
            }}
          />
        ))}
        {builtinShown.length === 0 && libShown.length === 0 && (
          <div className="lp-empty">
            {tab === "custom" ? (
              <>
                Chưa có mẫu của bạn{photoCount > 0 ? ` (${photoCount} ô)` : ""}. Sắp layout ưng ý
                rồi chuột phải nền spread → <b>“Lưu layout thành mẫu”</b>.
              </>
            ) : cats.length === 0 && tab === "all" ? (
              <>Chưa nạp kho layout — panel Layout → <b>Nạp kho layout</b>.</>
            ) : (
              <>Nhóm này chưa có mẫu {photoCount > 0 ? `${photoCount} ô` : ""}.</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Kept for callers that still reference the old name. */
export const LayoutPop = LayoutDock;
export { getTemplate };