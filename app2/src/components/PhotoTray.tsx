import { ImagePanel } from "./ImagePanel";
import "./ImagePanel.css";

/** SmartAlbums-style bottom tray: the photo library as one horizontal strip
 *  (same ImagePanel — import/filter/rating all work; only the layout differs). */
export function PhotoTray() {
  return (
    <div className="photo-tray">
      <ImagePanel />
    </div>
  );
}