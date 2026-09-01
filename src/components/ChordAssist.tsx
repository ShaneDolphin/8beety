import { useMemo, useState } from "react";
import { segmentTrack, type ChordSegment } from "../theory/detect";
import { enrichChord, substitutionsFor, type ChordSpec } from "../theory/enrich";
import { deriveChordTrack } from "../theory/derive";
import { detectKey, NOTE_NAMES, QUALITY_SUFFIX } from "../theory/theory";
import type { SourceTrack } from "../engine/song";
import { useStore } from "../store";

// Spec's mood chips (§8.3.2), mapped onto the corpus's tag vocabulary.
const MOODS: { label: string; tag: string }[] = [
  { label: "hopeful", tag: "hopeful" },
  { label: "dark", tag: "dark" },
  { label: "nostalgic", tag: "nostalgic" },
  { label: "heroic", tag: "triumphant" },
  { label: "tense", tag: "mysterious" },
  { label: "playful", tag: "playful" },
];

const label = (c: ChordSpec) => NOTE_NAMES[c.rootPc] + QUALITY_SUFFIX[c.quality];

export default function ChordAssist() {
  const song = useStore((s) => s.song);
  const project = useStore((s) => s.project);
  const trackId = useStore((s) => s.chordAssistTrackId);
  const close = useStore((s) => s.openChordAssist);
  const addDerivedTrack = useStore((s) => s.addDerivedTrack);
  const showToast = useStore((s) => s.showToast);
  const [level, setLevel] = useState(1);
  const [mood, setMood] = useState("hopeful");
  const [subIndex, setSubIndex] = useState(0);

  const arr = project?.tracks.find((t) => t.id === trackId);
  const src = arr && song ? song.tracks[arr.sourceIndex] : undefined;

  const analysis = useMemo(() => {
    if (!song || !src) return null;
    const segments = segmentTrack(song, src);
    if (segments.length === 0) return null;
    const key = detectKey(src.notes);
    const melody = melodyTrack(song, project?.tracks ?? [], src);
    const melodyIntervals = segments.map((seg) => {
      const note = longestMelodyNote(melody, seg);
      return note !== null ? (((note - seg.chord.rootPc) % 12) + 12) % 12 : undefined;
    });
    const melodyLowAt = (startTick: number): number | undefined => {
      const seg = segments.find((s) => s.startTick === startTick);
      if (!seg || !melody) return undefined;
      const lows = melody.notes
        .filter((n) => n.tick < seg.endTick && n.tick + n.durationTicks > seg.startTick)
        .map((n) => n.midi);
      return lows.length > 0 ? Math.min(...lows) : undefined;
    };
    const detected: ChordSpec[] = segments.map((s) => ({
      rootPc: s.chord.rootPc,
      quality: s.chord.quality,
    }));
    return { segments, key, detected, melodyIntervals, melodyLowAt };
  }, [song, src, project]);

  if (!arr || !src || !song) return null;

  if (!analysis) {
    return (
      <Panel onClose={() => close(null)} title={`Chord Assist — ${src.name}`}>
        <p className="text-sm text-zinc-400">No chords detected in this track.</p>
      </Panel>
    );
  }

  const { segments, key, detected, melodyIntervals, melodyLowAt } = analysis;
  const enriched = detected.map((c, i) =>
    enrichChord(c.rootPc, c.quality, level, key, melodyIntervals[i]),
  );
  const subs = level === 3 ? substitutionsFor(detected, key, mood) : [];
  const shown = level === 3 ? (subs[subIndex]?.chords ?? detected) : enriched;

  function addTrack() {
    if (!analysis) return;
    const chords = level === 3 ? subs[subIndex]?.chords : enriched;
    if (!chords) {
      showToast("Pick a substitution first.");
      return;
    }
    const name = `${label(chords[0])} chords`;
    addDerivedTrack(
      deriveChordTrack(chords, segments, 0 /* re-indexed by the store */, name, melodyLowAt) as SourceTrack,
    );
    close(null);
  }

  return (
    <Panel onClose={() => close(null)} title={`Chord Assist — ${src.name}`}>
      <p className="mb-2 text-xs text-zinc-500">
        Key: <span className="font-mono text-zinc-300">{key.label}</span>
      </p>

      <div className="mb-3 flex flex-wrap gap-1">
        {shown.map((c, i) => (
          <span key={i} className="rounded bg-zinc-800 px-2 py-0.5 font-mono text-xs text-emerald-300">
            {label(c)}
          </span>
        ))}
      </div>

      <div className="mb-3 flex flex-col gap-1 text-sm">
        {["0 · As written", "1 · Sevenths", "2 · Colors", "3 · Substitute"].map((name, i) => (
          <label key={i} className="flex items-center gap-2">
            <input type="radio" checked={level === i} onChange={() => setLevel(i)} />
            {name}
          </label>
        ))}
      </div>

      {level === 3 && (
        <>
          <div className="mb-2 flex flex-wrap gap-1">
            {MOODS.map((m) => (
              <button
                key={m.tag}
                onClick={() => {
                  setMood(m.tag);
                  setSubIndex(0);
                }}
                className={`rounded-full px-2 py-0.5 text-xs ${
                  mood === m.tag ? "bg-emerald-600 text-white" : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="mb-3 flex flex-col gap-1">
            {subs.length === 0 && (
              <p className="text-xs text-zinc-500">
                No same-length substitutions match this progression's endpoints.
              </p>
            )}
            {subs.map((sub, i) => (
              <button
                key={sub.id}
                onClick={() => setSubIndex(i)}
                className={`rounded border px-2 py-1 text-left font-mono text-xs ${
                  i === subIndex
                    ? "border-emerald-600 bg-emerald-950/40 text-emerald-200"
                    : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                }`}
              >
                {sub.chords.map(label).join("  ")}
                <span className="ml-2 text-zinc-600">{sub.tags.join(", ")}</span>
              </button>
            ))}
          </div>
        </>
      )}

      <button
        onClick={addTrack}
        className="w-full rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500"
      >
        Add chord track
      </button>
      <p className="mt-2 text-[11px] text-zinc-600">
        Adds a derived track (arp by default). Assign it to a slot to hear it. Derived tracks are
        not saved in project files.
      </p>
    </Panel>
  );
}

function Panel({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed right-0 top-0 z-20 flex h-full w-80 flex-col border-l border-zinc-800 bg-zinc-900 p-4 shadow-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="truncate text-sm font-semibold">{title}</h2>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">
          ✕
        </button>
      </div>
      <div className="overflow-y-auto">{children}</div>
    </div>
  );
}

function melodyTrack(
  song: { tracks: SourceTrack[] },
  arrangements: { sourceIndex: number; slots: string[] }[],
  exclude: SourceTrack,
): SourceTrack | null {
  const onP1 = arrangements.find((a) => a.slots.includes("p1"));
  if (onP1) {
    const t = song.tracks[onP1.sourceIndex];
    if (t && t !== exclude && !t.isDrums) return t;
  }
  const candidates = song.tracks.filter((t) => t !== exclude && !t.isDrums && t.maxPolyphony <= 2);
  if (candidates.length === 0) return null;
  const mean = (t: SourceTrack) => t.notes.reduce((s, n) => s + n.midi, 0) / t.notes.length;
  return [...candidates].sort((a, b) => mean(b) - mean(a))[0];
}

function longestMelodyNote(melody: SourceTrack | null, seg: ChordSegment): number | null {
  if (!melody) return null;
  let best: { midi: number; dur: number } | null = null;
  for (const n of melody.notes) {
    const overlap = Math.min(n.tick + n.durationTicks, seg.endTick) - Math.max(n.tick, seg.startTick);
    if (overlap > 0 && (!best || overlap > best.dur)) best = { midi: n.midi, dur: overlap };
  }
  return best ? best.midi : null;
}
