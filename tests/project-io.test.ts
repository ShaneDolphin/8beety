import { describe, expect, it } from "vitest";
import {
  decodeProjectFile,
  encodeProjectFile,
  type ProjectFile,
} from "../src/engine/project-io";
import { decodeShare, encodeShare } from "../src/engine/share";
import type { Project } from "../src/engine/project";

const project: Project = {
  version: 1,
  chip: "nes",
  bpm: 128,
  tempoMode: "flatten",
  transpose: 0,
  outputFilter: true,
  tracks: [
    {
      id: "track-0",
      sourceIndex: 0,
      name: "Melody",
      slots: ["p1"],
      instrumentId: "square-lead",
      polyMode: "top",
      arpFramesPerStep: 1,
      octaveShift: 0,
      transpose: 0,
      volume: 15,
      mute: false,
      solo: false,
      layerMode: "echo3",
      pan: 1,
    },
  ],
};

const midiBytes = new Uint8Array([77, 84, 104, 100, 0, 0, 0, 6]); // "MThd"...

describe("project file encode/decode", () => {
  it("round-trips a project with embedded MIDI exactly", () => {
    const file = encodeProjectFile(project, midiBytes, "song.mid");
    const json = JSON.stringify(file);
    const decoded = decodeProjectFile(JSON.parse(json));
    expect(decoded).not.toBeNull();
    expect(decoded!.project).toEqual(project);
    expect(decoded!.midiName).toBe("song.mid");
    expect(Array.from(decoded!.midiBytes!)).toEqual(Array.from(midiBytes));
  });

  it("round-trips without MIDI", () => {
    const file = encodeProjectFile(project, null, null);
    const decoded = decodeProjectFile(JSON.parse(JSON.stringify(file)));
    expect(decoded!.midiBytes).toBeNull();
    expect(decoded!.project.bpm).toBe(128);
  });

  it("rejects invalid payloads", () => {
    expect(decodeProjectFile({ app: "other" })).toBeNull();
    expect(decodeProjectFile({ app: "chiptune-composer", version: 1, project: { version: 1, chip: "sid", bpm: 128, tempoMode: "flatten", transpose: 0, outputFilter: true, tracks: [] } })).toBeNull();
    expect(decodeProjectFile({ app: "chiptune-composer", version: 1, project: { ...project, bpm: 999 } })).toBeNull();
    expect(decodeProjectFile("garbage")).toBeNull();
  });

  it("preserves optional fields and defaults absent ones", () => {
    const minimal = {
      ...project,
      tracks: [{ ...project.tracks[0], layerMode: undefined, pan: undefined }],
    };
    const decoded = decodeProjectFile(JSON.parse(JSON.stringify(encodeProjectFile(minimal, null, null))));
    expect(decoded!.project.tracks[0].layerMode).toBeUndefined();
    expect(decoded!.project.tracks[0].pan).toBeUndefined();
  });
});

describe("share links", () => {
  it("round-trips through the URL fragment exactly", () => {
    const file: ProjectFile = encodeProjectFile(project, midiBytes, "song.mid");
    const fragment = encodeShare(file);
    expect(fragment.startsWith("p=")).toBe(true);
    expect(fragment).not.toMatch(/[#&\s]/); // URL-fragment safe
    const decoded = decodeShare(fragment);
    expect(decoded).not.toBeNull();
    expect(decoded!.project).toEqual(project);
    expect(Array.from(decoded!.midiBytes!)).toEqual(Array.from(midiBytes));
  });

  it("returns null for tampered payloads", () => {
    const fragment = encodeShare(encodeProjectFile(project, null, null));
    expect(decodeShare(fragment.slice(0, 20) + "XX")).toBeNull();
    expect(decodeShare("p=notbase64!!!")).toBeNull();
    expect(decodeShare("other=thing")).toBeNull();
  });
});
