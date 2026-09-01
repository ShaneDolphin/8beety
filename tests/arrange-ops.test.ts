import { describe, expect, it } from "vitest";
import { assignTrackToSlot, loopFrames } from "../src/engine/arrange-ops";
import type { FrameScript } from "../src/engine/frame-script";
import type { TrackArrangement } from "../src/engine/project";

function arr(id: string, slots: string[]): TrackArrangement {
  return {
    id,
    sourceIndex: 0,
    name: id,
    slots,
    instrumentId: "square-lead",
    polyMode: "top",
    arpFramesPerStep: 1,
    octaveShift: 0,
    transpose: 0,
    volume: 15,
    mute: false,
    solo: false,
  };
}

const slotsOf = (tracks: TrackArrangement[], id: string) => tracks.find((t) => t.id === id)!.slots;

describe("assignTrackToSlot (§7.4 swap-on-occupied)", () => {
  it("assigns an unassigned track to an empty slot", () => {
    const out = assignTrackToSlot([arr("a", [])], "a", "p1");
    expect(slotsOf(out, "a")).toEqual(["p1"]);
  });

  it("moving to a new slot frees the old one", () => {
    const out = assignTrackToSlot([arr("a", ["p2"])], "a", "p1");
    expect(slotsOf(out, "a")).toEqual(["p1"]);
  });

  it("swaps with the occupier", () => {
    const out = assignTrackToSlot([arr("a", ["p2"]), arr("b", ["p1"])], "a", "p1");
    expect(slotsOf(out, "a")).toEqual(["p1"]);
    expect(slotsOf(out, "b")).toEqual(["p2"]);
  });

  it("an unassigned track dropped on an occupied slot displaces the occupier", () => {
    const out = assignTrackToSlot([arr("a", []), arr("b", ["p1"])], "a", "p1");
    expect(slotsOf(out, "a")).toEqual(["p1"]);
    expect(slotsOf(out, "b")).toEqual([]);
  });

  it("a multi-slot occupier keeps its other slots and inherits the dropped track's old slot", () => {
    const out = assignTrackToSlot([arr("a", ["tri"]), arr("b", ["p1", "p2"])], "a", "p1");
    expect(slotsOf(out, "a")).toEqual(["p1"]);
    expect(slotsOf(out, "b")).toEqual(["p2", "tri"]);
  });

  it("dropping a track on a slot it already owns is a no-op reduction to that slot", () => {
    const out = assignTrackToSlot([arr("a", ["p1", "p2"])], "a", "p1");
    expect(slotsOf(out, "a")).toEqual(["p1"]);
  });

  it("unknown track id returns the input unchanged", () => {
    const input = [arr("a", ["p1"])];
    expect(assignTrackToSlot(input, "nope", "p2")).toBe(input);
  });
});

describe("loopFrames", () => {
  const script = {
    chip: "nes",
    fps: 60,
    frameCount: 500,
    channels: [],
    barStarts: [0, 120, 240, 360, 480],
  } as unknown as FrameScript;

  it("converts a bar range to frames", () => {
    expect(loopFrames(script, [1, 3])).toEqual([120, 360]);
  });

  it("clamps the end to frameCount when the range runs past the last bar", () => {
    expect(loopFrames(script, [3, 5])).toEqual([360, 500]);
  });

  it("clamps an out-of-range start to 0", () => {
    expect(loopFrames(script, [-1, 2] as [number, number])).toEqual([0, 240]);
  });
});
