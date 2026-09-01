import { describe, expect, it } from "vitest";
import { encodeWav } from "../src/audio/wav";

const str = (v: DataView, off: number, len: number) =>
  Array.from({ length: len }, (_, i) => String.fromCharCode(v.getUint8(off + i))).join("");

describe("encodeWav (16-bit PCM)", () => {
  it("writes a valid RIFF/WAVE header for mono 44.1k", () => {
    const buf = encodeWav([new Float32Array(100)], 44100);
    const v = new DataView(buf);
    expect(str(v, 0, 4)).toBe("RIFF");
    expect(str(v, 8, 4)).toBe("WAVE");
    expect(str(v, 12, 4)).toBe("fmt ");
    expect(v.getUint32(16, true)).toBe(16); // fmt chunk size
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(44100 * 2); // byte rate
    expect(v.getUint16(32, true)).toBe(2); // block align
    expect(v.getUint16(34, true)).toBe(16); // bits
    expect(str(v, 36, 4)).toBe("data");
    expect(v.getUint32(40, true)).toBe(200);
    expect(buf.byteLength).toBe(44 + 200);
    expect(v.getUint32(4, true)).toBe(36 + 200);
  });

  it("interleaves stereo samples", () => {
    const L = new Float32Array([0.5, -0.5]);
    const R = new Float32Array([1, -1]);
    const v = new DataView(encodeWav([L, R], 48000));
    expect(v.getUint16(22, true)).toBe(2);
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getInt16(44, true)).toBe(Math.round(0.5 * 0x7fff)); // L0
    expect(v.getInt16(46, true)).toBe(0x7fff); // R0
    expect(v.getInt16(48, true)).toBe(-0x8000 / 2); // L1
    expect(v.getInt16(50, true)).toBe(-0x8000); // R1
  });

  it("clips out-of-range samples", () => {
    const v = new DataView(encodeWav([new Float32Array([2, -2])], 44100));
    expect(v.getInt16(44, true)).toBe(0x7fff);
    expect(v.getInt16(46, true)).toBe(-0x8000);
  });
});
