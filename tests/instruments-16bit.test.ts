import { describe, expect, it } from "vitest";
import { getPreset, presetsForKind } from "../src/engine/instruments";
import { remapForChip } from "../src/engine/arrange-ops";

describe("16-bit presets", () => {
  it("fm presets cover the 8 patches", () => {
    const fm = presetsForKind("fm");
    expect(fm).toHaveLength(8);
    expect(getPreset("fm-epiano").duty?.values[0]).toBe(0);
    expect(getPreset("fm-pluck").duty?.values[0]).toBe(7);
  });
  it("sample presets point at bank indices", () => {
    expect(getPreset("spc-strings").duty?.values[0]).toBe(0);
    expect(getPreset("spc-choir").duty?.values[0]).toBe(6);
  });
});

describe("remapForChip across four chips", () => {
  const track = (slots: string[], instrumentId: string) => ({
    id: "t", sourceIndex: 0, name: "T", slots, instrumentId, polyMode: "top" as const,
    arpFramesPerStep: 1 as const, octaveShift: 0, transpose: 0, volume: 15, mute: false, solo: false,
  });
  it("nes lead maps onto a sega fm lane with an fm instrument", () => {
    const [t] = remapForChip([track(["p1"], "square-lead")], "sega");
    expect(t.slots).toEqual(["fm1"]);
    expect(t.instrumentId).toBe("fm-lead");
  });
  it("nes noise drums map to the sega dac lane", () => {
    const [t] = remapForChip([track(["noise"], "square-lead")], "sega");
    expect(t.slots).toEqual(["dac"]);
  });
  it("sega fm maps back to nes pulse", () => {
    const [t] = remapForChip([track(["fm1"], "fm-lead")], "nes");
    expect(t.slots).toEqual(["p1"]);
    expect(t.instrumentId).toBe("square-lead");
  });
  it("snes voices map from gb slots", () => {
    const [t] = remapForChip([track(["wave"], "wave-bass")], "snes");
    expect(t.slots).toEqual(["v3"]);
    expect(t.instrumentId).toBe("spc-bass");
  });
});
