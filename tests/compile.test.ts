import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { compile } from "../src/engine/compile";
import { NES_PROFILE } from "../src/engine/chip-profiles";
import { parseMidi } from "../src/engine/midi-import";
import { defaultProject } from "../src/engine/project";
import type { Project, TrackArrangement } from "../src/engine/project";
import type { FrameScript } from "../src/engine/frame-script";
import type { Note, Song, SourceTrack } from "../src/engine/song";

const PPQ = 96;

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

describe("compile timing", () => {
  it("places a note on beat 2 at frame 30 (120 BPM flatten) and holds one beat", () => {
    const s = song([srcTrack(0, [{ tick: PPQ, durationTicks: PPQ, midi: 69, velocity: 100 }])]);
    const { script } = compile(s, project([arrangement({})]), NES_PROFILE);
    const p1 = channel(script, "p1");
    expect(p1.volume[29]).toBe(0);
    expect(p1.volume[30]).toBeGreaterThan(0);
    expect(p1.period[30]).toBe(253); // A4 timer from M1 pitch tests
    expect(p1.volume[59]).toBeGreaterThan(0);
    expect(p1.volume[60]).toBe(0);
  });

  it("gives zero-length notes at least one frame", () => {
    const s = song([srcTrack(0, [{ tick: 0, durationTicks: 0, midi: 69, velocity: 100 }])]);
    const { script } = compile(s, project([arrangement({})]), NES_PROFILE);
    expect(channel(script, "p1").volume[0]).toBeGreaterThan(0);
  });

  it("doubles the tempo, halves the frames", () => {
    const s = song([srcTrack(0, [{ tick: PPQ, durationTicks: PPQ, midi: 69, velocity: 100 }])]);
    const { script } = compile(s, project([arrangement({})], { bpm: 240 }), NES_PROFILE);
    const p1 = channel(script, "p1");
    expect(p1.volume[14]).toBe(0);
    expect(p1.volume[15]).toBeGreaterThan(0);
    expect(p1.volume[30]).toBe(0);
  });

  it("scale mode keeps tempo-map proportions scaled by bpm/originalBpm", () => {
    const s: Song = {
      ...song([srcTrack(0, [{ tick: PPQ * 4, durationTicks: PPQ, midi: 69, velocity: 100 }])]),
      tempoMap: [
        { tick: 0, bpm: 120 },
        { tick: PPQ * 2, bpm: 60 }, // bars slow to half speed after beat 2
      ],
    };
    const { script } = compile(
      s,
      project([arrangement({})], { bpm: 120, tempoMode: "scale" }),
      NES_PROFILE,
    );
    // 2 beats @120 (1s) + 2 beats @60 (2s) = 3s → frame 180
    const p1 = channel(script, "p1");
    expect(p1.volume[179]).toBe(0);
    expect(p1.volume[180]).toBeGreaterThan(0);
  });

  it("computes barStarts from the time signature", () => {
    const s = song([srcTrack(0, [{ tick: 0, durationTicks: PPQ * 8, midi: 69, velocity: 100 }])]);
    const { script } = compile(s, project([arrangement({})]), NES_PROFILE);
    expect(script.barStarts.slice(0, 2)).toEqual([0, 120]); // 4/4 @120 = 2s/bar
  });
});

describe("polyphony resolution (top/bottom)", () => {
  const chord: Note[] = [
    { tick: 0, durationTicks: PPQ * 2, midi: 60, velocity: 100 },
    { tick: 0, durationTicks: PPQ, midi: 67, velocity: 100 },
  ];

  it("top picks the highest sounding note", () => {
    const s = song([srcTrack(0, chord)]);
    const { script } = compile(s, project([arrangement({ polyMode: "top" })]), NES_PROFILE);
    const p1 = channel(script, "p1");
    expect(p1.period[0]).toBe(284); // G4 = 392 Hz → round(1789773/(16*392)-1)
    expect(p1.period[45]).toBe(427); // C4 revealed after G4 ends at frame 30
  });

  it("bottom picks the lowest sounding note", () => {
    const s = song([srcTrack(0, chord)]);
    const { script } = compile(s, project([arrangement({ polyMode: "bottom" })]), NES_PROFILE);
    expect(channel(script, "p1").period[0]).toBe(427); // C4 throughout
  });

  it("restarts instrument macros when a note ends and reveals another (retrigger)", () => {
    const s = song([srcTrack(0, chord)]);
    const { script } = compile(
      s,
      project([arrangement({ polyMode: "top", instrumentId: "pluck" })]),
      NES_PROFILE,
    );
    const p1 = channel(script, "p1");
    expect(p1.volume[0]).toBe(15); // pluck attack
    expect(p1.volume[8]).toBe(0); // decayed
    expect(p1.volume[30]).toBe(15); // re-attacked on reveal of C4
  });
});

describe("track processing", () => {
  it("clamps out-of-range notes by octaves and warns", () => {
    const s = song([srcTrack(0, [{ tick: 0, durationTicks: PPQ, midi: 24, velocity: 100 }])]);
    const { script, warnings } = compile(s, project([arrangement({})]), NES_PROFILE);
    expect(channel(script, "p1").period[0]).toBeGreaterThan(0); // audible, shifted up
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toMatch(/1 note.*octave/i);
  });

  it("drops muted tracks; solo drops everyone else", () => {
    const notes: Note[] = [{ tick: 0, durationTicks: PPQ, midi: 60, velocity: 100 }];
    const s = song([srcTrack(0, notes), srcTrack(1, notes)]);
    const t0 = arrangement({ id: "t0", sourceIndex: 0, slots: ["p1"] });
    const t1 = arrangement({ id: "t1", sourceIndex: 1, slots: ["p2"] });

    const muted = compile(s, project([{ ...t0, mute: true }, t1]), NES_PROFILE).script;
    expect(channel(muted, "p1").volume[0]).toBe(0);
    expect(channel(muted, "p2").volume[0]).toBeGreaterThan(0);

    const soloed = compile(s, project([t0, { ...t1, solo: true }]), NES_PROFILE).script;
    expect(channel(soloed, "p1").volume[0]).toBe(0);
    expect(channel(soloed, "p2").volume[0]).toBeGreaterThan(0);
  });

  it("scales macro volume by track volume", () => {
    const s = song([srcTrack(0, [{ tick: 0, durationTicks: PPQ, midi: 69, velocity: 100 }])]);
    const { script } = compile(s, project([arrangement({ volume: 5 })]), NES_PROFILE);
    expect(channel(script, "p1").volume[0]).toBe(4); // round(12 * 5/15)
  });

  it("applies octaveShift and renders arp/split as top in M2", () => {
    const s = song([srcTrack(0, [{ tick: 0, durationTicks: PPQ, midi: 69, velocity: 100 }])]);
    const { script } = compile(
      s,
      project([arrangement({ octaveShift: -1, polyMode: "arp" })]),
      NES_PROFILE,
    );
    expect(channel(script, "p1").period[0]).toBe(507); // A3 = 220 Hz → timer 507
  });

  it("skips drum tracks (GM drum map is M3)", () => {
    const s = song([
      srcTrack(0, [{ tick: 0, durationTicks: PPQ, midi: 38, velocity: 100 }], { isDrums: true }),
    ]);
    const { script } = compile(s, project([arrangement({ slots: ["noise"] })]), NES_PROFILE);
    expect(channel(script, "noise").volume[0]).toBe(0);
  });
});

describe("compile snapshots (3 fixture MIDIs)", () => {
  function digest(script: FrameScript) {
    return {
      frameCount: script.frameCount,
      barStarts: script.barStarts,
      channels: script.channels.map((c) => {
        let nonZero = 0;
        let checksum = 7;
        for (let i = 0; i < script.frameCount; i++) {
          if (c.volume[i] > 0) nonZero++;
          checksum = (checksum * 31 + c.period[i] * 3 + c.volume[i] * 5 + c.duty[i]) >>> 0;
        }
        return {
          id: c.id,
          nonZero,
          checksum,
          head: Array.from(c.period.slice(0, 12)),
          volHead: Array.from(c.volume.slice(0, 12)),
        };
      }),
    };
  }

  function midiBytes(build: (m: Midi) => void): Uint8Array {
    const m = new Midi();
    build(m);
    return new Uint8Array(m.toArray());
  }

  it("fixture A: melody + bass", () => {
    const data = midiBytes((m) => {
      m.header.setTempo(120);
      const mel = m.addTrack();
      mel.name = "Melody";
      [72, 74, 76, 77].forEach((n, i) =>
        mel.addNote({ midi: n, ticks: i * m.header.ppq, durationTicks: m.header.ppq - 10, velocity: 0.8 }),
      );
      const bass = m.addTrack();
      bass.name = "Bass";
      [48, 43].forEach((n, i) =>
        bass.addNote({ midi: n, ticks: i * m.header.ppq * 2, durationTicks: m.header.ppq * 2, velocity: 0.8 }),
      );
    });
    const s = parseMidi(data, "fixture-a.mid");
    const { script, warnings } = compile(s, defaultProject(s), NES_PROFILE);
    expect(warnings).toEqual([]);
    expect(digest(script)).toMatchSnapshot();
  });

  it("fixture B: block chords resolved by top/bottom", () => {
    const data = midiBytes((m) => {
      m.header.setTempo(100);
      const piano = m.addTrack();
      piano.name = "Piano";
      const chords = [
        [48, 60, 64, 67],
        [45, 57, 60, 64],
      ];
      chords.forEach((c, i) =>
        c.forEach((n) =>
          piano.addNote({ midi: n, ticks: i * m.header.ppq * 2, durationTicks: m.header.ppq * 2, velocity: 0.7 }),
        ),
      );
    });
    const s = parseMidi(data, "fixture-b.mid");
    const { script } = compile(s, defaultProject(s), NES_PROFILE);
    expect(digest(script)).toMatchSnapshot();
  });

  it("fixture C: BPM override at 90 with a pluck", () => {
    const data = midiBytes((m) => {
      m.header.setTempo(140);
      const t = m.addTrack();
      t.name = "Lead";
      [60, 64, 67, 72].forEach((n, i) =>
        t.addNote({ midi: n, ticks: i * m.header.ppq, durationTicks: m.header.ppq / 2, velocity: 1 }),
      );
    });
    const s = parseMidi(data, "fixture-c.mid");
    const p = defaultProject(s);
    p.bpm = 90;
    p.tracks[0].instrumentId = "pluck";
    const { script } = compile(s, p, NES_PROFILE);
    expect(digest(script)).toMatchSnapshot();
  });
});
