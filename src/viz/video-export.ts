import type { FrameScript } from "../engine/frame-script";
import { drawGbFrame } from "./gb-render";
import { drawGbShell } from "./gb-shell";
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

  // The handheld shell is static; render it once offscreen, then each frame
  // blit it and draw the scrolling playthrough clipped into its screen. The
  // bezel carries the song title, so the in-screen header title is off.
  const shell = document.createElement("canvas");
  shell.width = W;
  shell.height = H;
  const shellCtx = shell.getContext("2d");
  if (!shellCtx) {
    canvas.remove();
    throw new Error("canvas unavailable");
  }
  const screen = drawGbShell(shellCtx, W, H, title);
  const drawFrame = (frame: number): void => {
    g.drawImage(shell, 0, 0);
    g.save();
    g.beginPath();
    g.rect(screen.x, screen.y, screen.w, screen.h);
    g.clip();
    g.translate(screen.x, screen.y);
    drawGbFrame(g, script, lanes, frame, screen.w, screen.h, title, { headerTitle: false });
    g.restore();
  };
  drawFrame(0);

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
  // pick VP9-in-MP4, which QuickTime plays as audio-only, and avc3 MP4s don't
  // decode in QuickTime/AVFoundation at all. Ask for avc1 H.264+AAC with a
  // level that covers 720x1280@30 (>= 3.1; 4.0 for headroom): requesting too
  // low a level forces a mid-recording SPS level change, which glitches
  // decoders that trust the initial out-of-band avcC header.
  const mime = [
    'video/mp4;codecs="avc1.42E028,mp4a.40.2"',
    'video/mp4;codecs="avc1.4D4028,mp4a.40.2"',
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

  // Hidden tabs clamp main-thread timers to >=1s (Chromium throttling), which
  // starves requestFrame and freezes the video while audio keeps recording.
  // Dedicated-worker timers are exempt, so the tick source lives in a worker.
  let stopTicks: () => void;
  let onTick: () => void = () => undefined;
  try {
    const url = URL.createObjectURL(
      new Blob(["setInterval(() => postMessage(0), 33);"], { type: "text/javascript" }),
    );
    const worker = new Worker(url);
    URL.revokeObjectURL(url);
    worker.onmessage = () => onTick();
    stopTicks = () => worker.terminate();
  } catch {
    const iv = setInterval(() => onTick(), 33);
    stopTicks = () => clearInterval(iv);
  }

  // Display sleep suspends everything mid-render; hold a screen wake lock for
  // the duration (best effort — it can be denied or lost, and that's fine).
  let wakeLock: { release(): Promise<void> } | undefined;
  try {
    wakeLock = await navigator.wakeLock?.request("screen");
  } catch {
    // unsupported or denied
  }

  rec.start();
  const startAt = actx.currentTime;
  source.start();
  videoTrack.requestFrame?.();
  const durationSec = buffer.duration;
  const t0 = performance.now();
  try {
    await new Promise<void>((resolve) => {
      onTick = () => {
        // Clock the frames off the audio being recorded, not wall time, so
        // video stays locked to audio even when ticks jitter. Fall back to
        // wall time if the context never got to run.
        const t =
          actx.state === "running"
            ? actx.currentTime - startAt
            : (performance.now() - t0) / 1000;
        drawFrame(Math.min(t * 60, script.frameCount - 1));
        videoTrack.requestFrame?.();
        onProgress(Math.min(1, t / durationSec));
        if (t >= durationSec + 0.3) resolve();
      };
    });
    rec.stop();
    try {
      source.stop();
    } catch {
      // already ended
    }
    await stopped;
  } finally {
    stopTicks();
    void wakeLock?.release().catch(() => undefined);
    canvas.remove();
    void actx.close();
  }

  const type = rec.mimeType || mime || "video/webm";
  return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm" };
}
