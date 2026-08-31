export type ChannelFrames = {
  id: string;
  // Parallel typed arrays, one entry per frame, so the whole script can be
  // transferred to the worklet in one postMessage.
  period: Uint16Array; // timer/period register value; 0 = off
  volume: Uint8Array; // 0–15
  duty: Uint8Array; // duty index (pulse) / mode bit (noise)
  pan: Uint8Array; // 0 off, 1 L, 2 R, 3 both (gb only); nes always 3
};

export type FrameScript = {
  chip: "nes" | "gb" | "nes-vrc6";
  fps: 60;
  frameCount: number;
  channels: ChannelFrames[]; // one per channel in the chip profile, in order
  barStarts: number[]; // frame index of each bar, for the playhead and loop UI
};
