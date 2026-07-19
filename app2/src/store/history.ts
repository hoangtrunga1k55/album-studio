import { useAlbum, type Spread } from "./album";

/** App-level Undo/Redo (⌘Z / ⌘⇧Z) over the album's SPREADS — layout, frames,
 *  photos-in-slots, texts, typos, margins. Snapshots are cheap: the store is
 *  immutable, so history entries share every unchanged spread object.
 *
 *  Coalescing: changes landing within 350ms of the previous push (slider
 *  drags, live frame moves) fold into one undo step. */

const MAX_STEPS = 50;
const COALESCE_MS = 350;

let past: Spread[][] = [];
let future: Spread[][] = [];
let stable: Spread[] | null = null; // spreads as of the last committed step
let lastPush = 0;
let restoring = false;
let unsub: (() => void) | null = null;

export function initHistory(): () => void {
  // re-entrant: a dev hot-reload (or double mount) re-subscribes to the
  // CURRENT store — a stale subscription on a replaced store records nothing
  unsub?.();
  stable = useAlbum.getState().spreads;
  unsub = useAlbum.subscribe((s) => {
    if (restoring) return;
    if (s.spreads === stable) return;
    const now = Date.now();
    if (now - lastPush > COALESCE_MS) {
      // new gesture → the state BEFORE it becomes an undo step
      if (stable) past.push(stable);
      if (past.length > MAX_STEPS) past.shift();
      future = [];
    }
    // within the window: keep the existing step, just advance the tip
    lastPush = now;
    stable = s.spreads;
  });
  return () => {
    unsub?.();
    unsub = null;
  };
}

/** Open/new project: the timeline restarts. */
export function clearHistory(): void {
  past = [];
  future = [];
  stable = useAlbum.getState().spreads;
  lastPush = 0;
}

const clampIndex = (spreads: Spread[], i: number) =>
  Math.min(Math.max(0, i), Math.max(0, spreads.length - 1));

function apply(spreads: Spread[]): void {
  restoring = true;
  const s = useAlbum.getState();
  useAlbum.setState({
    spreads,
    currentIndex: clampIndex(spreads, s.currentIndex),
    selectedSlot: null,
    selectedText: null,
    selectedTypo: null,
    multiSel: [],
    previewTemplateId: null,
  });
  stable = spreads;
  restoring = false;
}

export function undo(): boolean {
  const prev = past.pop();
  if (!prev) return false;
  future.push(useAlbum.getState().spreads);
  apply(prev);
  return true;
}

export function redo(): boolean {
  const next = future.pop();
  if (!next) return false;
  past.push(useAlbum.getState().spreads);
  if (past.length > MAX_STEPS) past.shift();
  apply(next);
  return true;
}