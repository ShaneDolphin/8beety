import { Midi } from "@tonejs/midi";
import { describe, expect, it } from "vitest";
import { exportArrangedMidi } from "../src/engine/midi-export";
import type { ChannelFrames, FrameScript } from "../src/engine/frame-script";

const N = 120;

function mk(id: string): ChannelFrames {
  return {
    id,
    period: new Uint16Array(N),
    volume: new Uint8Array(N),
    duty: new Uint8Array(N),
    pan: new Uint8Array(N).fill(3),
  };
}

function script(chip: "nes" | "gb", channels: ChannelFrames[]): FrameScript {
  return { chip, fps: 60, frameCount: N, channels, barStarts: [0] };
}

describe("exportArrangedMidi", () => {
  it("reconstructs a sustained note with correct pitch and length", () => {
    const p1 = mk("p1");
    for (let f = 0; f < 60; f++) {
      p1.period[f] = 427; // C4 on NES pulse
      p1.volume[f] = 12;
    }
    const bytes = exportArrangedMidi(script("nes", [p1]), 120);
    const midi = new Midi(bytes);
    const notes = midi.tracks.flatMap((t) => t.notes);
    expect(notes).toHaveLength(1);
    expect(notes[0].midi).toBe(60);
    // 60 frames = 1 s = 2 beats at 120 BPM = 2*ppq ticks
    expect(notes[0].durationTicks).toBe(2 * midi.header.ppq);
    expect(midi.header.tempos[0].bpm).toBeCloseTo(120, 0);
  });

  it("writes arpeggios out as fast notes", () => {
    const p1 = mk("p1");
    const cycle = [427, 338, 284]; // C4 E4 G4
    for (let f = 0; f < 30; f++) {
      p1.period[f] = cycle[f % 3];
      p1.volume[f] = 10;
    }
    const midi = new Midi(exportArrangedMidi(script("nes", [p1]), 120));
    const notes = midi.tracks.flatMap((t) => t.notes);
    expect(notes.length).toBe(30); // one per frame
    expect(notes.slice(0, 3).map((n) => n.midi)).toEqual([60, 64, 67]);
  });

  it("does not fragment vibrato wobble into separate notes", () => {
    const p1 = mk("p1");
    const wobble = [253, 254, 255, 254, 253, 252, 251, 252];
    for (let f = 0; f < 64; f++) {
      p1.period[f] = wobble[f % 8]; // A4 ± tiny detune
      p1.volume[f] = 12;
    }
    const midi = new Midi(exportArrangedMidi(script("nes", [p1]), 120));
    expect(midi.tracks.flatMap((t) => t.notes)).toHaveLength(1);
  });

  it("exports noise hits as GM drums on channel 9", () => {
    const noise = mk("noise");
    for (let i = 0; i < 4; i++) {
      noise.period[i] = 16; // hat
      noise.volume[i] = 8;
      noise.period[30 + i] = 380; // kick-ish
      noise.volume[30 + i] = 15;
    }
    const midi = new Midi(exportArrangedMidi(script("nes", [noise]), 120));
    const drumTrack = midi.tracks.find((t) => t.notes.length > 0)!;
    expect(drumTrack.channel).toBe(9);
    expect(drumTrack.notes.map((n) => n.midi)).toEqual([42, 36]);
  });

  it("uses GB frequency formulas for gb scripts", () => {
    const p1 = mk("p1");
    for (let f = 0; f < 30; f++) {
      p1.period[f] = 1750; // A4 on GB
      p1.volume[f] = 12;
    }
    const midi = new Midi(exportArrangedMidi(script("gb", [p1]), 120));
    expect(midi.tracks.flatMap((t) => t.notes)[0].midi).toBe(69);
  });
});
