# Chip-Aware Video Export Shells: SNES and Genesis Consoles

Design spec for making the 9:16 video export match the selected chip. Extends
the Game Boy View export (src/viz/gb-shell.ts, video-export.ts) and the 16-bit
chips feature (docs/superpowers/specs/2026-09-01-16bit-chips-design.md).

## Goal

The export follows the chip dropdown:

| Project chip | Export look |
|---|---|
| `nes`, `gb` (and `nes-vrc6`) | Unchanged: DMG handheld shell, playthrough on its screen |
| `snes` | Playthrough panel (top ~2/3) in an SNES-flavored palette; SNES-style console graphic in the bottom third |
| `sega` | Playthrough panel (top ~2/3) in a Genesis-flavored palette; Genesis-style console graphic in the bottom third |

Since neither console has a screen, the playthrough floats as a styled panel
above the console — same DAW-style block renderer (`drawGbFrame`), recolored.
A cartridge sits in each console's slot, and **the song title goes on the
cartridge label** (the analog of the DMG bezel title).

**No Nintendo or Sega branding anywhere**: no logos, no wordmarks, no company
names. The consoles are logo-free homages in the same spirit as the DMG shell
(SPEC.md §10.3's exception, already established by the owner).

## Layout (720×1280 design box, scaled and centered like gb-shell)

Shared by both consoles:

- **Playthrough panel:** x 24, y 24, w 672, h 792 (bottom edge 816 = 63.75%
  of frame height). At this size `drawGbFrame`'s pixel scale is 4 — crisp.
- **Console band:** the bottom third. The cartridge may poke up into the gap
  between panel bottom (816) and the console body, visually tying the two,
  but never overlaps the panel.
- **Backdrop:** near-black, tinted per chip. Subtle floor shadow ellipse
  under the console.

## SNES shell (`snes`)

- Playthrough palette `SNES_VIEW` (darkest→lightest, replacing DMG green):
  `#1a1333, #463a78, #8578c8, #d8d2f2` — deep indigo to lavender, the US-SNES
  purple family. Backdrop `#141019`.
- Console: light cool-gray rounded body (`#b6b2bc`) with a darker top deck
  (`#a5a1ad`), centered dark cartridge slot, two purple slider switches
  (power/reset, `#6f5fb0`), a purple oval eject button, two dark controller
  ports on the front face, small red power LED.
- Cartridge: gray (`#8f8b99`), standing in the slot, bridging up toward the
  panel; light label (`#e8e4f0`) with the song title (auto-shrunk to fit,
  `.mid`/`.midi` stripped, uppercase), thin purple border.
- Controller: gray rounded body, dark D-pad, **four action buttons in a
  diamond using four purple shades** (`#6f5fb0 #4f4386 #8b7fc4 #5a4d9e`) —
  deliberately NOT the red/yellow/green/blue Super Famicom colors (trade
  dress); two small unlabeled center pills.

## Genesis shell (`sega`)

- Playthrough palette `GENESIS_VIEW`: `#04101e, #0f3a66, #2c7fbf, #7fe3ff` —
  near-black blue to electric cyan, the Genesis-era arcade-blue family.
  Backdrop `#0a0a0c`.
- Console: wide black rounded body (`#232326`) with darker top stripe
  (`#17171a`) and the Model-1 signature: **concentric ridge rings** around
  the cartridge slot (stroked circles `#2f2f33`). Volume slider groove with
  nub on the left, two small rounded power/reset buttons, red power LED.
- Gold medallion: plain gold ring (`#c9a227`) right of the rings with the
  text **"16-BIT"** in gold — a generic descriptor, not a Sega mark.
  *(Owner may veto the text; the blank ring alone still reads Genesis.)*
- Cartridge: near-black (`#1d1d20`), standing in the slot through the rings;
  cream label (`#d9d4c8`) with the song title, thin gold border.
- Controller: black rounded wide body, circular D-pad base, **three convex
  buttons** labeled A/B/C in small dark-gray print (generic letters).

## Architecture

- `src/viz/snes-shell.ts` and `src/viz/genesis-shell.ts`, each mirroring
  gb-shell.ts's proven pattern: a pure, unit-tested
  `compute<Name>Layout(w, h)` plus a `draw<Name>Shell(g, w, h, title)` that
  returns the playthrough rect. They export their palettes.
- `src/viz/shells.ts`: `shellFor(chip)` → `{ drawShell, palette }`.
  nes/gb/nes-vrc6 → gb-shell + DMG; snes → snes-shell + SNES_VIEW;
  sega → genesis-shell + GENESIS_VIEW.
- `src/viz/gb-render.ts`: `drawGbFrame` gains `opts.palette` (defaults to
  DMG — the live in-app Game Boy View is untouched).
- `src/viz/video-export.ts`: replaces the direct `drawGbShell` call with
  `shellFor(script.chip)`, passing the palette through to `drawGbFrame`.
  Everything else (worker ticks, audio clock, wake lock, codec list,
  recording preview) is untouched.

## Non-goals

- No change to the live in-app Game Boy View (any chip) or to the NES/GB
  export.
- No per-chip change to lane layout/labels beyond what already shipped
  (6/8-lane rendering exists).
- No new dependencies, no image assets — everything is drawn with canvas
  primitives, deterministic.

## Testing

Layout invariants unit-tested per shell (mirroring tests/gb-shell.test.ts):
panel in the top ~two-thirds, console parts inside the canvas and below the
panel, cartridge label inside the cartridge, proportional scaling. Dispatcher
mapping unit-tested for all five chip ids. Visual acceptance via a
throwaway dev-server harness screenshotting all three shells (the same
technique used to verify the DMG shell), reviewed by the session controller.
