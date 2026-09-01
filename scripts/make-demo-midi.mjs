// Developer-only: generates public/demo-midis/demo.mid (self-composed, no
// copyrighted material). Run: node scripts/make-demo-midi.mjs
import tonejsMidi from "@tonejs/midi";
import { mkdirSync, writeFileSync } from "node:fs";

const { Midi } = tonejsMidi;

const midi = new Midi();
midi.header.setTempo(112);
const ppq = midi.header.ppq;
const beat = ppq;
const bar = 4 * beat;

// 8 bars of I–V–vi–IV in C, twice.
const roots = [48, 43, 45, 41]; // C3 G2 A2 F2
const triads = [
  [60, 64, 67], // C
  [59, 62, 67], // G/B voicing
  [57, 60, 64], // Am
  [57, 60, 65], // F/A voicing
];

const melody = midi.addTrack();
melody.name = "Melody";
melody.channel = 0;
// A simple call-and-answer line over the progression.
const phrase = [
  [72, 1], [76, 1], [79, 1], [76, 1], // bar 1: C arpeggio figure
  [74, 1.5], [71, 0.5], [67, 2], // bar 2: answer on G
  [69, 1], [72, 1], [76, 1], [72, 1], // bar 3: Am figure
  [77, 1.5], [76, 0.5], [72, 2], // bar 4: F resolve
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
chords.channel = 1;
for (let b = 0; b < 8; b++) {
  for (const n of triads[b % 4]) {
    chords.addNote({ midi: n, ticks: b * bar, durationTicks: bar - 12, velocity: 0.6 });
  }
}

const bass = midi.addTrack();
bass.name = "Bass";
bass.channel = 2;
for (let b = 0; b < 8; b++) {
  const root = roots[b % 4];
  // Root on 1 and 3, fifth on 2 and 4.
  for (let i = 0; i < 4; i++) {
    const note = i % 2 === 0 ? root : root + 7;
    bass.addNote({ midi: note, ticks: b * bar + i * beat, durationTicks: beat - 10, velocity: 0.8 });
  }
}

const drums = midi.addTrack();
drums.name = "Drums";
drums.channel = 9;
for (let b = 0; b < 8; b++) {
  for (let i = 0; i < 4; i++) {
    const t = b * bar + i * beat;
    drums.addNote({ midi: i % 2 === 0 ? 36 : 38, ticks: t, durationTicks: 30, velocity: 0.9 }); // kick/snare
    drums.addNote({ midi: 42, ticks: t, durationTicks: 20, velocity: 0.6 }); // hats on beats
    drums.addNote({ midi: 42, ticks: t + beat / 2, durationTicks: 20, velocity: 0.5 }); // and offbeats
  }
}

mkdirSync("public/demo-midis", { recursive: true });
writeFileSync("public/demo-midis/demo.mid", Buffer.from(midi.toArray()));
console.log("wrote public/demo-midis/demo.mid");
