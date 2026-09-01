import { create } from "zustand";
import { ApuPlayer } from "./audio/player";
import { compile, type CompileWarning } from "./engine/compile";
import { NES_PROFILE } from "./engine/chip-profiles";
import type { FrameScript } from "./engine/frame-script";
import { parseMidi } from "./engine/midi-import";
import { autoArrange } from "./engine/auto-arrange";
import { defaultProject, type Project, type TrackArrangement } from "./engine/project";
import type { Song } from "./engine/song";

type AppState = {
  song: Song | null;
  project: Project | null;
  script: FrameScript | null;
  warnings: CompileWarning[];
  compileMs: number;
  playing: boolean;
  frame: number;
  toast: string | null;

  loadMidi: (data: Uint8Array, fileName: string) => void;
  loadDemo: () => Promise<void>;
  setBpm: (bpm: number) => void;
  updateTrack: (id: string, patch: Partial<TrackArrangement>) => void;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  showToast: (message: string) => void;
};

const player = new ApuPlayer();
let playerReady = false;
let compileTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<AppState>()((set, get) => {
  function recompileNow(): void {
    const { song, project } = get();
    if (!song || !project) return;
    const t0 = performance.now();
    const { script, warnings } = compile(song, project, NES_PROFILE);
    const compileMs = performance.now() - t0;
    if (import.meta.env.DEV) console.log(`compile: ${compileMs.toFixed(1)} ms`);
    set({ script, warnings, compileMs });
    if (playerReady) player.hotSwap(script);
  }

  function scheduleCompile(): void {
    if (compileTimer !== null) clearTimeout(compileTimer);
    compileTimer = setTimeout(recompileNow, 50);
  }

  return {
    song: null,
    project: null,
    script: null,
    warnings: [],
    compileMs: 0,
    playing: false,
    frame: 0,
    toast: null,

    loadMidi: (data, fileName) => {
      const song = parseMidi(data, fileName);
      const project = defaultProject(song);
      set({ song, project, frame: 0, playing: false });
      if (playerReady) {
        player.pause();
        player.seek(0);
      }
      recompileNow();
      const { assignedCount } = autoArrange(song);
      get().showToast(
        `Auto-arranged ${assignedCount} of ${song.tracks.length} tracks. Use the slot menus to change.`,
      );
    },

    loadDemo: async () => {
      const res = await fetch("/demo-midis/demo.mid");
      const buf = new Uint8Array(await res.arrayBuffer());
      get().loadMidi(buf, "demo.mid");
    },

    setBpm: (bpm) => {
      const { project } = get();
      if (!project) return;
      const clamped = Math.min(300, Math.max(40, Math.round(bpm)));
      set({ project: { ...project, bpm: clamped } });
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

    play: async () => {
      const { script } = get();
      if (!script) return;
      if (!playerReady) {
        await player.init();
        player.onFrame = (frame) => set({ frame });
        player.onEnded = () => set({ playing: false, frame: 0 });
        playerReady = true;
        player.load(get().script ?? script);
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

    showToast: (message) => {
      set({ toast: message });
      if (toastTimer !== null) clearTimeout(toastTimer);
      toastTimer = setTimeout(() => set({ toast: null }), 4000);
    },
  };
});
