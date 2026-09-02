import { describe, expect, it } from "vitest";
import { PROFILES, profileFor, SEGA_PROFILE, SNES_PROFILE } from "../src/engine/chip-profiles";

describe("16-bit profiles", () => {
  it("sega: five fm lanes and a drums-only dac lane, stereo", () => {
    expect(SEGA_PROFILE.id).toBe("sega");
    expect(SEGA_PROFILE.stereo).toBe(true);
    expect(SEGA_PROFILE.channels).toHaveLength(6);
    expect(SEGA_PROFILE.channels.slice(0, 5).every((c) => c.kind === "fm")).toBe(true);
    const dac = SEGA_PROFILE.channels[5];
    expect(dac.kind).toBe("sample");
    expect(dac.acceptsDrums).toBe(true);
  });
  it("snes: eight sample voices, stereo, all accept drums", () => {
    expect(SNES_PROFILE.channels).toHaveLength(8);
    expect(SNES_PROFILE.channels.every((c) => c.kind === "sample" && c.acceptsDrums)).toBe(true);
  });
  it("profileFor resolves every playable chip", () => {
    for (const id of ["nes", "gb", "sega", "snes"] as const) {
      expect(profileFor(id).id).toBe(id);
    }
    expect(PROFILES.sega).toBe(SEGA_PROFILE);
  });
});
