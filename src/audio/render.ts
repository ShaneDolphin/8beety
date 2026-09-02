import apuWorkletUrl from "./apu-worklet.ts?worker&url";
import { profileFor } from "../engine/chip-profiles";
import type { FrameScript } from "../engine/frame-script";
import type { ApuMessage, ApuReport } from "./messages";

// Every stereo-capable chip profile (gb, sega, snes) renders two channels;
// mono chips (nes) render one. Pulled out so the decision is unit-testable
// without needing a real OfflineAudioContext.
export function channelCountForChip(chip: FrameScript["chip"]): 1 | 2 {
  return profileFor(chip).stereo ? 2 : 1;
}

// §9.3: offline render through the exact same worklet as realtime playback.
// The "loaded" ack matters: port messages posted right before startRendering
// can otherwise miss the rendering thread and produce silence.
export async function renderScript(
  script: FrameScript,
  sampleRate: 44100 | 48000,
  opts?: { loopTwiceFade?: boolean },
): Promise<Float32Array[]> {
  const loopTwiceFade = opts?.loopTwiceFade ?? false;
  const seconds = script.frameCount / 60;
  const totalSamples = Math.ceil(seconds * (loopTwiceFade ? 2 : 1) * sampleRate);
  const channelCount = channelCountForChip(script.chip);

  const ctx = new OfflineAudioContext(channelCount, totalSamples, sampleRate);
  await ctx.audioWorklet.addModule(apuWorkletUrl);
  const node = new AudioWorkletNode(ctx, "apu", { outputChannelCount: [channelCount] });
  node.connect(ctx.destination);

  const loaded = new Promise<void>((resolve) => {
    node.port.onmessage = (e: MessageEvent<ApuReport>) => {
      if (e.data.type === "loaded") resolve();
    };
  });
  const post = (msg: ApuMessage) => node.port.postMessage(msg);
  post({ type: "load", script });
  if (loopTwiceFade) post({ type: "setLoop", loop: [0, script.frameCount] });
  post({ type: "play" });
  await Promise.race([loaded, new Promise((r) => setTimeout(r, 1500))]);

  const buf = await ctx.startRendering();
  const out = Array.from({ length: channelCount }, (_, c) => buf.getChannelData(c).slice());

  if (loopTwiceFade) {
    const fadeSamples = Math.min(3 * sampleRate, totalSamples);
    for (const chan of out) {
      for (let i = 0; i < fadeSamples; i++) {
        chan[totalSamples - fadeSamples + i] *= 1 - i / fadeSamples;
      }
    }
  }
  return out;
}
