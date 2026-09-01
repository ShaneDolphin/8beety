# Chiptune Composer — M7 Implementation Plan (Regions and instrument tweaks)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Split-at-bar regions with per-region instrument/slots/polyMode (§6.2 Region, §7.2 resolution order region→track), and the §5 minimal per-track tweaks: duty, attack/decay (rewrites the volume macro from two numbers), vibrato depth/delay. Acceptance (§12 M7): bars 1–16 Square Lead, bars 17–32 Pluck on the same track.

## Decisions locked here
- **Tweaks are per-track** (`TrackArrangement.tweaks?: {duty?, attack?, decay?, vibratoDepth?, vibratoDelay?}`) and layer over whichever instrument is effective (region overrides included) via pure `applyTweaks(inst, tweaks)`. Attack ramps 0→preset-peak over A frames; decay falls peak→0 over D frames; D=0 means sustain at peak; vibratoDepth 0 removes the pitch macro; duty override only where the instrument fits pulse.
- **Regions partition by bars**; no regions = one whole-song region. Notes belong to the region containing their note-ON frame (a note held across a boundary keeps its region's instrument — tracker-authentic). Rendering per region reuses the existing renderers with region-filtered events; writes are non-destructive so regions merge into the same channel arrays.
- **Region editing**: a ✂ button splits the track at the playhead's bar (§10.1 default); each region renders as a compact strip (bars A–B, instrument select, polyMode select, slot select with "(track)" inherit, ✕ merges into the previous region; merging the last boundary clears `regions`). Pure helpers `splitRegions`/`mergeRegions`/`updateRegion` in `src/engine/regions.ts`.
- **Slot ownership/warnings** claim per track (union of region slots), clamp warnings aggregate across regions.
- Drum tracks ignore regions (whole-track, as they ignore polyMode).
- zod schema gains `tweaks`.

## File structure
```
src/engine/instruments.ts   + InstrumentTweaks, applyTweaks()
src/engine/regions.ts       splitRegions/mergeRegions/updateRegion (pure)
src/engine/project.ts       + tweaks field
src/engine/project-io.ts    + tweaks in trackSchema
src/engine/compile.ts       per-region resolution + applyTweaks
src/store.ts                splitAtPlayhead/updateRegionAt/mergeRegionAt
src/components/TrackList.tsx  split button, region strips, tweak strip (⚙ toggle)
tests/tweaks.test.ts, tests/regions.test.ts, tests/compile-regions.test.ts
```

## Tasks
- [ ] **1. applyTweaks (TDD).** Attack ramp values, decay-to-zero, D=0 sustain, vibrato depth/delay macro shape, depth 0 removes pitch, duty override only for pulse, no-tweaks identity. Commit.
- [ ] **2. Region helpers (TDD).** Split whole-song → two regions; split inside an existing region inherits overrides; split at an existing boundary is a no-op; merge collapses into the previous keeping its overrides; merging down to one region returns undefined. Commit.
- [ ] **3. Compiler (TDD).** Acceptance test verbatim (Square Lead bars 1–2, Pluck bars 3–4 → sustained volume then decaying attacks at the boundary); region polyMode override (top→arp mid-song); region slots override routes later bars to p2; tweaks reach the render (duty array, attack ramp visible per note). zod round-trip with tweaks+regions. Commit.
- [ ] **4. Store + UI.** Split at playhead, region strips with compact selects, ⚙ tweak strip (duty 0–3, attack 0–30, decay 0–60, vib depth 0–4, vib delay 0–60). Test/lint/build. Commit.
- [ ] **5. Verify + deploy.** Browser: split demo Melody at playhead, set region 2 to Pluck, confirm compiled volume pattern changes at the boundary (probe via synthetic UI + recompile); tweak strip edits hot-swap live. Deploy + prod check.

## Verification (acceptance, §12 M7)
1. Compile test: same track renders Square Lead frames before the boundary bar and Pluck decay envelopes after it.
2. UI flow achieves the same via ✂ + region instrument select (browser check).
3. All suites green; lint/build clean.
