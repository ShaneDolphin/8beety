// Picks the export's console shell + playthrough palette for a chip.
import type { FrameScript } from "../engine/frame-script";
import { DMG } from "./gb-render";
import { drawGbShell, type Rect } from "./gb-shell";
import { drawGenesisShell, GENESIS_VIEW } from "./genesis-shell";
import { drawSnesShell, SNES_VIEW } from "./snes-shell";

export type ViewPalette = readonly [string, string, string, string];

export function shellFor(chip: FrameScript["chip"]): {
  drawShell: (g: CanvasRenderingContext2D, w: number, h: number, title: string) => Rect;
  palette: ViewPalette;
} {
  if (chip === "snes") return { drawShell: drawSnesShell, palette: SNES_VIEW };
  if (chip === "sega") return { drawShell: drawGenesisShell, palette: GENESIS_VIEW };
  return { drawShell: drawGbShell, palette: DMG };
}
