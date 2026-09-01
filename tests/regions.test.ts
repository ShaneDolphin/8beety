import { describe, expect, it } from "vitest";
import { mergeRegions, splitRegions, updateRegion } from "../src/engine/regions";
import type { Region } from "../src/engine/project";

describe("splitRegions", () => {
  it("splits a region-less track into two whole-song halves", () => {
    expect(splitRegions(undefined, 4, 8)).toEqual([
      { startBar: 0, endBar: 4 },
      { startBar: 4, endBar: 8 },
    ]);
  });

  it("splits inside an existing region, inheriting its overrides", () => {
    const regions: Region[] = [
      { startBar: 0, endBar: 4 },
      { startBar: 4, endBar: 8, instrumentId: "pluck" },
    ];
    expect(splitRegions(regions, 6, 8)).toEqual([
      { startBar: 0, endBar: 4 },
      { startBar: 4, endBar: 6, instrumentId: "pluck" },
      { startBar: 6, endBar: 8, instrumentId: "pluck" },
    ]);
  });

  it("is a no-op at an existing boundary or out of range", () => {
    const regions: Region[] = [
      { startBar: 0, endBar: 4 },
      { startBar: 4, endBar: 8 },
    ];
    expect(splitRegions(regions, 4, 8)).toBe(regions);
    expect(splitRegions(regions, 0, 8)).toBe(regions);
    expect(splitRegions(undefined, 0, 8)).toBeUndefined();
  });
});

describe("mergeRegions", () => {
  const regions: Region[] = [
    { startBar: 0, endBar: 4, instrumentId: "square-lead" },
    { startBar: 4, endBar: 6, instrumentId: "pluck" },
    { startBar: 6, endBar: 8 },
  ];

  it("merges a region into its predecessor, keeping the predecessor's overrides", () => {
    expect(mergeRegions(regions, 1)).toEqual([
      { startBar: 0, endBar: 6, instrumentId: "square-lead" },
      { startBar: 6, endBar: 8 },
    ]);
  });

  it("clears regions entirely when only one would remain", () => {
    expect(mergeRegions(regions.slice(0, 2), 1)).toBeUndefined();
  });

  it("ignores invalid indices", () => {
    expect(mergeRegions(regions, 0)).toBe(regions);
    expect(mergeRegions(regions, 9)).toBe(regions);
  });
});

describe("updateRegion", () => {
  it("patches one region immutably", () => {
    const regions: Region[] = [
      { startBar: 0, endBar: 4 },
      { startBar: 4, endBar: 8 },
    ];
    const out = updateRegion(regions, 1, { instrumentId: "pluck", polyMode: "arp" });
    expect(out[1]).toEqual({ startBar: 4, endBar: 8, instrumentId: "pluck", polyMode: "arp" });
    expect(regions[1].instrumentId).toBeUndefined();
  });
});
