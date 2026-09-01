# 8BEETY — Game Boy View + 9:16 video export

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal:** A toggleable "GB View" in the top bar showing four DMG-green lanes (Vocals / Guitar / Bass / Drums) animating the compiled song DAW-style in sync with playback; and an Export-menu item that renders a 720×1280 (9:16) video of the same visualization with the song's audio.

## Decisions locked here
- **Lanes = the four chip channels** (p1, p2, tri/wave, noise) — that's what is truthfully "playing" at any frame. Default labels VOCALS (p1), GUITAR (p2), BASS (tri/wave), DRUMS (noise); when a channel's owning track name matches a keyword (vocal/lead/melody, guitar, bass, drum), that label wins, and the actual track name shows as a sub-label. Pure `lanesFor()` helper, unit-tested.
- **Renderer is one pure canvas function** `drawGbFrame(ctx, script, lanes, frame, w, h, title)` shared by the live view and the video export. DMG four-shade palette (#0f380f/#306230/#8bac0f/#9bbc0f), chunky pixel blocks, scrolling note strip per lane (playhead at 30% width, ~4 s window), pitch lanes place blocks by period-derived pitch and show the current note name; the drums lane draws volume-height hit bars; active lanes highlight. Original look — no Nintendo assets or shell imitation, just the green-screen vibe.
- **Live view**: store flag `gbView` toggled from the header; replaces the TrackList area (header/rack/ruler stay). Playback position interpolates between the worklet's 4-frame reports with an rAF clock so scrolling is smooth.
- **Video export via MediaRecorder** (no new dependencies): offline-render the audio (existing `renderScript`), play it into a `MediaStreamDestination` while an interval-driven loop draws frames to a 720×1280 canvas captured at 30 fps; record canvas+audio tracks together. Mime pref: `video/mp4` where supported (Safari), else `video/webm` (Chrome/Firefox). **Realtime-length export** with a progress % on the menu button — documented tradeoff; a faster-than-realtime WebCodecs/mp4 path is a future upgrade.
- Keep the tab visible during export (interval loop, not rAF, so minimized throttling is survivable, but capture quality is best foregrounded; the UI says so).

## File structure
```
src/viz/lanes.ts            lanesFor(project, song, profile) + laneLabel (pure, TDD)
src/viz/gb-render.ts        DMG palette, period-range cache, drawGbFrame()
src/components/GameBoyView.tsx  canvas + interpolated rAF loop
src/viz/video-export.ts     exportGbVideo(script, lanes, title, audio, sampleRate, onProgress)
src/store.ts                gbView, toggleGbView
Header/ExportMenu/App       toggle button, "Video · 9:16" item with progress, view switch
tests/lanes.test.ts
```

## Tasks
- [ ] **1. Lane mapping (TDD).** Keyword overrides, defaults in channel order, wave/tri both → BASS, sub-labels. Commit.
- [ ] **2. Renderer + live view.** drawGbFrame + GameBoyView + header toggle; verify in browser (screenshot, animates during playback). Commit.
- [ ] **3. Video export.** exportGbVideo + Export item + progress; verify: short export produces a playable blob of the right duration/type; file lands in Downloads. Commit.
- [ ] **4. Deploy + prod check.**

## Verification
1. Unit: lane labels for the Creed-style names (Guitar 1/Guitar 2/Bass/Drumkit) and for defaults.
2. Browser: GB View toggles, scrolls smoothly during playback, lanes light up with activity.
3. Video: exported file has video+audio tracks, expected duration, 720×1280.
