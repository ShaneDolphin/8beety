import type { ChannelFrames, FrameScript } from "../engine/frame-script";
import {
  gbPulseFreq,
  gbWaveFreq,
  nesPulseFreq,
  nesTriangleFreq,
  spcFreq,
  ymFreq,
} from "../engine/pitch";
import { NOTE_NAMES } from "../theory/theory";
import type { Lane } from "./lanes";

// DMG green-screen palette, darkest → lightest. Original look; no hardware
// shell or Nintendo asset is drawn — just the four-shade vibe.
export const DMG = ["#0f380f", "#306230", "#8bac0f", "#9bbc0f"] as const;

const WINDOW_FRAMES = 240; // ~4 s of song visible
const PLAYHEAD_AT = 0.3; // playhead sits 30% in from the left

const rangeCache = new WeakMap<ChannelFrames, [number, number]>();

function periodRange(ch: ChannelFrames): [number, number] {
  const hit = rangeCache.get(ch);
  if (hit) return hit;
  let lo = Infinity;
  let hi = 0;
  for (let i = 0; i < ch.period.length; i++) {
    const p = ch.period[i];
    if (p > 0) {
      if (p < lo) lo = p;
      if (p > hi) hi = p;
    }
  }
  const range: [number, number] = lo === Infinity ? [0, 1] : [lo, hi];
  rangeCache.set(ch, range);
  return range;
}

// exported for testing only; not part of the module's public drawing API
export function noteName(chip: FrameScript["chip"], channelIndex: number, period: number): string {
  const freq =
    chip === "sega"
      ? ymFreq(period)
      : chip === "snes"
        ? spcFreq(period)
        : channelIndex === 2
          ? chip === "gb"
            ? gbWaveFreq(period)
            : nesTriangleFreq(period)
          : chip === "gb"
            ? gbPulseFreq(period)
            : nesPulseFreq(period);
  const midi = Math.round(69 + 12 * Math.log2(freq / 440));
  if (midi < 0 || midi > 127) return "";
  return NOTE_NAMES[((midi % 12) + 12) % 12] + String(Math.floor(midi / 12) - 1);
}

export function drawGbFrame(
  g: CanvasRenderingContext2D,
  script: FrameScript,
  lanes: Lane[],
  frame: number,
  w: number,
  h: number,
  title: string,
  opts?: { headerTitle?: boolean; palette?: readonly [string, string, string, string] },
): void {
  const [c0, c1, c2, c3] = opts?.palette ?? DMG;
  const px = Math.max(2, Math.floor(Math.min(w / 160, h / 160)));
  g.imageSmoothingEnabled = false;
  g.fillStyle = c0;
  g.fillRect(0, 0, w, h);
  g.textBaseline = "top";

  // Header: wordmark, song title, bar counter.
  g.fillStyle = c3;
  g.font = `bold ${px * 7}px Quantico, monospace`;
  g.fillText("8BEETY", px * 4, px * 3);
  if (opts?.headerTitle !== false) {
    g.fillStyle = c2;
    g.font = `${px * 4}px Quantico, monospace`;
    g.fillText(title.replace(/\.midi?$/i, "").slice(0, 32).toUpperCase(), px * 4, px * 11);
  }
  const bar = script.barStarts.filter((b) => b <= frame).length;
  g.textAlign = "right";
  g.font = `bold ${px * 5}px Quantico, monospace`;
  g.fillText(`BAR ${bar}`, w - px * 4, px * 3);
  g.textAlign = "left";

  // Lanes.
  const laneTop = px * 18;
  const laneGap = px * 2;
  const laneCount = Math.min(lanes.length, script.channels.length);
  const laneH = Math.floor((h - laneTop - px * 3 - laneGap * (laneCount - 1)) / laneCount);
  const smallText = laneCount > 4;
  const playheadX = Math.floor(w * PLAYHEAD_AT);
  const clampedFrame = Math.max(0, Math.min(script.frameCount - 1, Math.floor(frame)));

  for (let li = 0; li < laneCount; li++) {
    const ch = script.channels[li];
    const lane = lanes[li];
    if (!ch || !lane) continue;
    const top = laneTop + li * (laneH + laneGap);
    const active = ch.volume[clampedFrame] > 0;

    g.fillStyle = c1;
    g.globalAlpha = 0.35;
    g.fillRect(px * 2, top, w - px * 4, laneH);
    g.globalAlpha = 1;

    // Label + sub-label + live note readout.
    g.fillStyle = active ? c3 : c2;
    g.font = `bold ${px * (smallText ? 3 : 4)}px Quantico, monospace`;
    g.fillText(lane.label, px * 4, top + px * 2);
    if (lane.trackName) {
      g.fillStyle = c2;
      g.font = `${px * (smallText ? 2 : 3)}px Quantico, monospace`;
      g.fillText(lane.trackName.slice(0, 18).toUpperCase(), px * 4, top + px * 7);
    }
    if (active && lane.kind === "pitch") {
      g.fillStyle = c3;
      g.font = `bold ${px * (smallText ? 3 : 4)}px Quantico, monospace`;
      g.textAlign = "right";
      g.fillText(noteName(script.chip, li, ch.period[clampedFrame]), w - px * 4, top + px * 2);
      g.textAlign = "left";
    }

    // Scrolling note strip.
    const stripTop = smallText ? top + px * 8 : top + px * 12;
    const stripH = laneH - px * 14;
    if (stripH < px * 2) continue;
    const [lo, hi] = periodRange(ch);
    const span = Math.max(1, hi - lo);
    const block = px;
    for (let x = px * 2; x < w - px * 3; x += block) {
      const f = Math.floor(clampedFrame + ((x - playheadX) / w) * WINDOW_FRAMES);
      if (f < 0 || f >= script.frameCount) continue;
      if (ch.volume[f] === 0 || ch.period[f] === 0) continue;
      const near = Math.abs(x - playheadX) < block * 3;
      g.fillStyle = near ? c3 : f < clampedFrame ? c1 : c2;
      if (lane.kind === "drums") {
        const bh = Math.max(block, Math.round((ch.volume[f] / 15) * stripH));
        g.fillRect(x, stripTop + stripH - bh, block, bh);
      } else {
        const rowFrac = (ch.period[f] - lo) / span; // bigger period = lower pitch
        const y = stripTop + Math.round(rowFrac * (stripH - block * 2));
        g.fillRect(x, y, block, block * 2);
      }
    }

    if (active) {
      g.strokeStyle = c3;
      g.lineWidth = Math.max(1, px / 2);
      g.strokeRect(px * 2, top, w - px * 4, laneH);
    }
  }

  // Playhead.
  g.fillStyle = c3;
  g.fillRect(playheadX, laneTop - px, px, h - laneTop - px * 2);

  // Faint dot-matrix scanlines.
  g.globalAlpha = 0.07;
  g.fillStyle = "#000";
  for (let y = 0; y < h; y += px * 2) g.fillRect(0, y, w, 1);
  g.globalAlpha = 1;
}
