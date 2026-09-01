import { describe, expect, it } from "vitest";
import { DRUM_PRESETS, gmDrumPreset } from "../src/engine/drums";

describe("GM drum map (§7.5)", () => {
  it.each([
    [35, "kick"],
    [36, "kick"],
    [37, "metal-hit"],
    [38, "snare"],
    [40, "snare"],
    [41, "tom-low"],
    [43, "tom-low"],
    [45, "tom-mid"],
    [47, "tom-mid"],
    [48, "tom-high"],
    [50, "tom-high"],
    [42, "closed-hat"],
    [44, "closed-hat"],
    [46, "open-hat"],
    [49, "crash"],
    [52, "crash"],
    [55, "crash"],
    [57, "crash"],
    [51, "ride"],
    [53, "ride"],
    [59, "ride"],
    [81, "closed-hat"], // everything else
  ])("GM %i → %s", (note, presetId) => {
    expect(gmDrumPreset(note).id).toBe(presetId);
  });
});

describe("drum presets", () => {
  const byId = (id: string) => {
    const p = DRUM_PRESETS.find((x) => x.id === id);
    if (!p) throw new Error(id);
    return p;
  };

  it("tom tiers use three distinct noise periods (kick at higher pitches)", () => {
    const periods = ["tom-low", "tom-mid", "tom-high"].map((id) => byId(id).period.values[0]);
    expect(new Set(periods).size).toBe(3);
    expect(periods[0]).toBeGreaterThan(periods[1]); // low tom = bigger period = lower pitch
    expect(periods[1]).toBeGreaterThan(periods[2]);
  });

  it("priorities: kick > snare > crash > toms > open hat > metal > ride > closed hat", () => {
    const pr = (id: string) => byId(id).priority;
    expect(pr("kick")).toBeGreaterThan(pr("snare"));
    expect(pr("snare")).toBeGreaterThan(pr("crash"));
    expect(pr("crash")).toBeGreaterThan(pr("tom-low"));
    expect(pr("tom-low")).toBeGreaterThan(pr("open-hat"));
    expect(pr("open-hat")).toBeGreaterThan(pr("metal-hit"));
    expect(pr("metal-hit")).toBeGreaterThan(pr("ride"));
    expect(pr("ride")).toBeGreaterThan(pr("closed-hat"));
  });

  it("every preset decays to silence with no loop", () => {
    for (const p of DRUM_PRESETS) {
      expect(p.volume.values[p.volume.values.length - 1]).toBe(0);
      expect(p.volume.loop).toBeUndefined();
      expect(p.period.values.length).toBeGreaterThan(0);
    }
  });

  it("kick, snare and closed hat are distinguishable (period and decay length)", () => {
    const kick = byId("kick");
    const snare = byId("snare");
    const hat = byId("closed-hat");
    expect(kick.period.values[0]).toBeGreaterThan(snare.period.values[0]);
    expect(snare.period.values[0]).toBeGreaterThan(hat.period.values[0]);
    expect(snare.volume.values.length).toBeGreaterThan(hat.volume.values.length);
  });

  it("crash decays for about 30 frames; metal hit uses the short LFSR", () => {
    expect(byId("crash").volume.values.length).toBeGreaterThanOrEqual(28);
    expect(byId("metal-hit").mode).toBe("short");
    expect(byId("kick").mode).toBe("long");
  });
});
