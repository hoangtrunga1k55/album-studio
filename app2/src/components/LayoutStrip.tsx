import { useEffect, useState } from "react";
import {
  suggestionTemplates,
  type Template,
  type TemplateSource,
} from "../engine/templates";
import { useAlbum } from "../store/album";

/** One layout thumbnail (frames only). Hover previews it live on the spread,
 *  click commits it — SmartAlbums behavior, shared by the strip and the
 *  center grid. */
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
  const all = suggestionTemplates(size);
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

const POP_TABS: { id: "all" | TemplateSource; label: string }[] = [
  { id: "all", label: "Tất cả" },
  { id: "basic", label: "Cơ bản" },
  { id: "tizino", label: "Tizino" },
  { id: "custom", label: "Mẫu của tôi" },
];

/** Layout picker (topbar Layout button): a DOCKED horizontal panel that
 *  pushes the canvas down (SmartAlbums style) — variants for the current
 *  photo count, source tabs, hover = live preview, click = apply. */
export function LayoutDock({ onClose }: { onClose: () => void }) {
  const applyTemplate = useAlbum((s) => s.applyTemplate);
  const setPreview = useAlbum((s) => s.setPreviewTemplate);
  const { list, currentId, photoCount } = useStripTemplates();
  const [tab, setTab] = useState<"all" | TemplateSource>("all");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      setPreview(null);
    };
  }, [onClose, setPreview]);

  // Only layouts matching the spread's photo count (empty spread → all).
  const want = Math.max(1, photoCount);
  const matches = list.filter((t) => t.slotCount === want);
  const pool = photoCount > 0 && matches.length > 0 ? matches : list;
  const bySrc = (src: "all" | TemplateSource) =>
    src === "all" ? pool : pool.filter((t) => (t.source ?? "tizino") === src);
  const shown = bySrc(tab);

  return (
    <div className="layout-dock" onMouseLeave={() => setPreview(null)}>
      <div className="lp-bar">
        <span className="lp-head">
          {photoCount > 0 ? `Layout ${photoCount} ảnh` : "Tất cả layout"}
        </span>
        <span className="lp-tabs">
          {POP_TABS.map((t) => (
            <button
              key={t.id}
              className={"lp-tab" + (tab === t.id ? " active" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label} ({bySrc(t.id).length})
            </button>
          ))}
        </span>
        <span className="lp-head">hover = xem trước · click = áp dụng</span>
      </div>
      <div className="ld-row">
        {shown.map((t) => (
          <LayoutThumb
            key={t.id}
            t={t}
            active={t.id === currentId}
            onApply={() => applyTemplate(t.id)}
          />
        ))}
        {shown.length === 0 && (
          <div className="lp-empty">
            {tab === "custom" ? (
              <>
                Chưa có mẫu của bạn{photoCount > 0 ? ` (${photoCount} ô)` : ""}. Sắp layout ưng ý
                rồi chuột phải nền spread → <b>“Lưu layout thành mẫu”</b>.
              </>
            ) : (
              <>Nhóm này chưa có mẫu {photoCount > 0 ? `${photoCount} ô` : ""}.</>
            )}
          </div>
        )}
      </div>
    </div>
  );
}