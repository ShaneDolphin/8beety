// Original 8-bit style wordmark, drawn from a pixel matrix (no font, no
// Nintendo trade dress — just era-appropriate chunky glyphs).
const GLYPHS: Record<string, string[]> = {
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
};

const WORD = "8BEETY";

function pixels(): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let ox = 0;
  for (const ch of WORD) {
    const glyph = GLYPHS[ch];
    glyph.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) {
        if (row[x] === "1") out.push({ x: ox + x, y });
      }
    });
    ox += glyph[0].length + 1;
  }
  return out;
}

const PIXELS = pixels();
const WIDTH = WORD.length * 6 - 1;

export default function PixelLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${WIDTH + 1} 8`}
      className={className}
      role="img"
      aria-label="8BEETY"
      shapeRendering="crispEdges"
    >
      {PIXELS.map((p, i) => (
        <rect key={`s${i}`} x={p.x + 1} y={p.y + 1} width={1} height={1} fill="#065f46" />
      ))}
      {PIXELS.map((p, i) => (
        <rect key={i} x={p.x} y={p.y} width={1} height={1} fill={p.y < 4 ? "#34d399" : "#10b981"} />
      ))}
    </svg>
  );
}
