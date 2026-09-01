import { Midi } from "@tonejs/midi";
import type { Note, Song, SourceTrack } from "./song";

function maxPolyphony(notes: Note[]): number {
  // Sweep note-on/off boundaries; count concurrent notes.
  const events: { tick: number; delta: number }[] = [];
  for (const n of notes) {
    events.push({ tick: n.tick, delta: 1 });
    events.push({ tick: n.tick + n.durationTicks, delta: -1 });
  }
  events.sort((a, b) => a.tick - b.tick || a.delta - b.delta); // offs before ons at equal tick
  let cur = 0;
  let max = 0;
  for (const e of events) {
    cur += e.delta;
    if (cur > max) max = cur;
  }
  return max;
}

export function parseMidi(data: Uint8Array, fileName: string): Song {
  const midi = new Midi(data);

  const tracks: SourceTrack[] = [];
  for (const t of midi.tracks) {
    if (t.notes.length === 0) continue;
    const notes: Note[] = t.notes
      .map((n) => ({
        tick: n.ticks,
        durationTicks: n.durationTicks,
        midi: n.midi,
        velocity: Math.round(n.velocity * 127),
      }))
      .sort((a, b) => a.tick - b.tick);
    const index = tracks.length;
    const name = t.name.trim() !== "" ? t.name.trim() : `Track ${index + 1}`;
    const pitches = notes.map((n) => n.midi);
    tracks.push({
      index,
      name,
      midiChannel: t.channel,
      program: t.instrument.number,
      isDrums: t.channel === 9 || /drum|perc/i.test(name),
      notes,
      maxPolyphony: maxPolyphony(notes),
      pitchRange: [Math.min(...pitches), Math.max(...pitches)],
    });
  }

  const tempos = midi.header.tempos;
  const originalBpm = tempos.length > 0 ? tempos[0].bpm : 120;
  const ts = midi.header.timeSignatures[0]?.timeSignature;

  return {
    name: fileName,
    ppq: midi.header.ppq,
    originalBpm,
    tempoMap:
      tempos.length > 0
        ? tempos.map((t) => ({ tick: t.ticks, bpm: t.bpm }))
        : [{ tick: 0, bpm: 120 }],
    timeSignature: ts ? [ts[0], ts[1]] : [4, 4],
    durationTicks: midi.durationTicks,
    tracks,
  };
}
