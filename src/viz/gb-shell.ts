// Hand-drawn DMG-style handheld shell for the 9:16 video export. Homage only:
// no Nintendo/Game Boy logos, wordmarks, or slogans anywhere (SPEC §10.3) —
// the bezel carries the project title instead.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RoundButton {
  cx: number;
  cy: number;
  r: number;
}

interface PillButton {
  cx: number;
  cy: number;
  w: number;
  h: number;
  angle: number; // radians
}

export interface ShellLayout {
  scale: number;
  housing: Rect;
  bezel: Rect;
  screen: Rect;
  dpad: { cx: number; cy: number; size: number; arm: number };
  buttonA: RoundButton;
  buttonB: RoundButton;
  select: PillButton;
  start: PillButton;
  speaker: { cx: number; cy: number };
}

// All geometry is authored in a 720x1280 design box and scaled to fit,
// centered, so the layout is purely proportional at any canvas size.
const BOX_W = 720;
const BOX_H = 1280;
const TILT = -Math.PI / 8; // select/start & A-B pill angle

export function computeShellLayout(w: number, h: number): ShellLayout {
  const s = Math.min(w / BOX_W, h / BOX_H);
  const ox = (w - BOX_W * s) / 2;
  const oy = (h - BOX_H * s) / 2;
  const r = (x: number, y: number, rw: number, rh: number): Rect => ({
    x: ox + x * s,
    y: oy + y * s,
    w: rw * s,
    h: rh * s,
  });

  const screenH = 480;
  const screenW = (screenH * 160) / 144;
  return {
    scale: s,
    housing: r(16, 40, 688, 1200),
    bezel: r(52, 70, 616, 586),
    screen: r(360 - screenW / 2, 118, screenW, screenH),
    dpad: { cx: ox + 180 * s, cy: oy + 830 * s, size: 210 * s, arm: 72 * s },
    buttonA: { cx: ox + 588 * s, cy: oy + 782 * s, r: 46 * s },
    buttonB: { cx: ox + 466 * s, cy: oy + 838 * s, r: 46 * s },
    select: { cx: ox + 300 * s, cy: oy + 1010 * s, w: 92 * s, h: 30 * s, angle: TILT },
    start: { cx: ox + 424 * s, cy: oy + 1010 * s, w: 92 * s, h: 30 * s, angle: TILT },
    speaker: { cx: ox + 575 * s, cy: oy + 1130 * s },
  };
}

function roundedRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radii: number | [number, number, number, number], // tl, tr, br, bl
): void {
  const [tl, tr, br, bl] = typeof radii === "number" ? [radii, radii, radii, radii] : radii;
  g.beginPath();
  g.moveTo(x + tl, y);
  g.arcTo(x + w, y, x + w, y + h, tr);
  g.arcTo(x + w, y + h, x, y + h, br);
  g.arcTo(x, y + h, x, y, bl);
  g.arcTo(x, y, x + w, y, tl);
  g.closePath();
}

function pill(g: CanvasRenderingContext2D, p: PillButton, grow = 0): void {
  g.save();
  g.translate(p.cx, p.cy);
  g.rotate(p.angle);
  roundedRect(g, -p.w / 2 - grow, -p.h / 2 - grow, p.w + grow * 2, p.h + grow * 2, (p.h + grow * 2) / 2);
  g.restore();
}

/** Draws the full shell and returns the screen rect to render the playthrough into. */
export function drawGbShell(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
): Rect {
  const l = computeShellLayout(w, h);
  const s = l.scale;
  const font = (px: number, bold = false): string =>
    `${bold ? "bold " : ""}${Math.round(px * s)}px Quantico, monospace`;

  // Backdrop.
  g.fillStyle = "#17171a";
  g.fillRect(0, 0, w, h);

  // Housing: warm gray, small corners on top, the signature big bottom-right.
  const hs = l.housing;
  roundedRect(g, hs.x, hs.y, hs.w, hs.h, [14 * s, 14 * s, 110 * s, 14 * s]);
  g.fillStyle = "#c5c1ba";
  g.fill();
  g.lineWidth = 3 * s;
  g.strokeStyle = "#8f8b84";
  g.stroke();
  // Top seam line.
  g.fillStyle = "#a9a59e";
  g.fillRect(hs.x + 10 * s, hs.y + 14 * s, hs.w - 20 * s, 2 * s);

  // Bezel panel.
  const bz = l.bezel;
  roundedRect(g, bz.x, bz.y, bz.w, bz.h, [16 * s, 16 * s, 60 * s, 16 * s]);
  g.fillStyle = "#2e2f38";
  g.fill();

  // Accent stripes with a centered caption gap.
  const caption = "4-CHANNEL STEREO SOUND";
  g.font = font(13, true);
  g.textAlign = "center";
  g.textBaseline = "middle";
  const capW = g.measureText(caption).width + 24 * s;
  const stripeY = [bz.y + 20 * s, bz.y + 32 * s];
  const stripeX0 = bz.x + 20 * s;
  const stripeX1 = bz.x + bz.w - 20 * s;
  const midX = bz.x + bz.w / 2;
  for (let i = 0; i < 2; i++) {
    g.fillStyle = i === 0 ? "#7a2653" : "#23306e";
    g.fillRect(stripeX0, stripeY[i], midX - capW / 2 - stripeX0, 6 * s);
    g.fillRect(midX + capW / 2, stripeY[i], stripeX1 - midX - capW / 2, 6 * s);
  }
  g.fillStyle = "#b9b6c4";
  g.fillText(caption, midX, (stripeY[0] + stripeY[1]) / 2 + 3 * s);

  // Battery LED left of the screen.
  g.fillStyle = "#d0342c";
  g.beginPath();
  g.arc(bz.x + 22 * s, l.screen.y + 30 * s, 6 * s, 0, Math.PI * 2);
  g.fill();

  // Screen well (content is drawn by the caller into l.screen).
  const sc = l.screen;
  g.fillStyle = "#0f380f";
  g.fillRect(sc.x - 4 * s, sc.y - 4 * s, sc.w + 8 * s, sc.h + 8 * s);
  g.strokeStyle = "#191922";
  g.lineWidth = 4 * s;
  g.strokeRect(sc.x - 4 * s, sc.y - 4 * s, sc.w + 8 * s, sc.h + 8 * s);

  // Project title on the bottom band of the bezel.
  const clean = title.replace(/\.midi?$/i, "").toUpperCase();
  let size = 30;
  g.font = font(size, true);
  while (size > 14 && g.measureText(clean).width > bz.w - 80 * s) {
    size -= 2;
    g.font = font(size, true);
  }
  g.fillStyle = "#cfccd8";
  g.fillText(clean, midX, sc.y + sc.h + (bz.y + bz.h - sc.y - sc.h) / 2 + 2 * s);

  // D-pad on a subtle round depression.
  const dp = l.dpad;
  g.fillStyle = "#b7b3ac";
  g.beginPath();
  g.arc(dp.cx, dp.cy, dp.size * 0.62, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#26262b";
  roundedRect(g, dp.cx - dp.arm / 2, dp.cy - dp.size / 2, dp.arm, dp.size, 8 * s);
  g.fill();
  roundedRect(g, dp.cx - dp.size / 2, dp.cy - dp.arm / 2, dp.size, dp.arm, 8 * s);
  g.fill();
  g.fillStyle = "#1d1d21";
  g.beginPath();
  g.arc(dp.cx, dp.cy, 26 * s, 0, Math.PI * 2);
  g.fill();

  // A/B buttons on a tilted recessed pill.
  const midAB: PillButton = {
    cx: (l.buttonA.cx + l.buttonB.cx) / 2,
    cy: (l.buttonA.cy + l.buttonB.cy) / 2,
    w: 250 * s,
    h: 116 * s,
    angle: TILT,
  };
  g.fillStyle = "#b7b3ac";
  pill(g, midAB);
  g.fill();
  for (const [b, label] of [
    [l.buttonA, "A"],
    [l.buttonB, "B"],
  ] as const) {
    g.fillStyle = "#93275c";
    g.beginPath();
    g.arc(b.cx, b.cy, b.r, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "#6e1c44";
    g.lineWidth = 3 * s;
    g.stroke();
    g.fillStyle = "#23306e";
    g.font = font(24, true);
    g.fillText(label, b.cx + b.r * 0.9, b.cy + b.r * 1.5);
  }

  // Select / Start pills with tilted printed labels.
  for (const [p, label] of [
    [l.select, "SELECT"],
    [l.start, "START"],
  ] as const) {
    g.fillStyle = "#b7b3ac";
    pill(g, p, 8 * s);
    g.fill();
    g.fillStyle = "#4a4a52";
    pill(g, p);
    g.fill();
    g.save();
    g.translate(p.cx, p.cy + 42 * s);
    g.rotate(p.angle);
    g.fillStyle = "#23306e";
    g.font = font(17, true);
    g.fillText(label, 0, 0);
    g.restore();
  }

  // Speaker grille: parallel diagonal slots, bottom right.
  g.save();
  g.translate(l.speaker.cx, l.speaker.cy);
  g.rotate(-Math.PI / 3);
  g.fillStyle = "#55524d";
  for (let i = -3; i <= 2; i++) {
    roundedRect(g, -46 * s, i * 26 * s, 92 * s, 13 * s, 7 * s);
    g.fill();
  }
  g.restore();

  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  return l.screen;
}
