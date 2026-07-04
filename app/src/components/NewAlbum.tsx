import { ALBUM_SIZES, templatesForSize } from "../engine/templates";
import { useAlbum } from "../store/album";

/** First screen: choose the album size before editing. */
export function NewAlbum() {
  const createAlbum = useAlbum((s) => s.createAlbum);

  return (
    <div className="newalbum">
      <div className="brand-mark big">A</div>
      <h1>Album Studio</h1>
      <p className="newalbum-sub">Chọn tỉ lệ album để bắt đầu</p>
      <div className="size-cards">
        {ALBUM_SIZES.map((s) => {
          const count = templatesForSize(s.id).length;
          const disabled = count === 0;
          return (
            <button
              key={s.id}
              className="size-card"
              disabled={disabled}
              onClick={() => createAlbum(s.id)}
            >
              <div
                className="size-shape"
                style={{ aspectRatio: s.id === "30x30" ? "1 / 1" : "25 / 35" }}
              />
              <div className="size-label">{s.label}</div>
              <div className="size-note">
                {disabled ? "Chưa có layout" : `${count} layout`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
