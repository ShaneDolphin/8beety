import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { parseMidi } from "../src/engine/midi-import";

// Build MIDI files in memory so the fixtures are deterministic and reviewable.
function makeMidi(build: (m: Midi) => void): Uint8Array {
  const m = new Midi();
  build(m);
  return new Uint8Array(m.toArray());
}

describe("parseMidi", () => {
  it("maps header fields: ppq, first tempo, time signature, duration", () => {
    const data = makeMidi((m) => {
      m.header.setTempo(150);
      m.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
      const t = m.addTrack();
      t.addNote({ midi: 60, ticks: 0, durationTicks: m.header.ppq * 4, velocity: 0.5 });
    });
    const song = parseMidi(data, "test.mid");
    expect(song.name).toBe("test.mid");
    expect(song.ppq).toBeGreaterThan(0);
    expect(song.originalBpm).toBeCloseTo(150, 0);
    expect(song.timeSignature).toEqual([3, 4]);
    expect(song.durationTicks).toBe(song.ppq * 4);
    expect(song.tempoMap[0].bpm).toBeCloseTo(150, 0);
  });

  it("defaults to 120 BPM when the file has no tempo event", () => {
    const data = makeMidi((m) => {
      const t = m.addTrack();
      t.addNote({ midi: 60, ticks: 0, durationTicks: 10, velocity: 0.5 });
    });
    expect(parseMidi(data, "x.mid").originalBpm).toBeCloseTo(120, 0);
  });

  it("converts note velocity from 0–1 to 0–127 and keeps tick fields", () => {
    const data = makeMidi((m) => {
      const t = m.addTrack();
      t.addNote({ midi: 64, ticks: 96, durationTicks: 48, velocity: 1 });
    });
    const note = parseMidi(data, "x.mid").tracks[0].notes[0];
    expect(note).toEqual({ tick: 96, durationTicks: 48, midi: 64, velocity: 127 });
  });

  it("skips tracks with no notes and indexes the remaining ones", () => {
    const data = makeMidi((m) => {
      m.addTrack(); // empty
      const t = m.addTrack();
      t.addNote({ midi: 60, ticks: 0, durationTicks: 10, velocity: 0.5 });
    });
    const song = parseMidi(data, "x.mid");
    expect(song.tracks).toHaveLength(1);
    expect(song.tracks[0].index).toBe(0);
  });

  it("names unnamed tracks 'Track N'", () => {
    const data = makeMidi((m) => {
      const t = m.addTrack();
      t.addNote({ midi: 60, ticks: 0, durationTicks: 10, velocity: 0.5 });
    });
    expect(parseMidi(data, "x.mid").tracks[0].name).toBe("Track 1");
  });

  it("flags drums by MIDI channel 9", () => {
    const data = makeMidi((m) => {
      const t = m.addTrack();
      t.channel = 9;
      t.addNote({ midi: 36, ticks: 0, durationTicks: 10, velocity: 0.5 });
    });
    expect(parseMidi(data, "x.mid").tracks[0].isDrums).toBe(true);
  });

  it("flags drums by track name", () => {
    const data = makeMidi((m) => {
      const t = m.addTrack();
      t.name = "Percussion";
      t.addNote({ midi: 60, ticks: 0, durationTicks: 10, velocity: 0.5 });
    });
    expect(parseMidi(data, "x.mid").tracks[0].isDrums).toBe(true);
  });

  it("computes maxPolyphony from overlapping notes", () => {
    const data = makeMidi((m) => {
      const t = m.addTrack();
      t.addNote({ midi: 60, ticks: 0, durationTicks: 100, velocity: 0.5 });
      t.addNote({ midi: 64, ticks: 50, durationTicks: 100, velocity: 0.5 });
      t.addNote({ midi: 67, ticks: 60, durationTicks: 20, velocity: 0.5 });
      t.addNote({ midi: 72, ticks: 200, durationTicks: 10, velocity: 0.5 });
    });
    const track = parseMidi(data, "x.mid").tracks[0];
    expect(track.maxPolyphony).toBe(3);
    expect(track.pitchRange).toEqual([60, 72]);
  });
});
