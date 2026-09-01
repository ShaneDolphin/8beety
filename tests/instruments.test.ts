import { describe, expect, it } from "vitest";
import { PRESETS, getPreset, macroValue, presetsForKind } from "../src/engine/instruments";

describe("macroValue", () => {
  it("holds the last value when there is no loop", () => {
    const m = { values: [15, 10, 5] };
    expect(macroValue(m, 0)).toBe(15);
    expect(macroValue(m, 2)).toBe(5);
    expect(macroValue(m, 10)).toBe(5);
  });
  it("loops from the loop index", () => {
    const m = { values: [0, 1, 2, 1, 0, -1, -2, -1], loop: 0 };
    expect(macroValue(m, 8)).toBe(0);
    expect(macroValue(m, 9)).toBe(1);
    expect(macroValue(m, 17)).toBe(1);
  });
  it("loops a suffix when loop index is mid-table", () => {
    const m = { values: [9, 9, 3, 4], loop: 2 };
    expect(macroValue(m, 4)).toBe(3);
    expect(macroValue(m, 5)).toBe(4);
    expect(macroValue(m, 6)).toBe(3);
  });
});

describe("presets", () => {
  it("Pluck decays to silence", () => {
    const pluck = getPreset("pluck");
    const v = pluck.volume.values;
    expect(v[0]).toBe(15);
    expect(v[v.length - 1]).toBe(0);
    expect(pluck.volume.loop).toBeUndefined();
  });
  it("filters presets by channel kind", () => {
    const pulseIds = presetsForKind("pulse").map((p) => p.id);
    expect(pulseIds).toContain("square-lead");
    expect(pulseIds).not.toContain("tri-bass");
    const triIds = presetsForKind("triangle").map((p) => p.id);
    expect(triIds).toContain("tri-bass");
    expect(triIds).not.toContain("square-lead");
  });
  it("every preset has a non-empty volume macro and unique id", () => {
    const ids = new Set<string>();
    for (const p of PRESETS) {
      expect(p.volume.values.length).toBeGreaterThan(0);
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });
});
