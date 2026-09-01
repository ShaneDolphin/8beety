# Chiptune Composer — M9 Implementation Plan (Polish and launch)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use checkbox syntax.

**Goal (§12 M9):** 3–4 demo MIDIs + Try-a-demo menu, About panel with attributions, coffee link, mobile-usable layout, README with screenshots, MIT license. Accept: Lighthouse performance > 90, no console errors, iOS Safari playback (user-verified).

## Decisions locked here
- **Name stays "Chiptune Composer"** and **the coffee link is a `src/config.ts` constant** (`COFFEE_URL`), hidden in header and export toast until set — the user hasn't picked a provider/URL and a placeholder link would be worse than none. README documents it; final report asks again.
- **Demos**: extend the generator to write three self-composed files — `demo-adventure.mid` (the existing 112 BPM pop I–V–vi–IV), `demo-dungeon.mid` (A minor, 92 BPM, i–VI–III–VII), `demo-boss.mid` (E minor, 168 BPM, driving riff). Empty state gets a three-entry Try-a-demo menu; `loadDemo(name)`.
- **Audition (deferred from M4, §5/§10.1)**: selecting an instrument while paused auditions it — a tiny Song/Project for one C4 note with that preset is `compile()`d and rendered through a main-thread `ApuCore` into an `AudioBuffer` played on the existing context. Zero interruption of the arrangement; reuses the real pipeline.
- **About panel**: modal from the header — what it is, attributions (free-midi-chords MIT, NESdev wiki, Pan Docs), the derived-tracks save limitation, MIT license, coffee link when set.
- **Mobile**: wrap-and-scroll pass (header wraps, rack scrolls horizontally, rows wrap); playback on tap already satisfies the gesture rule. iOS by-ear check is the user's.
- **License**: MIT, © 2026 Shane Morris; `license` field in package.json.
- **Lighthouse** via CLI headless against the production URL; fix if < 90 (bundle is ~200 KB, likely fine).

## Tasks
- [ ] **1. Demos + menu.** `scripts/make-demo-midis.mjs` (3 files), EmptyState menu, `loadDemo(name)`. Commit.
- [ ] **2. Audition + coffee config + About.** `src/audio/audition.ts`, instrument-select hook, `config.ts`, header ☕ + About modal, WAV-success toast variant. Commit.
- [ ] **3. Mobile pass + README + LICENSE.** Responsive classes; screenshot captured into `docs/`; README (features, quick start, dev commands, attributions, license); LICENSE file. Commit.
- [ ] **4. Verify + deploy.** Full suites/lint/build; browser demo-menu + audition smoke; deploy; Lighthouse on prod; console-error sweep; report (ask user for iOS check + coffee URL + final name).

## Verification (acceptance, §12 M9)
1. Lighthouse performance > 90 on the deployed URL.
2. Zero console errors through load→demo→play→export.
3. Three demos load and play; About renders attributions; README/LICENSE committed.
