import { LibraryPanel } from "./LibraryPanel";
import "./ImagePanel.css";

/** Left dock: the resource browser ("kho": ALBUM / TYPO / ELEMENT). Open/close,
 *  width and the collapse chevron are owned by App — same behavior as the right
 *  editor panel. */
export function LeftPanel() {
  return (
    <aside className="left-panel">
      <LibraryPanel />
    </aside>
  );
}