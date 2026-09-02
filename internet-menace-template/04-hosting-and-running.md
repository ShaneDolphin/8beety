# 8BEETY — Hosting and Running It

8BEETY is a fully static single-page app. There is no backend, no database, no
API keys, and no build-time secrets — hosting it means serving one folder of
files. That's a deliberate design decision (see the spec's non-goals), and it's
why deployment is a one-liner.

## Prerequisites

- Node.js 20+ (22 recommended) and npm
- A modern browser (Chrome/Edge recommended for the video export; playback
  works in Firefox and Safari too)

## Run it locally

```bash
git clone https://github.com/ShaneDolphin/8beety.git
cd 8beety
npm install
npm run dev          # → http://localhost:5173
```

Drop any `.mid` file onto the page (the repo ships three original demo MIDIs
under `public/demo-midis/` if you need one).

## The full command set

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server with hot reload |
| `npm test` | The whole Vitest suite (~300 tests, all Node-side, ~10–15 s) |
| `npm run build` | Type-checks (`tsc -b`) then produces the static site in `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run lint` | ESLint over the whole repo |

**The definition of "working" for this repo is `npm test` and `npm run build`
both green.** Every milestone during development ended with exactly that check —
if you're extending the app (or having an AI extend it), keep that rule.

## Deploy

### Vercel (how the live site is hosted)

```bash
npm run build
npx vercel deploy --prod
```

Framework preset: **Vite**. Build command `npm run build`, output directory
`dist`. Nothing else to configure — no environment variables, no serverless
functions. Attach a custom domain in the Vercel dashboard if you have one
(the live app runs at www.8beety.com this way).

### Any other static host

`npm run build`, then upload `dist/` to Netlify, GitHub Pages, Cloudflare
Pages, an S3 bucket, or any web server. Two things to know:

1. **Serve over HTTPS (or localhost).** AudioWorklets and the Web Audio API
   require a secure context; `file://` will not work.
2. **Correct MIME types matter.** The AudioWorklet module must be served as
   JavaScript. Any mainstream static host does this automatically; a hand-
   rolled server must send `.js` files as `text/javascript`.

There is no server-side rendering and no routing to configure — it's one
`index.html`. If your host asks about SPA fallbacks, you don't even need one.

## Things that trip people up

- **No sound until you interact.** Browsers suspend audio until a user
  gesture; press play (the app handles resuming the context).
- **Video export runs in real time** — a 2-minute song records for 2 minutes.
  The export keeps working in a background tab (it uses a worker clock and a
  wake lock), but don't close the tab. Output is H.264 MP4 in Chrome/Edge;
  browsers without MP4 recording support fall back to WebM.
- **Share links carry the whole project in the URL** (compressed). Very large
  MIDIs (>100 KB embedded) fall back to a link without the MIDI payload.
- **The test suite includes DSP-heavy tests** with explicit 30-second
  timeouts. They normally finish in a few seconds; don't "clean up" the
  timeouts.

## Repo map (where to look when extending)

```
app/
├── SPEC.md                  ← source of truth; read before changing anything
├── CLAUDE.md                ← the working conventions given to the AI assistant
├── docs/superpowers/        ← the design docs and implementation plans, as written
├── src/engine/              ← MIDI import, compiler, pitch math, instruments
├── src/audio/               ← the chip DSP + worklet + offline render + WAV
├── src/viz/                 ← visualizer, console shells, video export
├── src/components/          ← React UI
├── src/theory/              ← key/chord detection for Chord Assist
└── tests/                   ← the ~300-test safety net
```
