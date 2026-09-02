import { describe, expect, it } from "vitest";
import { DMG } from "../src/viz/gb-render";
import { drawGbShell } from "../src/viz/gb-shell";
import { drawGenesisShell, GENESIS_VIEW } from "../src/viz/genesis-shell";
import { drawSnesShell, SNES_VIEW } from "../src/viz/snes-shell";
import { shellFor } from "../src/viz/shells";

describe("shellFor", () => {
  it("keeps nes, gb, and nes-vrc6 on the DMG handheld", () => {
    for (const chip of ["nes", "gb", "nes-vrc6"] as const) {
      const s = shellFor(chip);
      expect(s.drawShell).toBe(drawGbShell);
      expect(s.palette).toBe(DMG);
    }
  });
  it("routes snes to the SNES console and palette", () => {
    const s = shellFor("snes");
    expect(s.drawShell).toBe(drawSnesShell);
    expect(s.palette).toBe(SNES_VIEW);
  });
  it("routes sega to the Genesis console and palette", () => {
    const s = shellFor("sega");
    expect(s.drawShell).toBe(drawGenesisShell);
    expect(s.palette).toBe(GENESIS_VIEW);
  });
});
