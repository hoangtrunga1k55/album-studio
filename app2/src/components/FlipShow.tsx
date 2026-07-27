import { useCallback, useEffect, useRef, useState } from "react";
import { useAlbum } from "../store/album";
import { spreadLabel } from "../store/album";
import { parseSizeCm } from "../engine/templates";
import { renderSpreadImage } from "../engine/renderPreview";
import type { RenderResult } from "../engine/renderSpread";
import "./FlipShow.css";

/** Spread window rendered around the active one — the rest sit off-stage. */
const WINDOW = 2;
/** Screen-render width per spread (device px) — crisp enough on screen, quick
 *  to draw. Print export stays full-res on its own path. */
const TARGET_W = 1280;

/** F8 — 3D Flip Preview: a fullscreen client show. The active spread sits flat
 *  and sharp in the middle; neighbours tilt back into depth and dim. Navigate
 *  with ‹ ›, click a side spread, arrow keys, or Esc to leave. */
export function FlipShow({ onClose }: { onClose: () => void }) {
  const spreads = useAlbum((s) => s.spreads);
  const images = useAlbum((s) => s.images);
  const bgColor = useAlbum((s) => s.bgColor);
  const size = useAlbum((s) => s.size);
  const settings = useAlbum((s) => s.settings);
  const startIndex = useAlbum((s) => s.currentIndex);

  const [active, setActive] = useState(startIndex);
  const [cache, setCache] = useState<Record<number, RenderResult>>({});
  const [errs, setErrs] = useState<Record<number, string>>({});
  const pending = useRef<Set<number>>(new Set());

  const go = useCallback(
    (dir: number) =>
      setActive((a) => Math.min(spreads.length - 1, Math.max(0, a + dir))),
    [spreads.length]
  );

  // Keyboard: arrows + < > (and , .) navigate, Esc leaves.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "Escape") onClose();
      else if (k === "ArrowRight" || k === "ArrowDown" || k === "." || k === ">") go(1);
      else if (k === "ArrowLeft" || k === "ArrowUp" || k === "," || k === "<") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  // Render the active spread + its neighbours on demand (never blocks the UI).
  useEffect(() => {
    const opts = {
      images,
      bgColor,
      pageCm: parseSizeCm(size),
      borderPt: settings.borderPt,
      borderColor: settings.borderColor,
      targetW: TARGET_W,
    };
    // No `alive` gate: a render in flight when the effect re-runs (StrictMode
    // remount, dep change) must still populate the cache — dropping it would
    // strand that spread (its index stays out of `pending` yet uncached) and it
    // would only appear after navigating away and back. setCache after unmount
    // is a harmless no-op in React 18+.
    (async () => {
      for (let d = 0; d <= WINDOW; d++) {
        for (const i of d === 0 ? [active] : [active - d, active + d]) {
          if (i < 0 || i >= spreads.length) continue;
          if (cache[i] || pending.current.has(i)) continue;
          pending.current.add(i);
          try {
            const res = await renderSpreadImage(spreads[i], opts);
            setCache((c) => ({ ...c, [i]: res }));
          } catch (e) {
            setErrs((m) => ({ ...m, [i]: String(e) })); // surfaced on the card
          } finally {
            pending.current.delete(i);
          }
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, spreads, images, bgColor, size, settings.borderPt, settings.borderColor]);

  const total = spreads.length;

  return (
    <div className="flip-show" onClick={onClose}>
      <div className="flip-stage" onClick={(e) => e.stopPropagation()}>
        {spreads.map((_sp, i) => {
          const offset = i - active;
          const far = Math.abs(offset) > WINDOW;
          const res = cache[i];
          const aspect = res ? res.w / res.h : 2;
          return (
            <div
              key={i}
              className={"flip-card" + (offset === 0 ? " active" : "")}
              aria-hidden={offset !== 0}
              style={{
                aspectRatio: String(aspect),
                transform: cardTransform(offset),
                opacity: far ? 0 : offset === 0 ? 1 : 0.5,
                filter: offset === 0 ? "none" : "brightness(0.6)",
                pointerEvents: far || offset === 0 ? "none" : "auto",
                zIndex: 100 - Math.abs(offset),
              }}
              onClick={() => offset !== 0 && setActive(i)}
            >
              {res ? (
                <img src={res.dataUrl} alt={spreadLabel(spreads, i)} draggable={false} />
              ) : errs[i] ? (
                <div className="flip-loading err">Lỗi dựng: {errs[i]}</div>
              ) : (
                <div className="flip-loading">Đang dựng…</div>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="flip-nav left"
        disabled={active <= 0}
        onClick={(e) => {
          e.stopPropagation();
          go(-1);
        }}
        title="Trước (← hoặc <)"
      >
        ‹
      </button>
      <button
        className="flip-nav right"
        disabled={active >= total - 1}
        onClick={(e) => {
          e.stopPropagation();
          go(1);
        }}
        title="Sau (→ hoặc >)"
      >
        ›
      </button>

      <div className="flip-hud" onClick={(e) => e.stopPropagation()}>
        {active + 1} / {total} · {spreadLabel(spreads, active)}
      </div>
      <button className="flip-close" onClick={onClose} title="Thoát (Esc)">
        ✕
      </button>
    </div>
  );
}

/** Depth transform for a card `offset` spreads from the active one. */
function cardTransform(offset: number): string {
  if (offset === 0) return "translateX(0) translateZ(0) rotateY(0deg) scale(1)";
  const dir = Math.sign(offset);
  const n = Math.abs(offset);
  const x = dir * (52 + (n - 1) * 26); // % of card width, fanned out
  const z = -180 * n; // px into depth
  const rot = -dir * 34; // tilt toward the centre
  const scale = Math.max(0.6, 1 - 0.12 * n);
  return `translateX(${x}%) translateZ(${z}px) rotateY(${rot}deg) scale(${scale})`;
}