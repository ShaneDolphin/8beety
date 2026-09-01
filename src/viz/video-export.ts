import type { FrameScript } from "../engine/frame-script";
import { drawGbFrame } from "./gb-render";
import type { Lane } from "./lanes";

// 9:16 Game Boy View video: the offline-rendered song audio plays into a
// MediaStreamDestination while the visualization draws to a captured canvas;
// MediaRecorder muxes both. Recording runs at real time (song length) —
// dependency-free and works everywhere; a faster WebCodecs path can come later.
export async function exportGbVideo(
  script: FrameScript,
  lanes: Lane[],
  title: string,
  audio: Float32Array[],
  sampleRate: number,
  onProgress: (fraction: number) => void,
): Promise<{ blob: Blob; ext: string }> {
  const W = 720;
  const H = 1280;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  // Keep the canvas on screen while recording: detached canvases may never
  // paint (starving captureStream), and users get a live preview for free.
  canvas.style.cssText =
    "position:fixed;right:12px;bottom:12px;width:135px;height:240px;z-index:50;" +
    "border:2px solid #306230;border-radius:8px;background:#0f380f";
  document.body.appendChild(canvas);
  const g = canvas.getContext("2d");
  if (!g) {
    canvas.remove();
    throw new Error("canvas unavailable");
  }
  drawGbFrame(g, script, lanes, 0, W, H, title);

  const actx = new AudioContext();
  // resume() stays pending without user activation; never let it block the
  // export (a real user's click resolves it instantly).
  await Promise.race([
    actx.resume().catch(() => undefined),
    new Promise((r) => setTimeout(r, 500)),
  ]);
  const buffer = actx.createBuffer(audio.length, audio[0].length, sampleRate);
  audio.forEach((ch, i) => buffer.getChannelData(i).set(ch));
  const dest = actx.createMediaStreamDestination();
  const source = actx.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);

  // captureStream(0) + explicit requestFrame per draw = deterministic frames
  // even when the tab isn't focused.
  const videoTrack = canvas.captureStream(0).getVideoTracks()[0] as MediaStreamTrack & {
    requestFrame?: () => void;
  };
  const stream = new MediaStream([videoTrack, ...dest.stream.getAudioTracks()]);
  // Codec order matters for compatibility: generic "video/mp4" lets Chrome
  // pick VP9-in-MP4, which QuickTime plays as audio-only. Ask for H.264+AAC
  // explicitly first; only then fall back.
  const mime = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4;codecs="avc1.4D401F,mp4a.40.2"',
    "video/mp4",
    'video/webm;codecs=vp9,opus',
    "video/webm",
  ].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, {
    ...(mime ? { mimeType: mime } : {}),
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    rec.onstop = () => resolve();
  });

  rec.start();
  source.start();
  videoTrack.requestFrame?.();
  const durationSec = buffer.duration;
  const t0 = performance.now();
  try {
    await new Promise<void>((resolve) => {
      const iv = setInterval(() => {
        const t = (performance.now() - t0) / 1000;
        drawGbFrame(g, script, lanes, Math.min(t * 60, script.frameCount - 1), W, H, title);
        videoTrack.requestFrame?.();
        onProgress(Math.min(1, t / durationSec));
        if (t >= durationSec + 0.3) {
          clearInterval(iv);
          resolve();
        }
      }, 33);
    });
    rec.stop();
    try {
      source.stop();
    } catch {
      // already ended
    }
    await stopped;
  } finally {
    canvas.remove();
    void actx.close();
  }

  const type = rec.mimeType || mime || "video/webm";
  return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm" };
}
