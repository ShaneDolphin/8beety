// SNES-style console for the video export. Logo-free homage: no Nintendo
// branding; action buttons are four purple shades, not the four-color
// Super Famicom diamond (trade dress). The song title lives on the cart label.
import type { Rect } from "./gb-shell";

export const SNES_VIEW = ["#1a1333", "#463a78", "#8578c8", "#d8d2f2"] as const;

export interface SnesLayout {
  scale: number;
  screen: Rect;
  body: Rect;
  deck: Rect;
  cart: Rect;
  cartLabel: Rect;
  controller: Rect;
}

const BOX_W = 720;
const BOX_H = 1280;

export function computeSnesLayout(w: number, h: number): SnesLayout {
  const s = Math.min(w / BOX_W, h / BOX_H);
  const ox = (w - BOX_W * s) / 2;
  const oy = (h - BOX_H * s) / 2;
  const r = (x: number, y: number, rw: number, rh: number): Rect => ({
    x: ox + x * s, y: oy + y * s, w: rw * s, h: rh * s,
  });
  return {
    scale: s,
    screen: r(24, 24, 672, 792),
    body: r(70, 940, 580, 210),
    deck: r(70, 940, 580, 70),
    cart: r(250, 830, 220, 118),
    cartLabel: r(266, 848, 188, 64),
    controller: r(380, 1090, 260, 110),
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

/** Draws the full SNES-style shell and returns the screen rect to render the playthrough into. */
export function drawSnesShell(
  g: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
): Rect {
  const l = computeSnesLayout(w, h);
  const s = l.scale;
  const ox = (w - BOX_W * s) / 2;
  const oy = (h - BOX_H * s) / 2;
  const font = (px: number, bold = false): string =>
    `${bold ? "bold " : ""}${Math.round(px * s)}px Quantico, monospace`;

  // 1. Backdrop + floor shadow.
  g.fillStyle = "#141019";
  g.fillRect(0, 0, w, h);
  g.save();
  g.globalAlpha = 0.35;
  g.fillStyle = "#000";
  g.beginPath();
  g.ellipse(360 * s + ox, 1165 * s + oy, 300 * s, 28 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();

  // 2. Panel frame behind the playthrough.
  const sc = l.screen;
  roundedRect(g, sc.x - 6 * s, sc.y - 6 * s, sc.w + 12 * s, sc.h + 12 * s, 10 * s);
  g.fillStyle = "#463a78";
  g.fill();
  roundedRect(g, sc.x - 2 * s, sc.y - 2 * s, sc.w + 4 * s, sc.h + 4 * s, 8 * s);
  g.fillStyle = "#1a1333";
  g.fill();

  // 3. Cartridge.
  const cart = l.cart;
  roundedRect(g, cart.x, cart.y, cart.w, cart.h, [10 * s, 10 * s, 0, 0]);
  g.fillStyle = "#8f8b99";
  g.fill();
  // Darker side notches.
  g.fillStyle = "#77737f";
  g.fillRect(cart.x + 16 * s, cart.y, 12 * s, cart.h);
  g.fillRect(cart.x + cart.w - 16 * s - 12 * s, cart.y, 12 * s, cart.h);

  const label = l.cartLabel;
  g.fillStyle = "#e8e4f0";
  g.fillRect(label.x, label.y, label.w, label.h);
  g.lineWidth = 2 * s;
  g.strokeStyle = "#6f5fb0";
  g.strokeRect(label.x, label.y, label.w, label.h);

  const clean = title.replace(/\.midi?$/i, "").toUpperCase();
  let size = 26;
  g.font = font(size, true);
  while (size > 10 && g.measureText(clean).width > label.w - 16 * s) {
    size -= 2;
    g.font = font(size, true);
  }
  g.fillStyle = "#2a2830";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(clean, label.x + label.w / 2, label.y + label.h / 2);

  // 4. Body.
  const body = l.body;
  roundedRect(g, body.x, body.y, body.w, body.h, 18 * s);
  g.fillStyle = "#b6b2bc";
  g.fill();
  g.lineWidth = 3 * s;
  g.strokeStyle = "#8f8b99";
  g.stroke();

  const deck = l.deck;
  roundedRect(g, deck.x, deck.y, deck.w, deck.h, [18 * s, 18 * s, 0, 0]);
  g.fillStyle = "#a5a1ad";
  g.fill();

  // Slot: centered dark bar (cart covers its middle).
  g.fillStyle = "#2a2830";
  g.fillRect(ox + 360 * s - 90 * s, oy + 948 * s, 180 * s, 16 * s);

  // 5. Purple accents on the deck.
  g.fillStyle = "#6f5fb0";
  roundedRect(g, ox + 110 * s, oy + 952 * s, 24 * s, 36 * s, 6 * s);
  g.fill();
  roundedRect(g, ox + 146 * s, oy + 952 * s, 24 * s, 36 * s, 6 * s);
  g.fill();
  roundedRect(g, ox + 470 * s, oy + 955 * s, 60 * s, 26 * s, 13 * s);
  g.fill();

  // 6. Front face details.
  g.fillStyle = "#55525d";
  roundedRect(g, ox + 120 * s, oy + 1060 * s, 36 * s, 28 * s, 6 * s);
  g.fill();
  roundedRect(g, ox + 180 * s, oy + 1060 * s, 36 * s, 28 * s, 6 * s);
  g.fill();
  g.fillStyle = "#d0342c";
  g.beginPath();
  g.arc(ox + 620 * s, oy + 1035 * s, 6 * s, 0, Math.PI * 2);
  g.fill();

  // 7. Controller.
  const ctl = l.controller;
  roundedRect(g, ctl.x, ctl.y, ctl.w, ctl.h, 40 * s);
  g.fillStyle = "#d8d5de";
  g.fill();
  g.lineWidth = 2 * s;
  g.strokeStyle = "#a5a1ad";
  g.stroke();

  // D-pad cross.
  const dpx = ox + 430 * s;
  const dpy = oy + 1140 * s;
  g.fillStyle = "#3a3844";
  roundedRect(g, dpx - 32 * s, dpy - 11 * s, 64 * s, 22 * s, 5 * s);
  g.fill();
  roundedRect(g, dpx - 11 * s, dpy - 32 * s, 22 * s, 64 * s, 5 * s);
  g.fill();

  // Four action buttons in a diamond centered (580, 1140), offset 26.
  const bcx = ox + 580 * s;
  const bcy = oy + 1140 * s;
  const off = 26 * s;
  const br = 13 * s;
  const buttons: Array<[number, number, string]> = [
    [bcx, bcy - off, "#8b7fc4"], // top
    [bcx + off, bcy, "#6f5fb0"], // right
    [bcx, bcy + off, "#4f4386"], // bottom
    [bcx - off, bcy, "#5a4d9e"], // left
  ];
  for (const [bx, by, color] of buttons) {
    g.fillStyle = color;
    g.beginPath();
    g.arc(bx, by, br, 0, Math.PI * 2);
    g.fill();
  }

  // Two center pills, rotated -25 deg.
  g.fillStyle = "#8f8b99";
  for (const py of [1136, 1152]) {
    g.save();
    g.translate(ox + 492 * s, oy + py * s);
    g.rotate((-25 * Math.PI) / 180);
    roundedRect(g, -13 * s, -4.5 * s, 26 * s, 9 * s, 4 * s);
    g.fill();
    g.restore();
  }

  // 8. Reset text state.
  g.textAlign = "left";
  g.textBaseline = "alphabetic";
  return l.screen;
}
