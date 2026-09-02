import { describe, expect, it } from "vitest";
import { gbPulsePeriod, midiToFreq, nesPulseTimer, spcPitch, ymPack } from "../src/engine/pitch";
import { noteName } from "../src/viz/gb-render";

// Live note-name readout must use the right chip's frequency formula.
// nes/gb formulas are covered indirectly by existing gb-render usage; this
// pins the sega/snes branches added when those chips became reachable.
describe("noteName", () => {
  it("reads sega FM periods through the YM2612 fnum/block formula", () => {
    const packed = ymPack(midiToFreq(69)); // A4
    expect(packed).not.toBeNull();
    expect(noteName("sega", 0, packed as number)).toBe("A4");
  });

  it("reads snes voice periods through the SPC700 pitch formula", () => {
    const pitch = spcPitch(261.6256); // C4, the SPC base rate
    expect(pitch).not.toBeNull();
    expect(noteName("snes", 0, pitch as number)).toBe("C4");
  });

  it("leaves nes/gb formulas untouched", () => {
    const nesTimer = nesPulseTimer(440);
    expect(nesTimer).not.toBeNull();
    expect(noteName("nes", 0, nesTimer as number)).toBe("A4");

    const gbPeriod = gbPulsePeriod(440);
    expect(gbPeriod).not.toBeNull();
    expect(noteName("gb", 0, gbPeriod as number)).toBe("A4");
  });
});
