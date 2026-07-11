import { useState } from "react";
import { FontPanel } from "./FontPanel";
import "./ImagePanel.css";

/** Left dock: the font library. Photos live in the bottom tray, typos in the
 *  Layout panel — the dock stays collapsed until needed. */
export function LeftPanel() {
  const [open, setOpen] = useState(false);

  return (
    <aside className={"left-panel" + (open ? "" : " collapsed")}>
      <div className="panel-tabs">
        <button className={"tab" + (open ? " active" : "")} onClick={() => setOpen(!open)}>
          Font
        </button>
      </div>
      {open && <FontPanel />}
    </aside>
  );
}