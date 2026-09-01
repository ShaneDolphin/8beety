import type { ChannelFrames, FrameScript } from "../frame-script";
import { midiToFreq, nesPulseTimer, nesTriangleTimer } from "../pitch";

// 120 BPM, 4/4: one beat = 30 frames, one bar = 120 frames, 4 bars = 480 frames.
const FRAME_COUNT = 480;

function emptyChannel(id: string): ChannelFrames {
  return {
    id,
    period: new Uint16Array(FRAME_COUNT),
    volume: new Uint8Array(FRAME_COUNT),
    duty: new Uint8Array(FRAME_COUNT),
    pan: new Uint8Array(FRAME_COUNT).fill(3),
  };
}

export function buildM1Fixture(): FrameScript {
  const p1 = emptyChannel("p1");
  const p2 = emptyChannel("p2");
  const tri = emptyChannel("tri");
  const noise = emptyChannel("noise");

  // Pulse 1: C4-E4-G4 arpeggio, one frame per step, 50% duty (index 2).
  const arp = [60, 64, 67].map((m) => nesPulseTimer(midiToFreq(m)) ?? 0);
  for (let f = 0; f < FRAME_COUNT; f++) {
    p1.period[f] = arp[f % 3];
    p1.volume[f] = 11;
    p1.duty[f] = 2;
  }

  // Triangle: C2 root, gated 24 frames on / 6 off each beat.
  const rootTimer = nesTriangleTimer(midiToFreq(36)) ?? 0;
  for (let f = 0; f < FRAME_COUNT; f++) {
    if (f % 30 < 24) {
      tri.period[f] = rootTimer;
      tri.volume[f] = 15;
    }
  }

  // Noise: closed hat on every 8th note (15 frames), fast decay, bright period.
  const hat = [8, 4, 1, 0];
  for (let start = 0; start < FRAME_COUNT; start += 15) {
    for (let i = 0; i < hat.length && start + i < FRAME_COUNT; i++) {
      noise.period[start + i] = 16;
      noise.volume[start + i] = hat[i];
      noise.duty[start + i] = 0; // long mode
    }
  }

  return {
    chip: "nes",
    fps: 60,
    frameCount: FRAME_COUNT,
    channels: [p1, p2, tri, noise],
    barStarts: [0, 120, 240, 360],
  };
}
