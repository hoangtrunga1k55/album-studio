import { getTemplate } from "../engine/templates";
import { useAlbum } from "../store/album";
import { IconPlus, IconClose } from "../icons";

/** Horizontal filmstrip of spreads under the canvas (add / remove / switch). */
export function SpreadsFilmstrip() {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const currentIndex = useAlbum((s) => s.currentIndex);
  const setCurrent = useAlbum((s) => s.setCurrent);
  const addSpread = useAlbum((s) => s.addSpread);
  const removeSpread = useAlbum((s) => s.removeSpread);

  return (
    <div className="filmstrip2">
      <div className="fs2-track">
        {spreads.map((sp, idx) => {
          const tpl = getTemplate(sp.templateId);
          const ratio = tpl?.ratioWH || 2;
          return (
            <div
              key={sp.id}
              className={"fs2-card" + (idx === currentIndex ? " active" : "")}
              onClick={() => setCurrent(idx)}
              title={`Spread ${idx + 1}`}
            >
              <div className="fs2-prev" style={{ aspectRatio: String(ratio), backgroundImage: tpl?.bg ? `url(${tpl.bg})` : undefined }}>
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
              <span className="fs2-no">{idx + 1}</span>
              {spreads.length > 1 && (
                <button
                  className="fs2-del"
                  title="Xoá spread"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSpread(idx);
                  }}
                >
                  <IconClose width={11} height={11} />
                </button>
              )}
            </div>
          );
        })}
        <button className="fs2-add" onClick={addSpread} title="Thêm spread">
          <IconPlus width={18} height={18} />
        </button>
      </div>
    </div>
  );
}
