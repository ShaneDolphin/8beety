import { Midi } from "@tonejs/midi";
import type { FrameScript } from "./frame-script";
import { gbPulseFreq, gbWaveFreq, nesPulseFreq, nesTriangleFreq, spcFreq, ymFreq } from "./pitch";

// §10.2: render the compiled output back to MIDI, one track per channel,
// arpeggios written out as fast notes — for people who want a real DAW.

// sega fm lanes ("fm1".."fm5") are ymPack-encoded; sega's dac lane and every
// snes voice ("v1".."v8") are spcPitch-encoded — see chip-profiles.ts.
function periodToMidi(chip: FrameScript["chip"], channelId: string, period: number): number {
  const freq =
    chip === "sega"
      ? channelId.startsWith("fm")
        ? ymFreq(period)
        : spcFreq(period)
      : chip === "snes"
        ? spcFreq(period)
        : channelId === "tri"
          ? nesTriangleFreq(period)
          : channelId === "wave"
            ? gbWaveFreq(period)
            : chip === "gb"
              ? gbPulseFreq(period)
              : nesPulseFreq(period);
  return Math.max(0, Math.min(127, Math.round(69 + 12 * Math.log2(freq / 440))));
}

function noiseGm(period: number): number {
  if (period <= 32) return 42; // closed hat
  if (period <= 200) return 38; // snare
  return 36; // kick
}

export function exportArrangedMidi(script: FrameScript, bpm: number): Uint8Array {
  const midi = new Midi();
  midi.header.setTempo(bpm);
  const ticksPerFrame = ((bpm / 60) * midi.header.ppq) / 60;

  for (const ch of script.channels) {
    const isNoise = ch.id === "noise";
    const track = midi.addTrack();
    track.name = ch.id;
    if (isNoise) track.channel = 9;

    let start = -1;
    let curMidi = 0;
    let velocity = 0;
    const flush = (end: number) => {
      if (start < 0) return;
      track.addNote({
        midi: curMidi,
        ticks: Math.round(start * ticksPerFrame),
        durationTicks: Math.max(1, Math.round((end - start) * ticksPerFrame)),
        velocity,
      });
      start = -1;
    };

    for (let f = 0; f < script.frameCount; f++) {
      const on = ch.volume[f] > 0 && ch.period[f] > 0;
      if (!on) {
        flush(f);
        continue;
      }
      const m = isNoise ? noiseGm(ch.period[f]) : periodToMidi(script.chip, ch.id, ch.period[f]);
      if (start < 0) {
        start = f;
        curMidi = m;
        velocity = ch.volume[f] / 15;
      } else if (!isNoise && m !== curMidi) {
        flush(f);
        start = f;
        curMidi = m;
        velocity = ch.volume[f] / 15;
      }
    }
    flush(script.frameCount);
  }

  return new Uint8Array(midi.toArray());
}
