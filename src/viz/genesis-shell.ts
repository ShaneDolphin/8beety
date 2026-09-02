// Genesis/Mega Drive-style console shell for the video export. Logo-free
// homage: no Sega branding — the ridge rings and cartridge stand in for the
// console's silhouette. The song title lives on the cart label.
import type { Rect } from "./gb-shell";

export const GENESIS_VIEW = ["#04101e", "#0f3a66", "#2c7fbf", "#7fe3ff"] as const;

export interface GenesisLayout {
  scale: number;
  screen: Rect;
  body: Rect;
  cart: Rect;
  cartLabel: Rect;
  controller: Rect;
  rings: { cx: number; cy: number; r: number };
}

const BOX_W = 720;
const BOX_H = 1280;

export function computeGenesisLayout(w: number, h: number): GenesisLayout {
  const s = Math.min(w / BOX_W, h / BOX_H);
  const ox = (w - BOX_W * s) / 2;
  const oy = (h - BOX_H * s) / 2;
  const r = (x: number, y: number, rw: number, rh: number): Rect => ({
    x: ox + x * s, y: oy + y * s, w: rw * s, h: rh * s,
  });
  return {
    scale: s,
    screen: r(24, 24, 672, 792),
    body: r(60, 950, 600, 180),
    cart: r(290, 840, 180, 130),
    cartLabel: r(306, 858, 148, 70),
    controller: r(360, 1080, 280, 110),
    rings: { cx: ox + 380 * s, cy: oy + 1000 * s, r: 95 * s },
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

/** Draws the full Genesis-style shell and returns the screen rect to render the playthrough into. */
export function drawGenesisShell(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
): Rect {
  const l = computeGenesisLayout(w, h);
  const s = l.scale;
  const ox = (w - BOX_W * s) / 2;
  const oy = (h - BOX_H * s) / 2;
  const font = (px: number, bold = false): string =>
    `${bold ? "bold " : ""}${Math.round(px * s)}px Quantico, monospace`;

  // 1. Backdrop + floor shadow.
  g.fillStyle = "#0a0a0c";
  g.fillRect(0, 0, w, h);
  g.save();
  g.globalAlpha = 0.4;
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(ox + 360 * s, oy + 1150 * s, 310 * s, 26 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // 2. Panel frame behind the playthrough.
  const sc = l.screen;
  roundedRect(g, sc.x - 6 * s, sc.y - 6 * s, sc.w + 12 * s, sc.h + 12 * s, 10 * s);
  g.fillStyle = "#0f3a66";
  g.fill();
  roundedRect(g, sc.x - 2 * s, sc.y - 2 * s, sc.w + 4 * s, sc.h + 4 * s, 8 * s);
  g.fillStyle = "#04101e";
  g.fill();

  // 3. Body (drawn before the rings so the rings clip to it).
  const body = l.body;
  roundedRect(g, body.x, body.y, body.w, body.h, 14 * s);
  g.fillStyle = "#232326";
  g.fill();
  g.lineWidth = 3 * s;
  g.strokeStyle = "#101012";
  g.stroke();

  // Top stripe.
  g.fillStyle = "#17171a";
  g.fillRect(body.x, body.y, body.w, 60 * s);

  // 4. Ridge rings, clipped to the body.
  g.save();
  roundedRect(g, body.x, body.y, body.w, body.h, 14 * s);
  g.clip();
  g.lineWidth = 3 * s;
  g.strokeStyle = "#2f2f33";
  const { cx, cy, r: ringR } = l.rings;
  for (const rad of [ringR, ringR - 17 * s, ringR - 34 * s, ringR - 51 * s]) {
    g.beginPath();
    g.arc(cx, cy, rad, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();

  // 5. Cartridge + label, drawn after the rings so it stands in front.
  const cart = l.cart;
  roundedRect(g, cart.x, cart.y, cart.w, cart.h, 8 * s);
  g.fillStyle = "#1d1d20";
  g.fill();
  g.lineWidth = 2 * s;
  g.strokeStyle = "#2f2f33";
  g.stroke();

  const label = l.cartLabel;
  g.fillStyle = "#d9d4c8";
  g.fillRect(label.x, label.y, label.w, label.h);
  g.lineWidth = 2 * s;
  g.strokeStyle = "#c9a227";
  g.strokeRect(label.x, label.y, label.w, label.h);

  const clean = title.replace(/\.midi?$/i, "").toUpperCase();
  let size = 24;
  g.font = font(size, true);
  while (size > 10 && g.measureText(clean).width > label.w - 14 * s) {
    size -= 2;
    g.font = font(size, true);
  }
  g.fillStyle = "#17171a";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(clean, label.x + label.w / 2, label.y + label.h / 2);

  // 6. Deck details: volume slider, buttons, LED.
  g.fillStyle = "#0f0f11";
  roundedRect(g, ox + 100 * s, oy + 965 * s, 10 * s, 44 * s, 5 * s);
  g.fill();
  g.fillStyle = "#3a3a3f";
  roundedRect(g, ox + 97 * s, oy + 975 * s, 16 * s, 12 * s, 3 * s);
  g.fill();

  roundedRect(g, ox + 150 * s, oy + 1042 * s, 34 * s, 14 * s, 4 * s);
  g.fill();
  roundedRect(g, ox + 196 * s, oy + 1042 * s, 34 * s, 14 * s, 4 * s);
  g.fill();

  g.fillStyle = "#d0342c";
  g.beginPath();
  g.arc(ox + 128 * s, oy + 1048 * s, 5 * s, 0, Math.PI * 2);
  g.fill();

  // 7. Gold medallion.
  g.lineWidth = 4 * s;
  g.strokeStyle = "#c9a227";
  g.beginPath();
  g.arc(ox + 580 * s, oy + 985 * s, 30 * s, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "#c9a227";
  g.font = font(13, true);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText("16-BIT", ox + 580 * s, oy + 985 * s);

  // 8. Controller.
  const ctl = l.controller;
  roundedRect(g, ctl.x, ctl.y, ctl.w, ctl.h, 46 * s);
  g.fillStyle = "#1d1d20";
  g.fill();
  g.lineWidth = 2 * s;
  g.strokeStyle = "#2f2f33";
  g.stroke();

  // D-pad base and cross.
  const dpx = ox + 430 * s;
  const dpy = oy + 1135 * s;
  g.fillStyle = "#2a2a2e";
  g.beginPath();
  g.arc(dpx, dpy, 42 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = "#0f0f11";
  g.fillRect(dpx - 30 * s, dpy - 10 * s, 60 * s, 20 * s);
  g.fillRect(dpx - 10 * s, dpy - 30 * s, 20 * s, 60 * s);

  // Three face buttons with letters.
  const buttons: Array<[number, number, string]> = [
    [545, 1150, "A"],
    [585, 1145, "B"],
    [625, 1150, "C"],
  ];
  for (const [bx, by, letter] of buttons) {
    const cxp = ox + bx * s;
    const cyp = oy + by * s;
    g.fillStyle = "#3a3a3f";
    g.beginPath();
    g.arc(cxp, cyp, 15 * s, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2 * s;
    g.strokeStyle = "#17171a";
    g.stroke();
    g.fillStyle = "#6a6a70";
    g.font = font(11, true);
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(letter, cxp, cyp + 24 * s);
  }

  // 9. Reset text state.
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  return l.screen;
}
