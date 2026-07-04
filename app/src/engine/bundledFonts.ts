import { registerLoaded, type LoadedFont } from "../ipc/fonts";

/** Bundled fonts (Layer 1, §4.4.1) — shipped with the app, ready on launch. */
const urls = import.meta.glob<string>("../assets/fonts/*.ttf", {
  eager: true,
  import: "default",
  query: "?url",
});

// file stem → family name + PostScript name + Vietnamese-diacritic support
const META: Record<string, { family: string; ps: string; vn: boolean }> = {
  "BeVietnamPro-Regular": { family: "Be Vietnam Pro", ps: "BeVietnamPro-Regular", vn: true },
  "BeVietnamPro-SemiBold": { family: "Be Vietnam Pro SemiBold", ps: "BeVietnamPro-SemiBold", vn: true },
  Montserrat: { family: "Montserrat", ps: "Montserrat-Regular", vn: true },
  PlayfairDisplay: { family: "Playfair Display", ps: "PlayfairDisplay-Regular", vn: true },
  Lora: { family: "Lora", ps: "Lora-Regular", vn: true },
  EBGaramond: { family: "EB Garamond", ps: "EBGaramond-Regular", vn: true },
  DancingScript: { family: "Dancing Script", ps: "DancingScript-Regular", vn: true },
  Pacifico: { family: "Pacifico", ps: "Pacifico", vn: true },
  "GreatVibes-Regular": { family: "Great Vibes", ps: "GreatVibes-Regular", vn: false },
  "Sacramento-Regular": { family: "Sacramento", ps: "Sacramento", vn: false },
};

export const BUNDLED_FONTS: LoadedFont[] = Object.entries(urls)
  .map(([path, url]) => {
    const file = path.split("/").pop()!.replace(".ttf", "");
    const meta = META[file] ?? { family: file, ps: file, vn: false };
    return { family: meta.family, postscript: meta.ps, dataUri: url, hasVietnamese: meta.vn, file };
  })
  .sort((a, b) => a.family.localeCompare(b.family));

/** Register all bundled fonts with the webview; returns them for the font store. */
export async function registerBundledFonts(): Promise<LoadedFont[]> {
  const out: LoadedFont[] = [];
  for (const b of BUNDLED_FONTS) {
    await registerLoaded(b);
    out.push(b);
  }
  return out;
}
