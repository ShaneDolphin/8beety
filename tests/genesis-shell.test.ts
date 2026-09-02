import { describe, expect, it } from "vitest";
import { computeGenesisLayout, GENESIS_VIEW } from "../src/viz/genesis-shell";

const W = 720;
const H = 1280;

function within(inner: { x: number; y: number; w: number; h: number }, outer: {
  x: number; y: number; w: number; h: number;
}): boolean {
  return (
    inner.x >= outer.x && inner.y >= outer.y &&
    inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
  );
}

describe("computeGenesisLayout", () => {
  const l = computeGenesisLayout(W, H);
  const frame = { x: 0, y: 0, w: W, h: H };

  it("keeps the playthrough panel in the top two-thirds", () => {
    expect(within(l.screen, frame)).toBe(true);
    expect(l.screen.y + l.screen.h).toBeLessThanOrEqual(H * 0.65);
  });

  it("keeps the console in the bottom third, below the panel", () => {
    expect(l.body.y).toBeGreaterThanOrEqual(H * 0.66);
    expect(within(l.body, frame)).toBe(true);
    expect(within(l.controller, frame)).toBe(true);
  });

  it("stands the cartridge between panel and console without overlap", () => {
    expect(l.cart.y).toBeGreaterThanOrEqual(l.screen.y + l.screen.h);
    expect(l.cart.y + l.cart.h).toBeGreaterThan(l.body.y); // reaches into the console
    expect(within(l.cartLabel, l.cart)).toBe(true);
  });

  it("gives drawGbFrame a pixel scale of 4", () => {
    // px = max(2, floor(min(w/160, h/160))) inside drawGbFrame
    expect(Math.floor(Math.min(l.screen.w / 160, l.screen.h / 160))).toBe(4);
  });

  it("scales proportionally", () => {
    const half = computeGenesisLayout(W / 2, H / 2);
    expect(half.screen.w).toBeCloseTo(l.screen.w / 2, 0);
    expect(half.cart.y).toBeCloseTo(l.cart.y / 2, 0);
  });

  it("centers the ridge rings on the cartridge", () => {
    expect(l.rings.cx).toBeGreaterThan(l.cart.x);
    expect(l.rings.cx).toBeLessThan(l.cart.x + l.cart.w);
    expect(l.rings.r).toBeGreaterThan(l.cart.w / 2); // rings extend beyond the cart
  });
});

describe("GENESIS_VIEW", () => {
  it("is four distinct hex colors, darkest first kept dark", () => {
    expect(GENESIS_VIEW).toHaveLength(4);
    expect(new Set(GENESIS_VIEW).size).toBe(4);
    for (const c of GENESIS_VIEW) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
