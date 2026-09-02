import { ApuCore } from "./apu-worklet";
import { PROFILES, type PlayableChip } from "../engine/chip-profiles";
import { compile } from "../engine/compile";
import type { Project } from "../engine/project";
import type { Song } from "../engine/song";

// §5: one-click preset audition — a C4 through the real compile pipeline,
// rendered by a main-thread ApuCore into a one-shot buffer. Never touches
// the worklet, so the arrangement keeps playing state untouched.
export function auditionInstrument(
  ctx: AudioContext,
  instrumentId: string,
  slotId: string,
  chip: PlayableChip,
): void {
  const song: Song = {
    name: "audition",
    ppq: 96,
    originalBpm: 120,
    tempoMap: [{ tick: 0, bpm: 120 }],
    timeSignature: [4, 4],
    durationTicks: 144, // 0.75 s at 120 BPM
    tracks: [
      {
        index: 0,
        name: "audition",
        midiChannel: 0,
        isDrums: false,
        notes: [{ tick: 0, durationTicks: 144, midi: 60, velocity: 100 }],
        maxPolyphony: 1,
        pitchRange: [60, 60],
      },
    ],
  };
  const project: Project = {
    version: 1,
    chip,
    bpm: 120,
    tempoMode: "flatten",
    transpose: 0,
    outputFilter: true,
    tracks: [
      {
        id: "audition",
        sourceIndex: 0,
        name: "audition",
        slots: [slotId],
        instrumentId,
        polyMode: "top",
        arpFramesPerStep: 1,
        octaveShift: 0,
        transpose: 0,
        volume: 15,
        mute: false,
        solo: false,
      },
    ],
  };

  const { script } = compile(song, project, PROFILES[chip]);
  const sampleRate = ctx.sampleRate;
  const samples = Math.ceil((script.frameCount / 60) * sampleRate);
  const stereo = PROFILES[chip].stereo;
  const core = new ApuCore(sampleRate);
  core.load(script);
  core.play();
  const buffer = ctx.createBuffer(stereo ? 2 : 1, samples, sampleRate);
  core.render(buffer.getChannelData(0), stereo ? buffer.getChannelData(1) : null);
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(ctx.destination);
  node.start();
}
