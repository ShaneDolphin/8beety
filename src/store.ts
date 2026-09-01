import { create } from "zustand";
import { ApuPlayer } from "./audio/player";
import { assignTrackToSlot, loopFrames, remapForChip } from "./engine/arrange-ops";
import { compile, type CompileWarning } from "./engine/compile";
import { PROFILES } from "./engine/chip-profiles";
import type { FrameScript } from "./engine/frame-script";
import { parseMidi } from "./engine/midi-import";
import { autoArrange } from "./engine/auto-arrange";
import {
  encodeProjectFile,
  type DecodedProjectFile,
  type ProjectFile,
} from "./engine/project-io";
import { mergeRegions, splitRegions, updateRegion } from "./engine/regions";
import type { Region } from "./engine/project";
import type { SourceTrack } from "./engine/song";
import { defaultProject, type Project, type TrackArrangement } from "./engine/project";
import type { Song } from "./engine/song";

type AppState = {
  song: Song | null;
  midiBytes: Uint8Array | null;
  midiName: string | null;
  project: Project | null;
  script: FrameScript | null;
  warnings: CompileWarning[];
  compileMs: number;
  playing: boolean;
  frame: number;
  toast: string | null;
  loopBars: [number, number] | null;
  savedLoopBars: [number, number] | null;
  focusedIndex: number | null;

  loadMidi: (data: Uint8Array, fileName: string) => void;
  loadDemo: () => Promise<void>;
  loadProjectFile: (decoded: DecodedProjectFile) => void;
  buildProjectFile: (maxMidiBytes?: number) => { file: ProjectFile; midiOmitted: boolean } | null;
  setBpm: (bpm: number) => void;
  setChip: (chip: "nes" | "gb") => void;
  updateTrack: (id: string, patch: Partial<TrackArrangement>) => void;
  assignToSlot: (trackId: string, slotId: string) => void;
  chordAssistTrackId: string | null;
  openChordAssist: (trackId: string | null) => void;
  addDerivedTrack: (track: SourceTrack) => void;
  splitAtPlayhead: (trackId: string) => void;
  updateRegionAt: (trackId: string, index: number, patch: Partial<Region>) => void;
  mergeRegionAt: (trackId: string, index: number) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (frame: number) => void;
  setLoopBars: (bars: [number, number] | null) => void;
  toggleLoop: () => void;
  setFocused: (index: number | null) => void;
  showToast: (message: string) => void;
};

const player = new ApuPlayer();
let playerReady = false;
let compileTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<AppState>()((set, get) => {
  function applyLoop(): void {
    const { script, loopBars } = get();
    if (playerReady) player.setLoop(script && loopBars ? loopFrames(script, loopBars) : null);
  }

  function recompileNow(): void {
    const { song, project } = get();
    if (!song || !project) return;
    const t0 = performance.now();
    const profile = PROFILES[project.chip === "gb" ? "gb" : "nes"];
    const { script, warnings } = compile(song, project, profile);
    const compileMs = performance.now() - t0;
    if (import.meta.env.DEV) console.log(`compile: ${compileMs.toFixed(1)} ms`);
    set({ script, warnings, compileMs });
    if (playerReady) player.hotSwap(script);
    applyLoop(); // bar frames may have moved (BPM change)
  }

  function scheduleCompile(): void {
    if (compileTimer !== null) clearTimeout(compileTimer);
    compileTimer = setTimeout(recompileNow, 50);
  }

  return {
    song: null,
    midiBytes: null,
    midiName: null,
    project: null,
    script: null,
    warnings: [],
    compileMs: 0,
    playing: false,
    frame: 0,
    toast: null,
    loopBars: null,
    savedLoopBars: null,
    focusedIndex: null,
    chordAssistTrackId: null,

    openChordAssist: (trackId) => set({ chordAssistTrackId: trackId }),

    addDerivedTrack: (track) => {
      const { song, project } = get();
      if (!song || !project) return;
      const derived = { ...track, index: song.tracks.length };
      set({
        song: { ...song, tracks: [...song.tracks, derived] },
        project: {
          ...project,
          tracks: [
            ...project.tracks,
            {
              id: `derived-${derived.index}-${Date.now() % 100000}`,
              sourceIndex: derived.index,
              name: derived.name,
              slots: [],
              instrumentId: "arp-chord",
              polyMode: "arp" as const,
              arpFramesPerStep: 1 as const,
              octaveShift: 0,
              transpose: 0,
              volume: 15,
              mute: false,
              solo: false,
            },
          ],
        },
      });
      recompileNow();
      get().showToast(`Added "${derived.name}" — drag it onto the rack to hear it.`);
    },

    loadMidi: (data, fileName) => {
      const song = parseMidi(data, fileName);
      const project = defaultProject(song);
      set({
        song,
        midiBytes: data,
        midiName: fileName,
        project,
        frame: 0,
        playing: false,
        loopBars: null,
        savedLoopBars: null,
        focusedIndex: null,
        chordAssistTrackId: null,
      });
      if (playerReady) {
        player.pause();
        player.seek(0);
      }
      recompileNow();
      const { assignedCount } = autoArrange(song);
      get().showToast(
        `Auto-arranged ${assignedCount} of ${song.tracks.length} tracks. Drag tracks onto the rack to change.`,
      );
    },

    loadDemo: async () => {
      const res = await fetch("/demo-midis/demo.mid");
      const buf = new Uint8Array(await res.arrayBuffer());
      get().loadMidi(buf, "demo.mid");
    },

    loadProjectFile: (decoded) => {
      const state = get();
      let song = state.song;
      let midiBytes = state.midiBytes;
      let midiName = state.midiName;
      if (decoded.midiBytes) {
        midiBytes = decoded.midiBytes;
        midiName = decoded.midiName ?? "shared.mid";
        song = parseMidi(midiBytes, midiName);
      }
      if (!song) {
        get().showToast("This project has no embedded MIDI — load the .mid file first, then the project.");
        return;
      }
      const tracks = decoded.project.tracks.filter((t) => t.sourceIndex < song.tracks.length);
      set({
        song,
        midiBytes,
        midiName,
        project: { ...decoded.project, tracks },
        frame: 0,
        playing: false,
        loopBars: null,
        savedLoopBars: null,
        focusedIndex: null,
        chordAssistTrackId: null,
      });
      if (playerReady) {
        player.pause();
        player.seek(0);
      }
      recompileNow();
      get().showToast("Project loaded.");
    },

    buildProjectFile: (maxMidiBytes) => {
      const { project, midiBytes, midiName } = get();
      if (!project) return null;
      const embed =
        midiBytes && (maxMidiBytes === undefined || midiBytes.length <= maxMidiBytes)
          ? midiBytes
          : null;
      return {
        file: encodeProjectFile(project, embed, embed ? midiName : null),
        midiOmitted: midiBytes !== null && embed === null,
      };
    },

    setBpm: (bpm) => {
      const { project } = get();
      if (!project) return;
      const clamped = Math.min(300, Math.max(40, Math.round(bpm)));
      set({ project: { ...project, bpm: clamped } });
      scheduleCompile();
    },

    setChip: (chip) => {
      const { project } = get();
      if (!project || project.chip === chip) return;
      set({ project: { ...project, chip, tracks: remapForChip(project.tracks, chip) } });
      scheduleCompile();
    },

    updateTrack: (id, patch) => {
      const { project } = get();
      if (!project) return;
      set({
        project: {
          ...project,
          tracks: project.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
        },
      });
      scheduleCompile();
    },

    assignToSlot: (trackId, slotId) => {
      const { project } = get();
      if (!project) return;
      set({ project: { ...project, tracks: assignTrackToSlot(project.tracks, trackId, slotId) } });
      scheduleCompile();
    },

    splitAtPlayhead: (trackId) => {
      const { project, script, frame } = get();
      if (!project || !script) return;
      const track = project.tracks.find((t) => t.id === trackId);
      if (!track) return;
      const bar = script.barStarts.filter((b) => b <= frame).length - 1;
      const next = splitRegions(track.regions, bar, script.barStarts.length);
      if (next === track.regions) {
        get().showToast("Move the playhead inside a region (past bar 1) to split there.");
        return;
      }
      get().updateTrack(trackId, { regions: next });
      get().showToast(`Split "${track.name}" at bar ${bar + 1}.`);
    },

    updateRegionAt: (trackId, index, patch) => {
      const track = get().project?.tracks.find((t) => t.id === trackId);
      if (!track?.regions) return;
      get().updateTrack(trackId, { regions: updateRegion(track.regions, index, patch) });
    },

    mergeRegionAt: (trackId, index) => {
      const track = get().project?.tracks.find((t) => t.id === trackId);
      if (!track?.regions) return;
      get().updateTrack(trackId, { regions: mergeRegions(track.regions, index) });
    },

    play: async () => {
      const { script } = get();
      if (!script) return;
      if (!playerReady) {
        await player.init();
        player.onFrame = (frame) => set({ frame });
        player.onEnded = () => set({ playing: false, frame: 0 });
        playerReady = true;
        player.load(get().script ?? script);
        applyLoop();
      }
      await player.play();
      set({ playing: true });
    },

    pause: () => {
      player.pause();
      set({ playing: false });
    },

    stop: () => {
      player.pause();
      player.seek(0);
      set({ playing: false, frame: 0 });
    },

    seek: (frame) => {
      const { script } = get();
      if (!script) return;
      const clamped = Math.max(0, Math.min(script.frameCount - 1, Math.round(frame)));
      player.seek(clamped);
      set({ frame: clamped });
    },

    setLoopBars: (bars) => {
      set({ loopBars: bars, savedLoopBars: bars ?? get().savedLoopBars });
      applyLoop();
    },

    toggleLoop: () => {
      const { loopBars, savedLoopBars } = get();
      if (loopBars) {
        set({ loopBars: null });
      } else if (savedLoopBars) {
        set({ loopBars: savedLoopBars });
      } else {
        get().showToast("Drag on the bar ruler to set a loop range first.");
        return;
      }
      applyLoop();
    },

    setFocused: (index) => set({ focusedIndex: index }),

    showToast: (message) => {
      set({ toast: message });
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toast: null }), 4000);
    },
  };
});
