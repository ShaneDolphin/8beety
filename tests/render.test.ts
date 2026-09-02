import { describe, expect, it } from "vitest";
import { channelCountForChip } from "../src/audio/render";

// F1: WAV/video export must render stereo for every stereo chip profile
// (gb, sega, snes), not just gb — offline rendering isn't easily driven
// end-to-end under Node/Vitest (no real OfflineAudioContext), so this pins
// the channel-count decision that render.ts derives from the chip profile.
describe("channelCountForChip", () => {
  it("nes is mono", () => {
    expect(channelCountForChip("nes")).toBe(1);
  });
  it("nes-vrc6 is mono (shares the nes profile)", () => {
    expect(channelCountForChip("nes-vrc6")).toBe(1);
  });
  it("gb is stereo", () => {
    expect(channelCountForChip("gb")).toBe(2);
  });
  it("sega is stereo", () => {
    expect(channelCountForChip("sega")).toBe(2);
  });
  it("snes is stereo", () => {
    expect(channelCountForChip("snes")).toBe(2);
  });
});
