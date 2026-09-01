import apuWorkletUrl from "./apu-worklet.ts?worker&url";
import type { FrameScript } from "../engine/frame-script";
import type { ApuMessage, ApuReport } from "./messages";

export class ApuPlayer {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  onFrame?: (frame: number) => void;
  onEnded?: () => void;

  async init(): Promise<void> {
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule(apuWorkletUrl);
    this.node = new AudioWorkletNode(this.ctx, "apu", { outputChannelCount: [1] });
    this.node.port.onmessage = (e: MessageEvent<ApuReport>) => {
      if (e.data.type === "frame") this.onFrame?.(e.data.frame);
      else if (e.data.type === "ended") this.onEnded?.();
    };
    this.node.connect(this.ctx.destination);
  }

  load(script: FrameScript): void {
    this.post({ type: "load", script });
  }

  async play(fromFrame?: number): Promise<void> {
    await this.ctx?.resume(); // must happen inside a user gesture
    this.post({ type: "play", fromFrame });
  }

  pause(): void {
    this.post({ type: "pause" });
  }

  seek(frame: number): void {
    this.post({ type: "seek", frame });
  }

  private post(msg: ApuMessage): void {
    this.node?.port.postMessage(msg);
  }
}
