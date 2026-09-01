import type { ChannelDef, ChipProfile } from "./chip-profiles";
import type { ChannelFrames, FrameScript } from "./frame-script";
import { getPreset, macroValue, presetsForKind, type Instrument } from "./instruments";
import { midiToFreq, nesPulseTimer, nesTriangleTimer } from "./pitch";
import type { Project, TrackArrangement } from "./project";
import type { Song } from "./song";

export type CompileWarning = { trackId: string; message: string };
export type CompileResult = { script: FrameScript; warnings: CompileWarning[] };

type FrameEvent = { on: number; off: number; midi: number; seq: number };

const FPS = 60;
const TAIL_FRAMES = 30; // room for releases after the last note-off

function buildTickToSeconds(song: Song, project: Project): (tick: number) => number {
  if (project.tempoMode === "flatten") {
    const secPerTick = 60 / (project.bpm * song.ppq);
    return (tick) => tick * secPerTick;
  }
  const factor = project.bpm / song.originalBpm;
  const segs = [...song.tempoMap].sort((a, b) => a.tick - b.tick);
  if (segs.length === 0 || segs[0].tick > 0) segs.unshift({ tick: 0, bpm: song.originalBpm });
  const cumSec: number[] = [0];
  for (let i = 1; i < segs.length; i++) {
    const secPerTick = 60 / (segs[i - 1].bpm * factor * song.ppq);
    cumSec.push(cumSec[i - 1] + (segs[i].tick - segs[i - 1].tick) * secPerTick);
  }
  return (tick) => {
    let i = segs.length - 1;
    while (i > 0 && segs[i].tick > tick) i--;
    return cumSec[i] + (tick - segs[i].tick) * (60 / (segs[i].bpm * factor * song.ppq));
  };
}

function periodFor(kind: ChannelDef["kind"], midi: number): number | null {
  const freq = midiToFreq(midi);
  return kind === "triangle" ? nesTriangleTimer(freq) : nesPulseTimer(freq);
}

function renderTrack(
  ch: ChannelFrames,
  def: ChannelDef,
  inst: Instrument,
  polyMode: "top" | "bottom",
  events: FrameEvent[],
  trackVolume: number,
  frameCount: number,
): void {
  events.sort((a, b) => a.on - b.on || a.seq - b.seq);
  let next = 0;
  const active: FrameEvent[] = [];
  let current: FrameEvent | null = null;
  let macroFrame = 0;
  let releaseFrame = -1;
  let lastPeriod = 0;
  let lastDuty = 0;

  const scaleVol = (v: number) => Math.round((v * trackVolume) / 15);

  for (let f = 0; f < frameCount; f++) {
    while (next < events.length && events[next].on <= f) active.push(events[next++]);
    for (let i = active.length - 1; i >= 0; i--) if (active[i].off <= f) active.splice(i, 1);

    let sel: FrameEvent | null = null;
    for (const e of active) {
      if (
        sel === null ||
        (polyMode === "top" ? e.midi > sel.midi : e.midi < sel.midi) ||
        (e.midi === sel.midi && e.seq > sel.seq)
      ) {
        sel = e;
      }
    }

    if (sel !== current) {
      if (sel) {
        macroFrame = 0; // retrigger: new note-on, or a note ending revealed another
        releaseFrame = -1;
      } else if (inst.release) {
        releaseFrame = 0;
      }
      current = sel;
    }

    if (current) {
      const arpOff = inst.arpeggio ? macroValue(inst.arpeggio, macroFrame) : 0;
      const pitchOff = inst.pitch ? macroValue(inst.pitch, macroFrame) : 0;
      const vol = scaleVol(macroValue(inst.volume, macroFrame));
      const duty = inst.duty ? macroValue(inst.duty, macroFrame) : 0;
      const timer = periodFor(def.kind, current.midi + arpOff);
      if (timer !== null && vol > 0) {
        const lo = def.kind === "triangle" ? 0 : 8;
        const period = Math.min(2047, Math.max(lo, timer + pitchOff));
        ch.period[f] = period;
        ch.volume[f] = vol;
        ch.duty[f] = duty;
        lastPeriod = period;
        lastDuty = duty;
      }
      macroFrame++;
    } else if (releaseFrame >= 0 && inst.release && releaseFrame < inst.release.values.length) {
      const vol = scaleVol(inst.release.values[releaseFrame]);
      if (vol > 0 && lastPeriod > 0) {
        ch.period[f] = lastPeriod;
        ch.volume[f] = vol;
        ch.duty[f] = lastDuty;
      }
      releaseFrame++;
    }
  }
}

// Pure and deterministic: everything comes in through the arguments.
export function compile(song: Song, project: Project, profile: ChipProfile): CompileResult {
  const warnings: CompileWarning[] = [];
  const tickToSec = buildTickToSeconds(song, project);

  let lastOff = 0;
  for (const t of song.tracks) {
    for (const n of t.notes) {
      lastOff = Math.max(lastOff, n.tick + n.durationTicks);
    }
  }
  const endTick = Math.max(song.durationTicks, lastOff);
  const frameCount = Math.max(1, Math.round(tickToSec(endTick) * FPS) + TAIL_FRAMES);

  const channels: ChannelFrames[] = profile.channels.map((c) => ({
    id: c.id,
    period: new Uint16Array(frameCount),
    volume: new Uint8Array(frameCount),
    duty: new Uint8Array(frameCount),
    pan: new Uint8Array(frameCount).fill(3),
  }));
  const channelById = new Map(
    profile.channels.map((def, i) => [def.id, { def, frames: channels[i], owner: null as string | null }]),
  );

  const [beatsPerBar, beatUnit] = song.timeSignature;
  const barTicks = beatsPerBar * (4 / beatUnit) * song.ppq;
  const barStarts: number[] = [];
  for (let tick = 0; tick < endTick || barStarts.length === 0; tick += barTicks) {
    barStarts.push(Math.round(tickToSec(tick) * FPS));
  }

  const active = project.tracks.filter((t) => !t.mute && t.slots.length > 0);
  const soloed = active.filter((t) => t.solo);
  const played = soloed.length > 0 ? soloed : active;

  for (const arr of played) {
    const src = song.tracks[arr.sourceIndex];
    if (!src) continue;
    if (src.isDrums) continue; // GM drum map lands in M3

    const slot = channelById.get(arr.slots[0]);
    if (!slot) continue;
    if (slot.owner !== null) {
      warnings.push({
        trackId: arr.id,
        message: `${slot.def.label} already in use by another track; this track overwrites it`,
      });
    }
    slot.owner = arr.id;

    const inst = resolveInstrument(arr, slot.def, warnings);
    const polyMode: "top" | "bottom" = arr.polyMode === "bottom" ? "bottom" : "top"; // arp/split → M3

    const shift = project.transpose + arr.transpose + arr.octaveShift * 12;
    const [lo, hi] = slot.def.midiRange;
    let clamped = 0;
    const events: FrameEvent[] = src.notes.map((n, seq) => {
      let midi = n.midi + shift;
      const before = midi;
      while (midi < lo) midi += 12;
      while (midi > hi) midi -= 12;
      if (midi !== before) clamped++;
      const on = Math.round(tickToSec(n.tick) * FPS);
      const off = Math.max(on + 1, Math.round(tickToSec(n.tick + n.durationTicks) * FPS));
      return { on, off, midi, seq };
    });
    if (clamped > 0) {
      warnings.push({
        trackId: arr.id,
        message: `${clamped} note${clamped === 1 ? "" : "s"} shifted by octaves to fit ${slot.def.label} range`,
      });
    }

    renderTrack(slot.frames, slot.def, inst, polyMode, events, arr.volume, frameCount);
  }

  return {
    script: { chip: profile.id, fps: 60, frameCount, channels, barStarts },
    warnings,
  };
}

function resolveInstrument(
  arr: TrackArrangement,
  def: ChannelDef,
  warnings: CompileWarning[],
): Instrument {
  const inst = getPreset(arr.instrumentId);
  if (inst.kinds.includes(def.kind)) return inst;
  const fallback = presetsForKind(def.kind)[0];
  if (!fallback) return inst;
  warnings.push({
    trackId: arr.id,
    message: `${inst.name} does not fit ${def.label}; using ${fallback.name}`,
  });
  return fallback;
}
