# Chiptune Composer — M8 Implementation Plan (Chord Assist)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** `scripts/build_chord_library.py` + committed `src/theory/chord-library.json` (<300 KB) from ldrolez/free-midi-chords; Detect (chord strip + key); Enrich levels 1–3; chip voicing; derived chord tracks. Acceptance (§12 M8): plausible chord strip on a pop-style MIDI; level 1 audibly thickens; level 3 offers three same-length, in-key substitutions.

**Spec:** §8 entire, §12 M8.

## Decisions locked here
- **Corpus strategy** (spec's preferred path): shallow-clone the repo, parse progression definitions from the generator source (Roman-numeral strings + tags); inspect first and adapt to whatever structured form the current release uses; tags fall back to genre/folder names if no mood data exists. Dedup by (mode, numeral sequence). Voicings table verbatim from §8.2.
- **Theory is homegrown, no `tonal` dependency** (documented deviation): detection = deterministic pitch-class-set matching against the §8.2 voicing qualities with root-preference for the lowest sounding note; key detection = Krumhansl-profile correlation over 24 keys; note spelling from a fixed name table. Rationale: the voicing/quality vocabulary is exactly ours, pc-set matching is unit-testable and deterministic, and it keeps the bundle smaller. (`tonal` stays available if detection quality disappoints later.)
- **Segmentation**: per bar; a bar splits at the half when both halves sound distinct pitch-class sets (§8.3.1's "half-bar if the chord changes mid-bar").
- **Enrich**: L1 adds the diatonic 7th (maj→maj7 or dom7 by scale membership; min→min7). L2 on top: diatonic 9ths (maj7→maj9, min7→min9, plain maj→add9) and sus2/sus4 when the melody note over the chord is a 2nd/4th (melody = the p1-assigned track, else the highest-mean-pitch mono track). L3 ranks library progressions of the same mode/length whose first and last numerals match, by mood-tag overlap; top 3 offered.
- **Chip voicing** reuses `reduceChord` (cap 4, §7.3 drop rules) then drops the top note by octaves until it sits below the melody's lowest note in that bar (§8.3.3).
- **Derived tracks** append a synthetic `SourceTrack` to the song plus an unassigned arrangement defaulting to polyMode `arp` (user drags it to the rack — the acceptance's "audibly thickens" path). Known v1 limitation: derived tracks don't survive save/share (loadProjectFile already filters dangling sourceIndex safely); document in About (M9).
- **UI**: "♪ Assist" button on polyphonic rows opens a right-side panel: key + chord strip, density selector (0–3), mood chips, top-3 substitution picks, "Add chord track".

## File structure
```
scripts/build_chord_library.py   developer-run; writes src/theory/chord-library.json
src/theory/chord-library.json    committed corpus (<300 KB)
src/theory/theory.ts             pc sets, NOTE_NAMES, scales, numerals, key detection
src/theory/detect.ts             segmentTrack(song, track) → ChordSegment[]
src/theory/enrich.ts             enrichSegment, substitutions(library, ...)
src/theory/derive.ts             deriveChordTrack(segments, song, melodyLowByBar) → SourceTrack
src/components/ChordAssist.tsx   the side panel
src/store.ts                     chordAssistTrackId, addDerivedTrack
tests/chord-library.test.ts, tests/theory.test.ts, tests/enrich.test.ts, tests/derive.test.ts
```

## Tasks
- [ ] **1. Corpus.** Clone repo shallow into scratchpad; inspect generator source; write `build_chord_library.py` (stdlib-only if possible); run; commit JSON + attribution note. Tests: schema shape, <300 KB, numeral validity, ≥100 progressions, both modes present. Commit.
- [ ] **2. Theory core (TDD).** pc-set chord matching incl. inversions (root preference = lowest note), quality labels, key detection on clear major/minor material, numeral mapping both modes. Commit.
- [ ] **3. Detect + enrich + derive (TDD).** Bar segmentation with half-bar splits; spec's own L1 example (key C: Am→Am7, C→Cmaj7, G→G7); L2 diatonic 9ths + sus by melody note; voiceForChip inversion below melody; substitutions same-length/endpoint/mood-ranked top 3; derived SourceTrack timing and ≤4 tones. Commit.
- [ ] **4. Store + UI.** Panel with strip/key/density/moods/subs/add-track; polyphonic-row button; derived-track toast. Test/lint/build. Commit.
- [ ] **5. Verify + deploy.** Browser: open Assist on the demo's Chords track → plausible strip (I–V–vi–IV in C); add an enriched track, assign to a slot, confirm compiled content; deploy + prod check.

## Verification (acceptance, §12 M8)
1. Chord strip on the demo shows C G Am F (the demo is literally a I–V–vi–IV pop progression).
2. Level-1 derived track adds 7th chord tones (unit-verified pcs; audible after assignment).
3. Level 3 lists three substitutions, each same bar count, endpoints matching, all numerals diatonic.
