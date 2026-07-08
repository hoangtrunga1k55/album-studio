import { useState } from "react";
import { templatesForSize, type TemplateSource } from "../engine/templates";
import { useAlbum } from "../store/album";
import { IconClose } from "../icons";

const TABS: { id: TemplateSource; label: string }[] = [
  { id: "basic", label: "Cơ bản" },
  { id: "tizino", label: "Tizino" },
  { id: "custom", label: "Mẫu của tôi" },
];

/** Layout library in 3 groups: generated basics (SmartAlbums-style plain
 *  frames), Tizino PSD designs, and user-saved My Layouts. */
export function LayoutGallery({ onClose }: { onClose: () => void }) {
  const size = useAlbum((s) => s.size);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const setTemplate = useAlbum((s) => s.setTemplate);
  const [tab, setTab] = useState<TemplateSource>("tizino");

  if (!size) return null;
  const currentTemplateId = spreads[currentIndex]?.templateId;
  const all = templatesForSize(size);
  const bySource = (src: TemplateSource) =>
    all.filter((t) => (t.source ?? "tizino") === src);
  const list = bySource(tab).sort((a, b) => a.slotCount - b.slotCount);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Layout {size}</h2>
          <div className="lay-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                className={"lay-tab" + (tab === t.id ? " active" : "")}
                onClick={() => setTab(t.id)}
              >
                {t.label} ({bySource(t.id).length})
              </button>
            ))}
          </div>
          <button className="btn icon" onClick={onClose} aria-label="Đóng">
            <IconClose />
          </button>
        </div>
        <div className="modal-grid">
          {list.map((t) => (
            <div
              key={t.id}
              className={"lay-card" + (t.id === currentTemplateId ? " active" : "")}
              onClick={() => {
                setTemplate(t.id);
                onClose();
              }}
            >
              <div className="lay-preview" style={{ paddingBottom: `${100 / (t.ratioWH || 2)}%` }}>
                {t.slots.map((s, i) => (
                  <div
                    key={i}
                    className="lay-slot"
                    style={{
                      left: `${s.x * 100}%`,
                      top: `${s.y * 100}%`,
                      width: `${s.w * 100}%`,
                      height: `${s.h * 100}%`,
                    }}
                  />
                ))}
              </div>
              <div className="lay-name">
                <b>{t.name}</b>
                <span>{t.slotCount} ô</span>
              </div>
            </div>
          ))}
          {list.length === 0 && (
            <div className="ip-empty" style={{ gridColumn: "1 / -1" }}>
              {tab === "custom" ? (
                <>
                  Chưa có mẫu nào. Sắp layout ưng ý rồi
                  <br />
                  chuột phải nền spread → <b>“Lưu layout thành mẫu”</b>.
                </>
              ) : (
                <>Chưa có layout nhóm này cho khổ {size}.</>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}