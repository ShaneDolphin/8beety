# 16-Bit Export Shells (SNES + Genesis) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 9:16 video export chip-aware: SNES and Genesis projects get a console graphic in the bottom third with a chip-styled playthrough panel above; NES/GB keep the DMG handheld.

**Architecture:** Two new shell modules mirror gb-shell.ts's proven pattern (pure tested layout fn + draw fn returning the playthrough rect + exported palette). A tiny `shellFor(chip)` dispatcher picks shell+palette; `drawGbFrame` gains an optional palette; video-export swaps one call. Live app views untouched.

**Tech Stack:** Existing only — TypeScript strict, Canvas 2D, Vitest. No new dependencies, no image assets.

**Spec:** `docs/superpowers/specs/2026-09-02-16bit-export-shells-design.md`

## Global Constraints

- TypeScript strict. No `any`. No default exports except React components.
- No Nintendo or Sega logos, wordmarks, or company names anywhere in the drawings; SNES controller buttons use four purple shades, never red/yellow/green/blue.
- Playthrough panel: x 24, y 24, w 672, h 792 in the 720×1280 design box; consoles occupy the bottom third; the cartridge may rise into the 816–~860 gap but never overlaps the panel.
- All geometry authored in a 720×1280 design box, scaled by `min(w/720, h/1280)` and centered (identical to gb-shell.ts).
- `drawGbFrame`'s default palette stays DMG; the live in-app Game Boy View and the NES/GB export must be pixel-identical to today.
- Palettes verbatim: `SNES_VIEW = ["#1a1333", "#463a78", "#8578c8", "#d8d2f2"]`, `GENESIS_VIEW = ["#04101e", "#0f3a66", "#2c7fbf", "#7fe3ff"]`.
- Tests live in `tests/*.test.ts`; run `npm test` and `npm run build` before declaring done.

---

### Task 1: SNES shell module

**Files:**
- Create: `src/viz/snes-shell.ts`
- Test: `tests/snes-shell.test.ts`
- Read first: `src/viz/gb-shell.ts` (the pattern to mirror: design-box scaling, `roundedRect`, title auto-shrink) and `tests/gb-shell.test.ts`

**Interfaces:**
- Consumes: `import type { Rect } from "./gb-shell"` (already exported there).
- Produces: `SNES_VIEW: readonly [string, string, string, string]`; `interface SnesLayout { scale: number; screen: Rect; body: Rect; deck: Rect; cart: Rect; cartLabel: Rect; controller: Rect }`; `computeSnesLayout(w: number, h: number): SnesLayout`; `drawSnesShell(g: CanvasRenderingContext2D, w: number, h: number, title: string): Rect` (returns the screen/panel rect).

- [ ] **Step 1: Write the failing test**

```ts
// tests/snes-shell.test.ts
import { describe, expect, it } from "vitest";
import { computeSnesLayout, SNES_VIEW } from "../src/viz/snes-shell";

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

describe("computeSnesLayout", () => {
  const l = computeSnesLayout(W, H);
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
    const half = computeSnesLayout(W / 2, H / 2);
    expect(half.screen.w).toBeCloseTo(l.screen.w / 2, 0);
    expect(half.cart.y).toBeCloseTo(l.cart.y / 2, 0);
  });
});

describe("SNES_VIEW", () => {
  it("is four distinct hex colors, darkest first kept dark", () => {
    expect(SNES_VIEW).toHaveLength(4);
    expect(new Set(SNES_VIEW).size).toBe(4);
    for (const c of SNES_VIEW) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/snes-shell.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/viz/snes-shell.ts`**

Design-box geometry (all values in the 720×1280 box, scaled like gb-shell):

```ts
// SNES-style console for the video export. Logo-free homage: no Nintendo
// branding; action buttons are four purple shades, not the four-color
// Super Famicom diamond (trade dress). The song title lives on the cart label.
import type { Rect } from "./gb-shell";

export const SNES_VIEW = ["#1a1333", "#463a78", "#8578c8", "#d8d2f2"] as const;

export interface SnesLayout {
  scale: number;
  screen: Rect;
  body: Rect;
  deck: Rect;
  cart: Rect;
  cartLabel: Rect;
  controller: Rect;
}

const BOX_W = 720;
const BOX_H = 1280;

export function computeSnesLayout(w: number, h: number): SnesLayout {
  const s = Math.min(w / BOX_W, h / BOX_H);
  const ox = (w - BOX_W * s) / 2;
  const oy = (h - BOX_H * s) / 2;
  const r = (x: number, y: number, rw: number, rh: number): Rect => ({
    x: ox + x * s, y: oy + y * s, w: rw * s, h: rh * s,
  });
  return {
    scale: s,
    screen: r(24, 24, 672, 792),
    body: r(70, 940, 580, 210),
    deck: r(70, 940, 580, 70),
    cart: r(250, 830, 220, 118),
    cartLabel: r(266, 848, 188, 64),
    controller: r(380, 1090, 260, 110),
  };
}
```

Drawing (`drawSnesShell`) — reuse gb-shell's local helpers by copying the
small `roundedRect` helper (do NOT export/import it across shell files; each
shell file stays self-contained like gb-shell) and follow this paint order,
with `s = layout.scale` and colors from the spec:

1. Backdrop `#141019` full canvas; floor-shadow ellipse under the console
   (`ellipse(cx=360·s+ox, cy=1165·s+oy, rx=300·s, ry=28·s)`, `#000` at
   `globalAlpha 0.35`).
2. Panel frame behind the playthrough: `roundedRect` of `screen` grown by
   6·s, fill `#463a78`, then `screen` grown by 2·s fill `#1a1333` (the
   playthrough draw will cover it; the border ring is what shows).
3. Cartridge: `cart` fill `#8f8b99` (top corners rounded 10·s), darker side
   notches (two 12·s-wide `#77737f` vertical strips inset 16·s from each
   edge); `cartLabel` fill `#e8e4f0`, 2·s stroke `#6f5fb0`; title text —
   strip `\.midi?$/i`, uppercase, `bold Quantico, monospace`, start at 26px·s
   and shrink by 2 until it fits `cartLabel.w - 16·s` (same loop as
   gb-shell's title), centered in the label, fill `#2a2830`.
4. Body: rounded 18·s, fill `#b6b2bc`, stroke 3·s `#8f8b99`. Deck overlay:
   rounded top only, fill `#a5a1ad`; slot: centered dark bar 180×16 at
   y 948, fill `#2a2830` (the cart covers its middle).
5. Purple accents on the deck: two slider switches (24×36 rounded 6·s,
   `#6f5fb0`) at x 110 and x 146, y 952; oval eject 60×26 rounded 13·s
   `#6f5fb0` at x 470, y 955.
6. Front face details: two controller ports (36×28 rounded 6·s, `#55525d`)
   at x 120 and x 180, y 1060; power LED circle r 6·s `#d0342c` at
   (620, 1035).
7. Controller: `controller` rounded 40·s fill `#d8d5de`, stroke 2·s
   `#a5a1ad`; D-pad cross at (430, 1140), arms 64 long × 22 wide, rounded
   5·s, `#3a3844`; four action buttons r 13·s in a diamond centered
   (580, 1140) offset 26: top `#8b7fc4`, right `#6f5fb0`, bottom `#4f4386`,
   left `#5a4d9e`; two center pills 26×9 rounded 4·s `#8f8b99` at
   (492, 1136) and (492, 1152), rotated -25°.
8. Reset `textAlign`/`textBaseline` to `left`/`alphabetic`; return
   `layout.screen`.

- [ ] **Step 4: Run tests** — `npx vitest run tests/snes-shell.test.ts`, expect PASS; then `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/viz/snes-shell.ts tests/snes-shell.test.ts
git commit -m "feat: SNES-style console shell for video export"
```

---

### Task 2: Genesis shell module

**Files:**
- Create: `src/viz/genesis-shell.ts`
- Test: `tests/genesis-shell.test.ts`
- Read first: `src/viz/gb-shell.ts` and the just-landed `src/viz/snes-shell.ts`

**Interfaces:**
- Consumes: `import type { Rect } from "./gb-shell"`.
- Produces: `GENESIS_VIEW: readonly [string, string, string, string]`; `interface GenesisLayout { scale: number; screen: Rect; body: Rect; cart: Rect; cartLabel: Rect; controller: Rect; rings: { cx: number; cy: number; r: number } }`; `computeGenesisLayout(w, h): GenesisLayout`; `drawGenesisShell(g, w, h, title): Rect`.

- [ ] **Step 1: Write the failing test** — same structure as Task 1's test with these Genesis-specific assertions (plus the shared within/panel/scaling/px-scale/palette tests, adjusted to import from `../src/viz/genesis-shell` and `GENESIS_VIEW`):

```ts
// tests/genesis-shell.test.ts (delta from the snes test shape)
it("centers the ridge rings on the cartridge", () => {
  const l = computeGenesisLayout(720, 1280);
  expect(l.rings.cx).toBeGreaterThan(l.cart.x);
  expect(l.rings.cx).toBeLessThan(l.cart.x + l.cart.w);
  expect(l.rings.r).toBeGreaterThan(l.cart.w / 2); // rings extend beyond the cart
});
```

The panel/bottom-third/cart-bridge/px-scale/proportional/palette tests are identical in shape to Task 1's — write them out fully in the file (import names changed); layouts share the same `screen` rect values.

- [ ] **Step 2: Run to verify FAIL** (module not found).

- [ ] **Step 3: Implement `src/viz/genesis-shell.ts`**

```ts
export const GENESIS_VIEW = ["#04101e", "#0f3a66", "#2c7fbf", "#7fe3ff"] as const;
```

Layout (720×1280 box; same `r()` helper pattern as Task 1):

```ts
return {
  scale: s,
  screen: r(24, 24, 672, 792),
  body: r(60, 950, 600, 180),
  cart: r(290, 840, 180, 130),
  cartLabel: r(306, 858, 148, 70),
  controller: r(360, 1080, 280, 110),
  rings: { cx: ox + 380 * s, cy: oy + 1000 * s, r: 95 * s },
};
```

Paint order for `drawGenesisShell` (colors from the spec):

1. Backdrop `#0a0a0c`; floor shadow ellipse (cx 360, cy 1150, rx 310,
   ry 26, `#000` alpha 0.4).
2. Panel frame: `screen` grown 6·s fill `#0f3a66`, grown 2·s fill `#04101e`.
3. Cartridge: `cart` fill `#1d1d20` rounded 8·s, stroke 2·s `#2f2f33`;
   `cartLabel` fill `#d9d4c8`, stroke 2·s `#c9a227`; title text `#17171a`,
   same shrink-to-fit loop as Task 1 starting 24px·s, fit to
   `cartLabel.w - 14·s`, centered.
4. Body: rounded 14·s fill `#232326`, stroke 3·s `#101012`; top stripe:
   body's top 60·s fill `#17171a`.
5. Ridge rings: clip to the body rect, then stroke concentric circles at
   `rings.cx/cy` with radii `r`, `r−17·s`, `r−34·s`, `r−51·s`, lineWidth
   3·s, `#2f2f33`; unclip. (The cartridge is drawn before the body here?
   No — draw cart AFTER the rings so it stands in front: order is body →
   stripe → rings → cartridge → remaining details. Follow this order, not
   the numbering above: backdrop, shadow, panel frame, body, stripe,
   rings, cartridge+label, then 6–8.)
6. Deck details: volume slider groove 10×44 rounded 5·s `#0f0f11` at
   (100, 965) with nub 16×12 rounded 3·s `#3a3a3f` at (97, 975); two
   rounded buttons 34×14 `#3a3a3f` at (150, 1042) and (196, 1042); power
   LED circle r 5·s `#d0342c` at (128, 1048).
7. Gold medallion: ring stroke 4·s `#c9a227`, r 30·s at (580, 985); text
   `"16-BIT"` bold 13px·s Quantico centered in it, fill `#c9a227`.
8. Controller: `controller` rounded 46·s fill `#1d1d20`, stroke 2·s
   `#2f2f33`; circular D-pad base r 42·s `#2a2a2e` at (430, 1135) with
   cross arms 60 long × 20 wide `#0f0f11`; three buttons r 15·s `#3a3a3f`
   stroke 2·s `#17171a` at (545, 1150), (585, 1145), (625, 1150); letters
   A, B, C bold 11px·s `#6a6a70` centered 24·s below each button.
9. Reset text alignment; return `layout.screen`.

- [ ] **Step 4: Run tests** — `npx vitest run tests/genesis-shell.test.ts`, then `npm run build`.

- [ ] **Step 5: Commit**

```bash
git add src/viz/genesis-shell.ts tests/genesis-shell.test.ts
git commit -m "feat: Genesis-style console shell for video export"
```

---

### Task 3: Palette plumbing + shell dispatcher + export wiring

**Files:**
- Create: `src/viz/shells.ts`
- Modify: `src/viz/gb-render.ts` (opts type + one destructure line), `src/viz/video-export.ts` (~lines 40–60: shell selection + palette pass-through)
- Test: `tests/shells.test.ts`

**Interfaces:**
- Consumes: `drawGbShell` (gb-shell), `drawSnesShell`/`SNES_VIEW` (Task 1), `drawGenesisShell`/`GENESIS_VIEW` (Task 2), `DMG` (gb-render), `FrameScript["chip"]`.
- Produces: `type ViewPalette = readonly [string, string, string, string]`; `shellFor(chip: FrameScript["chip"]): { drawShell: (g: CanvasRenderingContext2D, w: number, h: number, title: string) => Rect; palette: ViewPalette }`; `drawGbFrame` opts widened to `{ headerTitle?: boolean; palette?: ViewPalette }`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/shells.test.ts
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
```

- [ ] **Step 2: Run to verify FAIL** (shells.ts missing).

- [ ] **Step 3: Implement.**

`src/viz/shells.ts`:

```ts
// Picks the export's console shell + playthrough palette for a chip.
import type { FrameScript } from "../engine/frame-script";
import { DMG } from "./gb-render";
import { drawGbShell, type Rect } from "./gb-shell";
import { drawGenesisShell, GENESIS_VIEW } from "./genesis-shell";
import { drawSnesShell, SNES_VIEW } from "./snes-shell";

export type ViewPalette = readonly [string, string, string, string];

export function shellFor(chip: FrameScript["chip"]): {
  drawShell: (g: CanvasRenderingContext2D, w: number, h: number, title: string) => Rect;
  palette: ViewPalette;
} {
  if (chip === "snes") return { drawShell: drawSnesShell, palette: SNES_VIEW };
  if (chip === "sega") return { drawShell: drawGenesisShell, palette: GENESIS_VIEW };
  return { drawShell: drawGbShell, palette: DMG };
}
```

`src/viz/gb-render.ts` — widen opts and use the palette (one line):

```ts
  opts?: { headerTitle?: boolean; palette?: readonly [string, string, string, string] },
): void {
  const [c0, c1, c2, c3] = opts?.palette ?? DMG;
```

`src/viz/video-export.ts` — replace the `drawGbShell` import with `shellFor`, then in the shell setup:

```ts
  const { drawShell, palette } = shellFor(script.chip);
  const screen = drawShell(shellCtx, W, H, title);
```

and in `drawFrame`, pass the palette through:

```ts
    drawGbFrame(g, script, lanes, frame, screen.w, screen.h, title, {
      headerTitle: false,
      palette,
    });
```

Also update the mini-preview canvas CSS (`canvas.style.cssText` in video-export.ts): keep as-is — it's a pre-paint placeholder only; do not add per-chip styling (YAGNI).

- [ ] **Step 4: Run tests** — `npx vitest run tests/shells.test.ts`, then the full suite `npm test` and `npm run build` (the worklet must still bundle; shells.ts is main-thread only).

- [ ] **Step 5: Commit**

```bash
git add src/viz/shells.ts src/viz/gb-render.ts src/viz/video-export.ts tests/shells.test.ts
git commit -m "feat: chip-aware export shells with per-chip playthrough palettes"
```

---

### Task 4: Visual acceptance + SPEC note

**Files:**
- Create (temporary, deleted before commit): `shell-test.html` in the repo root
- Modify: `SPEC.md` (one sentence in the §10.2 export area noting the export shell follows the chip; cite the design doc path)

This task's screenshots are reviewed by the session controller (same technique that verified the DMG shell).

- [ ] **Step 1: Build the harness.** Create `shell-test.html` in the repo root (Vite serves it in dev):

```html
<!doctype html>
<html>
  <body style="margin:0;background:#333;display:flex;gap:8px">
    <canvas id="snes" width="720" height="1280" style="width:360px;height:640px"></canvas>
    <canvas id="sega" width="720" height="1280" style="width:360px;height:640px"></canvas>
    <canvas id="gb" width="720" height="1280" style="width:360px;height:640px"></canvas>
    <script type="module">
      import { drawGbFrame } from "/src/viz/gb-render.ts";
      import { shellFor } from "/src/viz/shells.ts";

      const N = 3600;
      const mkCh = (id, base, spread) => {
        const period = new Uint16Array(N);
        const volume = new Uint8Array(N);
        for (let f = 0; f < N; f++) {
          if (f % 30 < 22) {
            period.set([base + Math.round(Math.sin(f / 40) * spread)], f);
            volume[f] = 8 + ((f >> 4) % 8);
          }
        }
        return { id, period, volume, duty: new Uint8Array(N), pan: new Uint8Array(N).fill(3) };
      };
      const lanesOf = (n) =>
        Array.from({ length: n }, (_, i) => ({
          label: `CH ${i + 1}`,
          trackName: ["Lead", "Harmony", "Bass", "Drums"][i % 4],
          kind: i === n - 1 ? "drums" : "pitch",
        }));
      const scriptOf = (chip, n) => ({
        chip, fps: 60, frameCount: N,
        channels: Array.from({ length: n }, (_, i) => mkCh(`c${i}`, 900 + i * 120, 300)),
        barStarts: [0, 120, 240, 360, 480, 600],
      });
      for (const [id, chip, lanes] of [["snes", "snes", 8], ["sega", "sega", 6], ["gb", "gb", 4]]) {
        const g = document.getElementById(id).getContext("2d");
        const draw = () => {
          const { drawShell, palette } = shellFor(chip);
          const screen = drawShell(g, 720, 1280, "cool song thing.mid");
          g.save();
          g.beginPath();
          g.rect(screen.x, screen.y, screen.w, screen.h);
          g.clip();
          g.translate(screen.x, screen.y);
          drawGbFrame(g, scriptOf(chip, lanes), lanesOf(lanes), 600, screen.w, screen.h, "x", { headerTitle: false, palette });
          g.restore();
        };
        draw();
        document.fonts.ready.then(draw);
      }
    </script>
  </body>
</html>
```

- [ ] **Step 2: Report READY-FOR-SCREENSHOT** with the harness in place (do not commit it). The controller runs the dev server, screenshots all three canvases, and judges: consoles read as SNES/Genesis at a glance, titles legible on cart labels, no branding, GB shell unchanged, playthrough legible in both palettes.

- [ ] **Step 3: After controller approval** (the controller relays any visual tweaks as findings first): delete `shell-test.html`, add the SPEC.md sentence — in §10.2 after the video-export mention (or the closest export paragraph), append: `The 9:16 video export's console art follows the chip: DMG handheld for nes/gb, console-on-the-bottom-third for snes/sega (see docs/superpowers/specs/2026-09-02-16bit-export-shells-design.md).`

- [ ] **Step 4: Full verification** — `npm test && npm run build && npm run lint`; confirm `git status` shows no harness file.

- [ ] **Step 5: Commit**

```bash
git add SPEC.md
git commit -m "docs: export shells follow the chip (SPEC note)"
```

---

## Self-review notes (already applied)

- Spec coverage: SNES shell ↔ Task 1, Genesis shell ↔ Task 2, dispatcher/palette/wiring ↔ Task 3, visual acceptance + SPEC ↔ Task 4. NES/GB unchanged is enforced by Task 3's `shellFor` default branch + dispatcher test + DMG default in drawGbFrame.
- The `"16-BIT"` medallion text and the purple SNES button shades are owner-vetoable spec decisions; implementers follow the spec as written.
- Task 2's paint-order numbering contains its own correction (rings before cartridge); the corrected order is normative: backdrop → shadow → panel frame → body → stripe → rings → cartridge+label → deck details → medallion → controller.
- Type consistency: `ViewPalette` is defined in shells.ts (Task 3); Tasks 1–2 export plain `readonly [string, string, string, string]` consts, assignable to it. `Rect` comes from gb-shell for all three modules.
