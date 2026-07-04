import { getTemplate } from "../engine/templates";
import { useAlbum } from "../store/album";
import { IconPlus, IconClose } from "../icons";

/** Right-hand vertical list of spreads (§4.1): add / remove / switch. */
export function SpreadsSidebar() {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const setCurrent = useAlbum((s) => s.setCurrent);
  const addSpread = useAlbum((s) => s.addSpread);
  const removeSpread = useAlbum((s) => s.removeSpread);

  return (
    <aside className="spreads">
      <div className="spreads-head">
        <span>Spread · {spreads.length}</span>
        <button className="mini-btn" onClick={addSpread} title="Thêm spread">
          <IconPlus width={15} height={15} />
        </button>
      </div>

      <div className="spreads-list">
        {spreads.map((sp, idx) => {
          const tpl = getTemplate(sp.templateId);
          const ratio = tpl?.ratioWH || 2;
          return (
            <div
              key={sp.id}
              className={"spread-card" + (idx === currentIndex ? " active" : "")}
              onClick={() => setCurrent(idx)}
            >
              <span className="spread-no">{idx + 1}</span>
              <div
                className="spread-prev"
                style={{
                  paddingBottom: `${100 / ratio}%`,
                  backgroundImage: tpl?.bg ? `url(${tpl.bg})` : undefined,
                }}
              >
                {tpl?.slots.map((s, i) => {
                  const id = sp.imageIds[i];
                  const img = id ? images.find((im) => im.id === id) : undefined;
                  return (
                    <div
                      key={i}
                      className="spread-slot"
                      style={{
                        left: `${s.x * 100}%`,
                        top: `${s.y * 100}%`,
                        width: `${s.w * 100}%`,
                        height: `${s.h * 100}%`,
                        background: img ? undefined : "#eceaf2",
                      }}
                    >
                      {img && <img src={img.thumb} alt="" />}
                    </div>
                  );
                })}
              </div>
              {spreads.length > 1 && (
                <button
                  className="spread-del"
                  title="Xoá spread"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSpread(idx);
                  }}
                >
                  <IconClose width={12} height={12} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
