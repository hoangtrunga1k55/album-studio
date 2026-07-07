import { templatesForSize } from "../engine/templates";
import { useAlbum } from "../store/album";
import { IconClose } from "../icons";

/** Modal grid of templates for the album size; click to apply to the current spread. */
export function LayoutGallery({ onClose }: { onClose: () => void }) {
  const size = useAlbum((s) => s.size);
  const spreads = useAlbum((s) => s.spreads);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const setTemplate = useAlbum((s) => s.setTemplate);

  if (!size) return null;
  const currentTemplateId = spreads[currentIndex]?.templateId;
  const list = templatesForSize(size).sort((a, b) => a.slotCount - b.slotCount);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Layout {size} · {list.length} mẫu</h2>
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
        </div>
      </div>
    </div>
  );
}
