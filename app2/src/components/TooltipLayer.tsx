import { useEffect, useRef, useState } from "react";

/** Global styled tooltips: every element with a `title` gets a fast, themed
 *  tooltip instead of the slow OS default. On first hover the title moves to
 *  data-tip (kills the native bubble) and aria-label (keeps accessibility). */
export function TooltipLayer() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number; up: boolean } | null>(null);
  const timer = useRef<number | null>(null);
  const anchor = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const clear = () => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = null;
      anchor.current = null;
      setTip(null);
    };

    const onOver = (e: MouseEvent) => {
      let el = (e.target as HTMLElement)?.closest?.("[title], [data-tip]") as HTMLElement | null;
      if (!el) return clear();
      // adopt the native title once — the OS bubble never appears again
      const t = el.getAttribute("title");
      if (t) {
        el.setAttribute("data-tip", t);
        if (!el.getAttribute("aria-label")) el.setAttribute("aria-label", t);
        el.removeAttribute("title");
      }
      const text = el.getAttribute("data-tip");
      if (!text || el === anchor.current) return;
      if (timer.current) window.clearTimeout(timer.current);
      anchor.current = el;
      timer.current = window.setTimeout(() => {
        const cur = anchor.current;
        if (!cur || !cur.isConnected) return;
        const r = cur.getBoundingClientRect();
        const up = r.bottom + 40 > window.innerHeight; // sát đáy → lật lên trên
        setTip({
          text: cur.getAttribute("data-tip") ?? "",
          x: Math.min(Math.max(r.left + r.width / 2, 12), window.innerWidth - 12),
          y: up ? r.top - 7 : r.bottom + 7,
          up,
        });
      }, 350);
    };

    window.addEventListener("mouseover", onOver);
    window.addEventListener("mousedown", clear, true);
    window.addEventListener("scroll", clear, true);
    window.addEventListener("keydown", clear, true);
    return () => {
      window.removeEventListener("mouseover", onOver);
      window.removeEventListener("mousedown", clear, true);
      window.removeEventListener("scroll", clear, true);
      window.removeEventListener("keydown", clear, true);
    };
  }, []);

  if (!tip) return null;
  return (
    <div
      className={"app-tip" + (tip.up ? " up" : "")}
      style={{ left: tip.x, top: tip.y }}
      role="tooltip"
    >
      {tip.text}
    </div>
  );
}
