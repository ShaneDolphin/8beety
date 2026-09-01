// Developer-only: generates the self-composed demo MIDIs (no copyrighted
// material). Run: node scripts/make-demo-midis.mjs
import tonejsMidi from "@tonejs/midi";
import { mkdirSync, writeFileSync } from "node:fs";

const { Midi } = tonejsMidi;

function build(bpm, bars, writeTracks) {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ppq = midi.header.ppq;
  const beat = ppq;
  const bar = 4 * beat;
  writeTracks({ midi, beat, bar, bars });
  return midi;
}

function drumGroove({ midi, beat, bar, bars }, { hatEighths = true, density = 1 } = {}) {
  const drums = midi.addTrack();
  drums.name = "Drums";
  drums.channel = 9;
  for (let b = 0; b < bars; b++) {
    for (let i = 0; i < 4; i++) {
      const t = b * bar + i * beat;
      drums.addNote({ midi: i % 2 === 0 ? 36 : 38, ticks: t, durationTicks: 30, velocity: 0.9 });
      drums.addNote({ midi: 42, ticks: t, durationTicks: 20, velocity: 0.6 });
      if (hatEighths) drums.addNote({ midi: 42, ticks: t + beat / 2, durationTicks: 20, velocity: 0.5 });
      if (density > 1 && i === 3) drums.addNote({ midi: 38, ticks: t + beat / 2, durationTicks: 20, velocity: 0.7 });
    }
    if (b % 4 === 3) drums.addNote({ midi: 49, ticks: (b + 1) * bar - beat / 2, durationTicks: 40, velocity: 0.8 });
  }
}

// Adventure: bright pop I–V–vi–IV in C (the original demo).
const adventure = build(112, 8, (ctx) => {
  const { midi, beat, bar } = ctx;
  const roots = [48, 43, 45, 41];
  const triads = [[60, 64, 67], [59, 62, 67], [57, 60, 64], [57, 60, 65]];
  const melody = midi.addTrack();
  melody.name = "Melody";
  const phrase = [
    [72, 1], [76, 1], [79, 1], [76, 1],
    [74, 1.5], [71, 0.5], [67, 2],
    [69, 1], [72, 1], [76, 1], [72, 1],
    [77, 1.5], [76, 0.5], [72, 2],
  ];
  let tick = 0;
  for (let rep = 0; rep < 2; rep++) {
    for (const [note, beats] of phrase) {
      melody.addNote({ midi: note, ticks: tick, durationTicks: beats * beat - 8, velocity: 0.85 });
      tick += beats * beat;
    }
  }
  const chords = midi.addTrack();
  chords.name = "Chords";
  for (let b = 0; b < 8; b++) {
    for (const n of triads[b % 4]) chords.addNote({ midi: n, ticks: b * bar, durationTicks: bar - 12, velocity: 0.6 });
  }
  const bass = midi.addTrack();
  bass.name = "Bass";
  for (let b = 0; b < 8; b++) {
    const root = roots[b % 4];
    for (let i = 0; i < 4; i++) {
      bass.addNote({ midi: i % 2 === 0 ? root : root + 7, ticks: b * bar + i * beat, durationTicks: beat - 10, velocity: 0.8 });
    }
  }
  drumGroove(ctx);
});

// Dungeon: brooding A minor i–VI–III–VII at 92 BPM.
const dungeon = build(92, 8, (ctx) => {
  const { midi, beat, bar } = ctx;
  const roots = [45, 41, 36, 43]; // A2 F2 C2 G2
  const triads = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62]];
  const melody = midi.addTrack();
  melody.name = "Lead";
  const line = [
    [69, 2], [72, 1], [71, 1],
    [69, 1.5], [65, 0.5], [64, 2],
    [60, 1], [64, 1], [67, 1], [72, 1],
    [71, 2], [67, 2],
  ];
  let tick = 0;
  for (let rep = 0; rep < 2; rep++) {
    for (const [note, beats] of line) {
      melody.addNote({ midi: note, ticks: tick, durationTicks: beats * beat - 12, velocity: 0.8 });
      tick += beats * beat;
    }
  }
  const chords = midi.addTrack();
  chords.name = "Pads";
  for (let b = 0; b < 8; b++) {
    for (const n of triads[b % 4]) chords.addNote({ midi: n, ticks: b * bar, durationTicks: bar - 8, velocity: 0.55 });
  }
  const bass = midi.addTrack();
  bass.name = "Bass";
  for (let b = 0; b < 8; b++) {
    const root = roots[b % 4];
    bass.addNote({ midi: root, ticks: b * bar, durationTicks: 2 * beat - 10, velocity: 0.85 });
    bass.addNote({ midi: root + 12, ticks: b * bar + 2 * beat, durationTicks: beat - 10, velocity: 0.7 });
    bass.addNote({ midi: root + 7, ticks: b * bar + 3 * beat, durationTicks: beat - 10, velocity: 0.7 });
  }
  drumGroove(ctx, { hatEighths: false });
});

// Boss: driving E minor riff at 168 BPM.
const boss = build(168, 8, (ctx) => {
  const { midi, beat, bar } = ctx;
  const riffRoots = [40, 40, 43, 45]; // E2 E2 G2 A2
  const melody = midi.addTrack();
  melody.name = "Lead";
  const cell = [[76, 0.5], [79, 0.5], [76, 0.5], [74, 0.5], [76, 1], [71, 1]];
  let tick = 0;
  for (let b = 0; b < 8; b++) {
    const offset = b % 4 === 2 ? 3 : b % 4 === 3 ? 5 : 0;
    for (const [note, beats] of cell) {
      melody.addNote({ midi: note + offset, ticks: tick, durationTicks: beats * beat - 6, velocity: 0.9 });
      tick += beats * beat;
    }
  }
  const chords = midi.addTrack();
  chords.name = "Stabs";
  const stabs = [[64, 67, 71], [64, 67, 71], [67, 71, 74], [69, 72, 76]];
  for (let b = 0; b < 8; b++) {
    for (const i of [0, 2.5]) {
      for (const n of stabs[b % 4]) {
        chords.addNote({ midi: n, ticks: b * bar + i * beat, durationTicks: beat / 2, velocity: 0.75 });
      }
    }
  }
  const bass = midi.addTrack();
  bass.name = "Bass";
  for (let b = 0; b < 8; b++) {
    const root = riffRoots[b % 4];
    for (let i = 0; i < 8; i++) {
      bass.addNote({ midi: i === 3 ? root + 12 : root, ticks: b * bar + (i * beat) / 2, durationTicks: beat / 2 - 8, velocity: 0.85 });
    }
  }
  drumGroove(ctx, { density: 2 });
});

mkdirSync("public/demo-midis", { recursive: true });
for (const [name, midi] of [
  ["demo-adventure.mid", adventure],
  ["demo-dungeon.mid", dungeon],
  ["demo-boss.mid", boss],
]) {
  writeFileSync(`public/demo-midis/${name}`, Buffer.from(midi.toArray()));
  console.log("wrote", name);
}
