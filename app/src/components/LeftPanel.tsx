import { useState } from "react";
import { ImagePanel } from "./ImagePanel";
import { FontPanel } from "./FontPanel";
import { TypoPanel } from "./TypoPanel";
import "./ImagePanel.css";

type Tab = "images" | "font" | "typo";

/** Left dock with tabs: Ảnh (import) / Font (fonts) / Typo (typo library). */
export function LeftPanel() {
  const [tab, setTab] = useState<Tab>("images");

  return (
    <aside className="left-panel">
      <div className="panel-tabs">
        <button className={"tab" + (tab === "images" ? " active" : "")} onClick={() => setTab("images")}>
          Ảnh
        </button>
        <button className={"tab" + (tab === "font" ? " active" : "")} onClick={() => setTab("font")}>
          Font
        </button>
        <button className={"tab" + (tab === "typo" ? " active" : "")} onClick={() => setTab("typo")}>
          Typo
        </button>
      </div>
      {tab === "images" && <ImagePanel />}
      {tab === "font" && <FontPanel />}
      {tab === "typo" && <TypoPanel />}
    </aside>
  );
}
