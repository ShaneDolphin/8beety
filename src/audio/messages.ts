import type { FrameScript } from "../engine/frame-script";

export type ApuMessage =
  | { type: "load"; script: FrameScript }
  | { type: "play"; fromFrame?: number }
  | { type: "pause" }
  | { type: "seek"; frame: number }
  | { type: "setLoop"; loop: [number, number] | null }
  | { type: "hotSwap"; script: FrameScript };

export type ApuReport =
  | { type: "frame"; frame: number }
  | { type: "ended" }
  | { type: "loaded" }; // ack for the offline renderer's handshake
