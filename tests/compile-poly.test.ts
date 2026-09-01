import { describe, expect, it } from "vitest";
import { compile } from "../src/engine/compile";
import { NES_PROFILE } from "../src/engine/chip-profiles";
import type { FrameScript } from "../src/engine/frame-script";
import { midiToFreq, nesPulseTimer } from "../src/engine/pitch";
import type { Project, TrackArrangement } from "../src/engine/project";
import type { Note, Song, SourceTrack } from "../src/engine/song";

const PPQ = 96; // at 120 BPM: 1 beat = 96 ticks = 30 frames

function srcTrack(index: number, notes: Note[], opts?: Partial<SourceTrack>): SourceTrack {
  const pitches = notes.map((n) => n.midi);
  return {
    index,
    name: `Track ${index + 1}`,
    midiChannel: 0,
    isDrums: false,
    notes,
    maxPolyphony: 1,
    pitchRange: [Math.min(...pitches), Math.max(...pitches)],
    ...opts,
  };
}

function song(tracks: SourceTrack[], durationTicks = PPQ * 8): Song {
  return {
    name: "t.mid",
    ppq: PPQ,
    originalBpm: 120,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignature: [4, 4],
    durationTicks,
    tracks,
  };
}

function arrangement(overrides: Partial<TrackArrangement>): TrackArrangement {
  return {
    id: "t0",
    sourceIndex: 0,
    name: "Track 1",
    slots: ["p1"],
    instrumentId: "thin-lead",
    polyMode: "top",
    arpFramesPerStep: 1,
    octaveShift: 0,
    transpose: 0,
    volume: 15,
    mute: false,
    solo: false,
    ...overrides,
  };
}

function project(tracks: TrackArrangement[], overrides?: Partial<Project>): Project {
  return {
    version: 1,
    chip: "nes",
    bpm: 120,
    tempoMode: "flatten",
    transpose: 0,
    outputFilter: true,
    tracks,
    ...overrides,
  };
}

function channel(script: FrameScript, id: string) {
  const ch = script.channels.find((c) => c.id === id);
  if (!ch) throw new Error(`no channel ${id}`);
  return ch;
}

const timer = (midi: number) => nesPulseTimer(midiToFreq(midi)) ?? 0;

// C major triad held for two beats.
const triad: Note[] = [60, 64, 67].map((midi) => ({
  tick: 0,
  durationTicks: PPQ * 2,
  midi,
  velocity: 100,
}));

describe("arp polyMode", () => {
  it("cycles the chord tones ascending at 1 frame per step", () => {
    const s = song([srcTrack(0, triad)]);
    const { script } = compile(s, project([arrangement({ polyMode: "arp" })]), NES_PROFILE);
    const p1 = channel(script, "p1");
    expect([p1.period[0], p1.period[1], p1.period[2]]).toEqual([timer(60), timer(64), timer(67)]);
    expect([p1.period[3], p1.period[4], p1.period[5]]).toEqual([timer(60), timer(64), timer(67)]);
  });

  it("holds each step for arpFramesPerStep frames", () => {
    const s = song([srcTrack(0, triad)]);
    const { script } = compile(
      s,
      project([arrangement({ polyMode: "arp", arpFramesPerStep: 2 })]),
      NES_PROFILE,
    );
    const p1 = channel(script, "p1");
    expect(Array.from(p1.period.slice(0, 6))).toEqual([
      timer(60), timer(60), timer(64), timer(64), timer(67), timer(67),
    ]);
  });

  it("restarts the cycle on chord change", () => {
    const notes: Note[] = [
      ...triad,
      // D minor from beat 2
      ...[62, 65, 69].map((midi) => ({ tick: PPQ * 2, durationTicks: PPQ, midi, velocity: 100 })),
    ];
    const s = song([srcTrack(0, notes)]);
    const { script } = compile(s, project([arrangement({ polyMode: "arp" })]), NES_PROFILE);
    const p1 = channel(script, "p1");
    expect(p1.period[60]).toBe(timer(62)); // cycle restarted at the new root
  });

  it("volume macro runs from chord start across steps (pluck decays over the chord)", () => {
    const s = song([srcTrack(0, triad)]);
    const { script } = compile(
      s,
      project([arrangement({ polyMode: "arp", instrumentId: "pluck" })]),
      NES_PROFILE,
    );
    const p1 = channel(script, "p1");
    expect(p1.volume[0]).toBe(15);
    expect(p1.volume[1]).toBe(11); // decaying while the pitch cycles
    expect(p1.volume[2]).toBe(8);
  });

  it("reduces >4-note chords before cycling", () => {
    const c9: Note[] = [60, 64, 67, 70, 74].map((midi) => ({
      tick: 0,
      durationTicks: PPQ,
      midi,
      velocity: 100,
    }));
    const s = song([srcTrack(0, c9)]);
    const { script } = compile(s, project([arrangement({ polyMode: "arp" })]), NES_PROFILE);
    const p1 = channel(script, "p1");
    // 5th (67) dropped: cycle is 60 64 70 74
    expect(Array.from(p1.period.slice(0, 4))).toEqual([timer(60), timer(64), timer(70), timer(74)]);
  });
});

describe("split polyMode", () => {
  it("assigns ascending notes to slots in order; overflow arps on the last slot", () => {
    const s = song([srcTrack(0, triad)]);
    const { script } = compile(
      s,
      project([arrangement({ polyMode: "split", slots: ["p1", "p2"] })]),
      NES_PROFILE,
    );
    const p1 = channel(script, "p1");
    const p2 = channel(script, "p2");
    expect(p1.period[0]).toBe(timer(60)); // lowest note
    expect(p1.period[1]).toBe(timer(60));
    expect([p2.period[0], p2.period[1]]).toEqual([timer(64), timer(67)]); // overflow arp
  });

  it("leaves extra slots silent when there are fewer notes", () => {
    const s = song([srcTrack(0, [{ tick: 0, durationTicks: PPQ, midi: 60, velocity: 100 }])]);
    const { script } = compile(
      s,
      project([arrangement({ polyMode: "split", slots: ["p1", "p2"] })]),
      NES_PROFILE,
    );
    expect(channel(script, "p1").volume[0]).toBeGreaterThan(0);
    expect(channel(script, "p2").volume[0]).toBe(0);
  });

  it("resolves instruments per slot kind (pulse instrument on a triangle slot falls back)", () => {
    const s = song([srcTrack(0, triad)]);
    const { script, warnings } = compile(
      s,
      project([arrangement({ polyMode: "split", slots: ["tri", "p1", "p2"] })]),
      NES_PROFILE,
    );
    expect(channel(script, "tri").volume[0]).toBeGreaterThan(0); // lowest note on triangle
    expect(channel(script, "p1").volume[0]).toBeGreaterThan(0);
    expect(warnings.some((w) => /Thin Lead/.test(w.message))).toBe(true);
  });
});

describe("drum rendering", () => {
  const drumTrack = (notes: Note[]) =>
    srcTrack(0, notes, { isDrums: true, midiChannel: 9 });

  it("maps GM notes to distinct noise presets", () => {
    const s = song([
      drumTrack([
        { tick: 0, durationTicks: 10, midi: 36, velocity: 100 }, // kick
        { tick: PPQ, durationTicks: 10, midi: 38, velocity: 100 }, // snare
        { tick: PPQ * 2, durationTicks: 10, midi: 42, velocity: 100 }, // closed hat
      ]),
    ]);
    const { script } = compile(s, project([arrangement({ slots: ["noise"] })]), NES_PROFILE);
    const noise = channel(script, "noise");
    expect(noise.period[0]).toBe(380); // kick start period
    expect(noise.volume[0]).toBe(15);
    expect(noise.period[30]).toBe(160); // snare
    expect(noise.period[60]).toBe(16); // hat
    expect(noise.volume[63]).toBe(0); // hat is short
  });

  it("same-frame hits keep the highest priority (kick beats hat)", () => {
    const s = song([
      drumTrack([
        { tick: 0, durationTicks: 10, midi: 42, velocity: 100 },
        { tick: 0, durationTicks: 10, midi: 36, velocity: 100 },
      ]),
    ]);
    const { script } = compile(s, project([arrangement({ slots: ["noise"] })]), NES_PROFILE);
    expect(channel(script, "noise").period[0]).toBe(380); // kick, not hat
  });

  it("a later hit cuts a decaying crash", () => {
    const s = song([
      drumTrack([
        { tick: 0, durationTicks: 10, midi: 49, velocity: 100 }, // crash (30-frame decay)
        { tick: PPQ / 6, durationTicks: 10, midi: 42, velocity: 100 }, // hat at frame 5
      ]),
    ]);
    const { script } = compile(s, project([arrangement({ slots: ["noise"] })]), NES_PROFILE);
    const noise = channel(script, "noise");
    expect(noise.period[4]).toBe(64); // crash still ringing
    expect(noise.period[5]).toBe(16); // hat takes over
  });

  it("metal hit sets the short-mode bit", () => {
    const s = song([drumTrack([{ tick: 0, durationTicks: 10, midi: 37, velocity: 100 }])]);
    const { script } = compile(s, project([arrangement({ slots: ["noise"] })]), NES_PROFILE);
    expect(channel(script, "noise").duty[0]).toBe(1);
  });
});

describe("layer modes (two pulse slots, top/bottom)", () => {
  const line: Note[] = [{ tick: 0, durationTicks: PPQ * 2, midi: 69, velocity: 100 }];
  const layered = (layerMode: TrackArrangement["layerMode"]) =>
    compile(
      song([srcTrack(0, line)]),
      project([arrangement({ slots: ["p1", "p2"], layerMode })]),
      NES_PROFILE,
    ).script;

  it("double copies the line onto the second pulse", () => {
    const script = layered("double");
    expect(channel(script, "p2").period[10]).toBe(channel(script, "p1").period[10]);
    expect(channel(script, "p2").volume[10]).toBe(channel(script, "p1").volume[10]);
  });

  it("detune offsets the second pulse by +4 timer units", () => {
    const script = layered("detune");
    expect(channel(script, "p2").period[10]).toBe(channel(script, "p1").period[10] + 4);
  });

  it("echo3 delays by 3 frames at half volume", () => {
    const script = layered("echo3");
    const p1 = channel(script, "p1");
    const p2 = channel(script, "p2");
    expect(p2.volume[0]).toBe(0);
    expect(p2.period[3]).toBe(p1.period[0]);
    expect(p2.volume[3]).toBe(Math.round(p1.volume[0] / 2));
  });

  it("octave-up plays the second pulse an octave higher", () => {
    const script = layered("octave-up");
    expect(channel(script, "p2").period[10]).toBe(timer(81)); // A5
  });
});
