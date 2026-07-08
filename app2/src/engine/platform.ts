/** Platform-aware shortcut labels: ⌘ on macOS, Ctrl+ on Windows/Linux. */
export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/.test(navigator.platform);

/** mod("D") → "⌘D" on Mac, "Ctrl+D" on Windows. mod("⇧D") handled too. */
export function mod(key: string): string {
  if (IS_MAC) return `⌘${key}`;
  return `Ctrl+${key.replace("⇧", "Shift+")}`;
}
