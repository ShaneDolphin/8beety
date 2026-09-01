import { describe, expect, it } from "vitest";
import { applyTweaks, getPreset } from "../src/engine/instruments";

const lead = getPreset("square-lead"); // vol sustain 12, duty 2, vibrato after 20

describe("applyTweaks", () => {
  it("returns the instrument unchanged without tweaks", () => {
    expect(applyTweaks(lead)).toBe(lead);
    expect(applyTweaks(lead, {})).toEqual(lead);
  });

  it("attack ramps to the preset peak; decay 0 sustains", () => {
    const out = applyTweaks(lead, { attack: 4, decay: 0 });
    expect(out.volume.values).toEqual([2, 5, 7, 10, 12]);
    expect(out.volume.loop).toBeUndefined(); // holds the last value (sustain)
  });

  it("decay falls from peak to zero", () => {
    const out = applyTweaks(lead, { attack: 0, decay: 5 });
    expect(out.volume.values).toEqual([12, 10, 7, 5, 2, 0]);
  });

  it("attack and decay combine", () => {
    const out = applyTweaks(lead, { attack: 2, decay: 2 });
    expect(out.volume.values).toEqual([4, 8, 12, 6, 0]);
  });

  it("vibrato depth/delay rewrite the pitch macro", () => {
    const out = applyTweaks(lead, { vibratoDepth: 4, vibratoDelay: 6 });
    expect(out.pitch!.values.slice(0, 6)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(out.pitch!.values.slice(6)).toEqual([0, 2, 4, 2, 0, -2, -4, -2]);
    expect(out.pitch!.loop).toBe(6);
  });

  it("vibrato depth 0 removes the pitch macro", () => {
    expect(applyTweaks(lead, { vibratoDepth: 0 }).pitch).toBeUndefined();
  });

  it("duty override applies to pulse instruments only", () => {
    expect(applyTweaks(lead, { duty: 0 }).duty!.values).toEqual([0]);
    const tri = getPreset("tri-bass");
    expect(applyTweaks(tri, { duty: 0 }).duty).toBeUndefined();
  });

  it("does not mutate the preset", () => {
    applyTweaks(lead, { attack: 3, decay: 3, duty: 1, vibratoDepth: 2 });
    expect(lead.volume.values).toEqual([12]);
    expect(lead.duty!.values).toEqual([2]);
  });
});
