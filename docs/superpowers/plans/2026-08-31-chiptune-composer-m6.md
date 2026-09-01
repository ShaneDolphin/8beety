# Chiptune Composer — M6 Implementation Plan (Export and share)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** WAV offline render (44.1/48 kHz, mono for nes / stereo for gb, loop 2×+fade), project JSON save/load with zod, arranged-MIDI export, lz-string share links. Acceptance (§12 M6): WAV is sample-identical to realtime output at the same sample rate; share link round-trips a project exactly.

**Spec:** §9.3, §10.2, §12 M6. New deps (both in §2's stack): `zod`, `lz-string`.

## Decisions locked here
- **ApuCore refactor**: the processor's frame clock + channel dispatch move into an exported pure `ApuCore` class (sampleRate-parameterized, no worklet globals). The processor becomes a thin message adapter. This is what makes the parity acceptance *testable in Node*: realtime renders in 128-sample quanta, offline in one block — same core, so the test renders both block patterns and compares sample-exactly.
- **Ack handshake** (from the M1 finding): the processor posts `{type:"loaded"}` after processing a `load`; `renderScript()` awaits it (with a 1.5 s safety timeout) before `startRendering()`. Realtime ignores the ack.
- **Loop 2×+fade**: render length 2× script duration with `setLoop([0, frameCount])`; apply a linear fade over the last `min(3s, duration)` in JS post-render.
- **ProjectFile container** `{app:"chiptune-composer", version:1, project, midi?, midiName?}` — downloaded JSON always embeds the source MIDI as base64 (one self-contained file); share links embed only when the MIDI is under 100 KB, else the copy toast warns that the recipient must supply the MIDI. Store keeps `midiBytes` from every load to enable this.
- **Share link format**: `#p=<lz-string compressToEncodedURIComponent(JSON)>`; decoded+zod-validated on app start from `location.hash`.
- **Arranged-MIDI reconstruction**: per channel, a note = a run of frames with `volume>0` sharing one period (pitch change/gap = boundary — arps naturally become runs of 1–3 frame notes); period→MIDI via the chip's inverse freq formula; noise channel exports to GM drums (period ≤32→42 hat, ≤200→38 snare, else 36 kick) on channel 9; velocity = vol/15·127; ticks = frames/60 · bpm/60 · ppq at the project BPM.
- **JSON loading paths**: drop/pick accepts `.json` beside `.mid` (routed by extension); a project without embedded MIDI applies to the currently loaded song or toasts an explanation.
- Coffee-link toast text on WAV success defers to M9 (link provider still undecided).

## File structure
```
src/audio/apu-worklet.ts   ApuCore extracted + "loaded" ack (processor thins out)
src/audio/messages.ts      ApuReport + {type:"loaded"}
src/audio/wav.ts           encodeWav(channels: Float32Array[], sampleRate): ArrayBuffer
src/audio/render.ts        renderScript(script, sampleRate, {loopTwiceFade}): Promise<Float32Array[]>
src/engine/project-io.ts   zod schema, encodeProjectFile/decodeProjectFile
src/engine/share.ts        encodeShare/decodeShare (lz-string)
src/engine/midi-export.ts  exportArrangedMidi(script, bpm): Uint8Array
src/components/ExportMenu.tsx  Export ▾ dropdown in Header
src/store.ts               midiBytes, loadProjectFile, buildProjectFile
src/App.tsx                .json drop routing, hash-load on start
tests/apu-core.test.ts, tests/wav.test.ts, tests/project-io.test.ts, tests/share.test.ts, tests/midi-export.test.ts
```

## Tasks
- [ ] **1. ApuCore refactor + parity (TDD).** Extract core; processor delegates; `loaded` ack. Tests: block-size invariance (1×N vs 128-chunks, sample-exact), determinism after re-load, loop wrap mid-render, gb stereo vs nes mono duplication. Commit.
- [ ] **2. WAV encoder (TDD).** RIFF/fmt/data header fields, mono+stereo interleave, 16-bit conversion with clipping. Commit.
- [ ] **3. Project IO + share (TDD).** zod schema (bpm 40–300, chip enum, track shape incl. layerMode/pan/regions passthrough); encode/decode with base64 MIDI; share round-trip exactness; tampered payload → null. Commit.
- [ ] **4. Arranged MIDI (TDD).** Sustained note → one note at right pitch/length; arp frames → runs of short notes; noise → GM drums on ch 9; velocity mapping. Commit.
- [ ] **5. render.ts + ExportMenu + store/App wiring.** Export dropdown (WAV 44.1/48 + loop-fade toggle, Project JSON, Arranged MIDI, Copy share link), busy state, downloads via blob anchors; `.json` drop/pick; `#p=` hash load. Test/lint/build. Commit.
- [ ] **6. Verify + deploy.** Browser: WAV files land in ~/Downloads with correct RIFF headers/sizes/durations (checked via Bash); JSON download re-imports; share link round-trips through a fresh navigation; arranged MIDI re-parses via @tonejs/midi. Deploy + prod hash-link check.

## Verification (acceptance, §12 M6)
1. Parity: ApuCore chunked-vs-whole renders are sample-identical (Node test) — realtime and offline share this exact code path.
2. Share: encode→decode round-trips the ProjectFile deep-equal (unit) and a pasted link restores the arrangement in the browser.
3. WAV: downloaded file has valid header, expected byte length for duration×rate×channels; loop-fade doubles duration.
