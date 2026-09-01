import { describe, expect, it } from "vitest";
import { computeShellLayout } from "../src/viz/gb-shell";

const W = 720;
const H = 1280;

function within(inner: { x: number; y: number; w: number; h: number }, outer: {
  x: number;
  y: number;
  w: number;
  h: number;
}): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w &&
    inner.y + inner.h <= outer.y + outer.h
  );
}

describe("computeShellLayout", () => {
  const l = computeShellLayout(W, H);

  it("keeps the housing inside the canvas", () => {
    expect(within(l.housing, { x: 0, y: 0, w: W, h: H })).toBe(true);
  });

  it("nests bezel in housing and screen in bezel", () => {
    expect(within(l.bezel, l.housing)).toBe(true);
    expect(within(l.screen, l.bezel)).toBe(true);
  });

  it("keeps the DMG 160:144 screen aspect", () => {
    expect(l.screen.w / l.screen.h).toBeCloseTo(160 / 144, 2);
  });

  it("leaves bezel room below the screen for the title", () => {
    expect(l.bezel.y + l.bezel.h - (l.screen.y + l.screen.h)).toBeGreaterThan(30);
  });

  it("places controls inside the housing below the bezel", () => {
    const bezelBottom = l.bezel.y + l.bezel.h;
    expect(l.dpad.cy - l.dpad.size / 2).toBeGreaterThan(bezelBottom);
    for (const b of [l.buttonA, l.buttonB]) {
      expect(b.cy - b.r).toBeGreaterThan(bezelBottom);
      expect(b.cx + b.r).toBeLessThan(l.housing.x + l.housing.w);
    }
    expect(l.dpad.cx - l.dpad.size / 2).toBeGreaterThan(l.housing.x);
    for (const p of [l.select, l.start]) {
      expect(p.cy).toBeGreaterThan(Math.max(l.dpad.cy, l.buttonB.cy));
      expect(p.cy).toBeLessThan(l.housing.y + l.housing.h);
    }
    expect(l.select.cx).toBeLessThan(l.start.cx);
  });

  it("scales with canvas size", () => {
    const half = computeShellLayout(W / 2, H / 2);
    expect(half.screen.w).toBeCloseTo(l.screen.w / 2, 0);
    expect(half.dpad.cy).toBeCloseTo(l.dpad.cy / 2, 0);
  });
});
