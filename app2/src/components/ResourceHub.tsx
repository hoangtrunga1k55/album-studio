import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { HUB_TABS } from "./resourceHubConfig";
import "./ResourceHub.css";

const STARTUP_KEY = "albumstudio2.hub.showOnStartup";

/** Whether the Resource Hub should auto-open on launch (default: yes). */
export function hubShowsOnStartup(): boolean {
  return localStorage.getItem(STARTUP_KEY) !== "0";
}

/** Promo / resource modal (Capture One "Resource Hub" style). Content + links
 *  come from resourceHubConfig — fill those in to point at real pages. */
export function ResourceHub({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState(HUB_TABS[0]?.id ?? "");
  const [onStartup, setOnStartup] = useState(hubShowsOnStartup());
  const active = HUB_TABS.find((t) => t.id === tab) ?? HUB_TABS[0];

  const go = (href?: string) => {
    if (!href) return;
    void openUrl(href).catch(() => {});
  };
  const toggleStartup = (v: boolean) => {
    setOnStartup(v);
    localStorage.setItem(STARTUP_KEY, v ? "1" : "0");
  };

  if (!active) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="hub" onClick={(e) => e.stopPropagation()}>
        <div className="hub-head">
          <span>Resource Hub</span>
          <button className="hub-x" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="hub-tabs">
          {HUB_TABS.map((t) => (
            <button
              key={t.id}
              className={"hub-tab" + (t.id === tab ? " active" : "") + (t.accent ? " accent" : "")}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div
          className="hub-banner"
          style={active.image ? { backgroundImage: `url(${active.image})` } : undefined}
        >
          <div className="hub-copy">
            <h2>{active.title}</h2>
            <p>{active.body}</p>
            <div className="hub-cta">
              {active.primary && (
                <button className="hub-btn primary" onClick={() => go(active.primary!.href)}>
                  {active.primary.label}
                </button>
              )}
              {active.secondary && (
                <button className="hub-btn" onClick={() => go(active.secondary!.href)}>
                  {active.secondary.label}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="hub-foot">
          <label className="hub-startup">
            <input
              type="checkbox"
              checked={onStartup}
              onChange={(e) => toggleStartup(e.target.checked)}
            />
            <span>Hiện khi mở app</span>
          </label>
          <button className="btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
