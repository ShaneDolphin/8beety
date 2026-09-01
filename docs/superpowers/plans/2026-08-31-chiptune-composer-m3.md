# Chiptune Composer — M3 Implementation Plan (Polyphony and drums)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** `arp` and `split` polyModes with the §7.3 chord-tone reduction rules, the §7.5 GM drum map with drum presets on the noise channel, and §7.6 layer modes (double/detune/echo/octave). Acceptance: a piano-only block-chord MIDI sounds like a chiptune arrangement (arp chords + triangle bass); a GM drum track produces distinguishable kick/snare/hat.

**Architecture:** `compile.ts` is reworked around per-frame *selection streams*: each assigned slot gets a per-frame `{midi, trigger} | null` stream (top/bottom = one stream; arp = cycling stream over the reduced chord; split = one stream per slot with overflow-arp on the last), all rendered by one generic macro renderer with transform options (midiOffset/periodOffset/volScale) that also implement layer modes. Drums bypass all of this: GM notes map to `DrumPreset`s (volume + noise-period macros) rendered hit-by-hit with priority resolution.

**Spec:** §5 (drum presets), §7.3, §7.5, §7.6, §7.7 (arp macro exclusivity), §10.1 (updated auto-arrange + poly warning), §12 M3.

## Decisions locked here
- **Drum presets are their own type** (`DrumPreset`: volume macro, noise-period macro, LFSR mode, priority) rather than shoehorned into `Instrument` — the Instrument schema has no noise-period concept. Drum tracks ignore `instrumentId`; the UI shows "NES Kit".
- **Hit rendering:** hits sorted by frame; equal-frame hits keep only the highest priority (kick 60 > snare 50 > crash 40 > toms 35 > open hat 30 > metal 25 > ride 15 > closed hat 10); a later hit cuts whatever is still decaying (authentic mono noise channel).
- **Reduction rules (§7.3), deterministically:** dedupe & sort ascending; while >4 notes drop (1) fifths (pc 7 from root, highest first), then (2) doubled pitch classes (higher duplicate first), then (3) highest note (rare fallback).
- **Arp semantics:** macroFrame anchors to *chord start* (volume macro runs across arp steps); pitch steps every `arpFramesPerStep`; cycle restarts and macros retrigger on any change of the sounding-note set; the instrument's own arpeggio macro is ignored in arp mode (§7.7).
- **Split:** notes sorted ascending, note i → `slots[i]`; overflow notes arp (reduced, `arpFramesPerStep`) on the last slot; missing notes leave slots silent. Instrument resolves per slot kind (silent fallback to the kind's first preset — one warning per track, not per slot).
- **Layer modes** apply when a track has exactly two *pulse* slots and polyMode is top/bottom: `layerMode` field on TrackArrangement (documented spec-schema extension): `double | detune | echo3 | echo6 | echo9 | octave-up | octave-down`. Detune = period +4 timer units; echo = selection shifted N frames at volScale 0.5; octave = re-render at midi ±12. Default `double`. Arp uses only its first slot.
- **"Arp Chord Slow" preset is not shipped**; the 1/2/3 `arpFramesPerStep` selector supersedes it (one "Arp Chord" preset + speed control). Documented deviation.
- **Auto-arrange (full §10.1):** lead → p1 Square Lead top; second low-poly melodic → p2 Thin Lead; lowest melodic → tri Tri Bass bottom; first drum track → noise; if p2 still free, most polyphonic remaining → p2 Arp Chord (arp). Special case: a *single* polyphonic melodic track gets `slots [tri, p1, p2]` with `split` — lowest note to triangle bass, overflow arps on p2 (this is what makes the piano-only acceptance work).
- **UI:** slot dropdown becomes toggle chips (P1/P2/TRI/NOI, append order = slots order); polyMode gains arp/split; arp speed select (1/2/3) when arp/split; layer dropdown when layer-eligible; drum rows show "NES Kit" with instrument/polyMode controls disabled; hint when a polyphonic track is in `top` mode ("try arp").
- Fixture-B snapshot will change (auto-arrange now splits the piano) — intentional, explained in the commit.

## File structure
```
src/engine/chord-reduce.ts   reduceChord(midis: number[]): number[]  (≤4, ascending)
src/engine/drums.ts          DrumPreset, DRUM_PRESETS, gmDrumPreset(gmNote)
src/engine/compile.ts        rework: selection streams, renderStream opts, drums, layers
src/engine/instruments.ts    + "Arp Chord" preset (pulse, sustained vol 10, duty 1)
src/engine/project.ts        + layerMode?: LayerMode on TrackArrangement
src/engine/auto-arrange.ts   full heuristic + single-poly-track split case
src/components/TrackList.tsx slot chips, 4 polyModes, arp speed, layer dropdown, drum rows
tests/chord-reduce.test.ts, tests/drums.test.ts, tests/compile-poly.test.ts
tests/auto-arrange.test.ts (updated), tests/compile.test.ts (snapshot refresh)
```

## Tasks
- [ ] **1. Chord reduction (TDD).** Tests: ≤4 passthrough; C9 drops the 5th keeping root/3rd/7th/9th; doubled-octave drop; unison dedupe; fallback cap. Commit.
- [ ] **2. Drum map + presets (TDD).** Tests: GM mapping table (35→kick … default→closed hat); tom tiers have three distinct periods; priorities ordered kick>snare>crash>toms>open hat>metal>ride>closed hat; every preset's volume macro ends at 0 and has no loop. Commit.
- [ ] **3. Compiler rework (TDD).** Selection-stream refactor preserving all M2 tests; new tests: arp cycles C-E-G at 1 frame/step and restarts on chord change; volume macro continues across arp steps (pluck decays over the chord, not per step); split assigns ascending notes to slots with overflow-arp on last and silence on missing; drums render kick/snare/hat with distinct periods, same-frame kick+hat keeps kick, later hit cuts crash decay; layer double/detune(+4)/echo3(shift+half volume)/octave-up(re-rendered ±12) verified against the primary channel. Snapshot refresh for fixture B. Commit.
- [ ] **4. Auto-arrange + project field (TDD).** Updated heuristic tests incl. drum→noise, arp-chord fill on p2, single-piano split case. Commit.
- [ ] **5. UI.** Slot chips, polyMode/arp-speed/layer controls, drum-row treatment, poly-in-top hint. Test/lint/build. Commit.
- [ ] **6. Verify + deploy.** Browser: demo now renders drums (kick/snare/hat audible pattern on noise) and chords track set to arp sounds full; piano-only check via a generated block-chord MIDI; offline-render RMS sanity on noise channel; deploy, verify prod, report.

## Verification (acceptance, §12 M3)
1. Piano-only block-chord MIDI → arp chords + triangle bass, no clipping (mixer is nonlinear; verify offline RMS < 1.0 peak).
2. GM drum track → kick, snare, hats audibly and numerically distinct (different noise periods/decay lengths).
3. All prior suites still green; new arp/split/drum/layer tests green.
