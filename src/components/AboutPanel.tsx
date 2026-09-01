import { APP_NAME, COFFEE_URL } from "../config";

export default function AboutPanel({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 p-5 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{APP_NAME}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
            ✕
          </button>
        </div>

        <p className="mb-3 text-zinc-300">
          Turns any MIDI file into music that sounds like it came out of an NES or a Game Boy —
          authentic chip constraints, frame-quantized instrument macros, arpeggiated chords and
          all. Everything runs in your browser; nothing is uploaded anywhere.
        </p>

        <h3 className="mb-1 font-medium text-zinc-200">Credits &amp; references</h3>
        <ul className="mb-3 list-inside list-disc text-zinc-400">
          <li>
            Chord progressions derived from{" "}
            <a
              className="text-emerald-400 hover:underline"
              href="https://github.com/ldrolez/free-midi-chords"
              target="_blank"
              rel="noreferrer"
            >
              ldrolez/free-midi-chords
            </a>{" "}
            (MIT)
          </li>
          <li>
            NES APU sound model:{" "}
            <a
              className="text-emerald-400 hover:underline"
              href="https://www.nesdev.org/wiki/APU"
              target="_blank"
              rel="noreferrer"
            >
              NESdev wiki
            </a>
          </li>
          <li>
            Game Boy sound model:{" "}
            <a
              className="text-emerald-400 hover:underline"
              href="https://gbdev.io/pandocs/Audio.html"
              target="_blank"
              rel="noreferrer"
            >
              Pan Docs
            </a>
          </li>
        </ul>

        <h3 className="mb-1 font-medium text-zinc-200">Good to know</h3>
        <ul className="mb-3 list-inside list-disc text-zinc-400">
          <li>Projects save as JSON with the MIDI embedded; share links carry everything in the URL.</li>
          <li>Chord Assist's derived tracks are not stored in saved projects (v1 limitation).</li>
          <li>Not affiliated with Nintendo. No Nintendo assets are used or imitated.</li>
        </ul>

        {COFFEE_URL !== "" && (
          <p className="mb-3">
            <a
              className="text-amber-300 hover:underline"
              href={COFFEE_URL}
              target="_blank"
              rel="noreferrer"
            >
              ☕ Enjoying this? Buy me a coffee
            </a>
          </p>
        )}

        <p className="text-xs text-zinc-500">MIT licensed. © 2026 Shane Morris.</p>
      </div>
    </div>
  );
}
