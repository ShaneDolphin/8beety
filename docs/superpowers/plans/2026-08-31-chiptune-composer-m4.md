# Chiptune Composer — M4 Implementation Plan (Rack UI and drag-and-drop)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** Chip Rack cards with drag-track-to-slot (swap on occupied), mini piano rolls with a playhead synced to the worklet's frame reports (click to seek), click-drag loop ranges on a bar ruler, keyboard shortcuts, and the existing warnings. Acceptance (§12 M4): a first-time user can re-arrange a song mouse-only without instructions.

**Spec:** §7.4 (swap), §10 layout, §10.1 interactions, §12 M4.

## Decisions locked here
- **Swap semantics** (pure fn `assignTrackToSlot(tracks, trackId, slotId)`): the dropped track's slots become `[slotId]`; the previous owner of that slot keeps its other slots and inherits the dropped track's former slots (single-slot case = clean §7.4 swap; multi-slot tracks degrade gracefully). Slot chips remain the non-drag path (mouse-only acceptance holds even where HTML5 dnd is flaky).
- **"Drag a chip off to unassign" is not implemented** — clicking a chip off is the same gesture cheaper; documented deviation.
- **Instrument audition on hover** (§5/§10.1) is deferred to M9 polish — not in M4's milestone list.
- **Piano roll** (240×40 canvas per track): notes drawn by tick over the song's end tick, pitch normalized to the track's range; playhead drawn at `frame/frameCount` (exact under flatten mode, approximate under scale — acceptable). Click seeks to the proportional frame.
- **Loop state lives in bars** (`loopBars: [startBar, endBar)`), converted to frames against the current script's `barStarts` on every compile/apply, so BPM changes keep the loop musically stable. `loopFrames(script, bars)` helper. Plain click on the ruler seeks to that bar; drag selects a loop; `L` toggles the last loop on/off.
- **Keyboard** (ignored while typing in inputs/selects): Space play/pause, Home to start, L loop toggle, M/S mute/solo the focused track, 1–9 focus track N. Focused row shows a ring; clicking a row's name/handle focuses it.
- **Playhead frequency**: store `frame` updates every 4 frames from the worklet (already); canvases redraw on that state change — cheap at ≤15 Hz × few tracks.

## File structure
```
src/engine/arrange-ops.ts     assignTrackToSlot(), loopFrames()  (pure, TDD)
src/audio/player.ts           + setLoop(range | null)
src/store.ts                  + seek, loopBars/setLoopBars/toggleLoop, focusedIndex, assignToSlot
src/components/ChipRack.tsx   one drop-target card per channel (label, owner, instrument)
src/components/PianoRoll.tsx  canvas thumbnail + playhead + click-to-seek
src/components/BarRuler.tsx   bar strip: click=seek bar, drag=loop range, loop highlight, playhead
src/components/TrackList.tsx  drag handle, focus ring, roll embedded per row
src/App.tsx                   layout + keyboard shortcuts
tests/arrange-ops.test.ts
```

## Tasks
- [ ] **1. Pure ops (TDD).** `assignTrackToSlot`: assign to empty; move frees old slots; swap with occupier; occupier keeps its other slots and inherits dropped track's old ones; unknown ids are no-ops. `loopFrames`: bar range → frames, end-of-song clamp. Commit.
- [ ] **2. Store + player.** `setLoop` message wiring; loop-in-bars reapplied after every compile and on play init; `seek`, `focusedIndex`, `assignToSlot`. Commit.
- [ ] **3. Rack + drag.** ChipRack cards (drop targets with drag-over highlight), TrackRow drag handle (`dataTransfer` text = track id), row focus. Commit.
- [ ] **4. Piano rolls + bar ruler.** Canvas rolls with playhead + click-seek; BarRuler with click/drag/loop/playhead. Commit.
- [ ] **5. Keyboard + polish.** Shortcut handler, focus ring, hint text update. Test/lint/build. Commit.
- [ ] **6. Verify + deploy.** Browser: rack reflects arrangement; chip-click reassign works mouse-only; drag attempt via automation (fallback documented if CDP can't fire HTML5 dnd); roll click seeks; ruler drag sets loop and playback loops; Space/Home/L/M/S/digits work; deploy + prod check.

## Verification
1. Unit: arrange-ops swap matrix, loopFrames clamping.
2. Browser: mouse-only re-arrangement via rack/chips; loop audibly cycles (frame readout wraps within loop range); seek via roll click moves the playhead; keyboard shortcuts drive transport.
3. All suites green; lint/build clean; prod deploy plays.
