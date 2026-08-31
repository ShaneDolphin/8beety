# Chiptune Composer

Read SPEC.md before doing anything. It is the source of truth.

## Conventions
- TypeScript strict. No `any`. No default exports except React components.
- The compiler (`src/engine/compile.ts`) is a pure function. Never read global state inside it.
- The worklet (`src/audio/apu-worklet.ts`) must not import from the rest of the app; it is bundled separately. (`import type` is allowed — it is erased at compile time.)
- The worklet is loaded via Vite's `?worker&url` import (see SPEC.md §11.1 note); never via `new URL()`, which ships raw untranspiled TS in production builds.
- Do not add dependencies beyond SPEC.md Section 2 without asking.
- All timing is 60 fps frames. Never schedule audio events in seconds from the main thread.
- Run `npm test` and `npm run build` before declaring a milestone done.
- Work one milestone at a time. Do not add features from later milestones early.

## Commands
- `npm run dev`, `npm run build`, `npm run preview`, `npm test`, `npm run lint`
- `python scripts/build_chord_library.py path/to/free-midi-chords` (developer only)

## References
- NES APU: https://www.nesdev.org/wiki/APU
- Game Boy APU: https://gbdev.io/pandocs/Audio.html
- Chord corpus: https://github.com/ldrolez/free-midi-chords (MIT)
