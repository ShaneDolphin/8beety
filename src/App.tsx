import { useEffect } from "react";
import { decodeProjectFile } from "./engine/project-io";
import { decodeShare } from "./engine/share";
import BarRuler from "./components/BarRuler";
import ChipRack from "./components/ChipRack";
import EmptyState from "./components/EmptyState";
import Header from "./components/Header";
import TrackList from "./components/TrackList";
import { useStore } from "./store";

export default function App() {
  const song = useStore((s) => s.song);
  const toast = useStore((s) => s.toast);
  const loadMidi = useStore((s) => s.loadMidi);

  useEffect(() => {
    function onDragOver(e: DragEvent) {
      e.preventDefault();
    }
    async function onDrop(e: DragEvent) {
      e.preventDefault();
      const file = e.dataTransfer?.files[0];
      if (!file) return;
      if (/\.midi?$/i.test(file.name)) {
        loadMidi(new Uint8Array(await file.arrayBuffer()), file.name);
      } else if (/\.json$/i.test(file.name)) {
        try {
          const decoded = decodeProjectFile(JSON.parse(await file.text()));
          if (decoded) useStore.getState().loadProjectFile(decoded);
          else useStore.getState().showToast("Not a valid Chiptune Composer project file.");
        } catch {
          useStore.getState().showToast("Not a valid Chiptune Composer project file.");
        }
      }
    }
    const drop = (e: DragEvent) => void onDrop(e);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", drop);
    };
  }, [loadMidi]);

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, "");
    if (hash.startsWith("p=")) {
      const decoded = decodeShare(hash);
      if (decoded) useStore.getState().loadProjectFile(decoded);
      else useStore.getState().showToast("Could not read the shared link.");
    }
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
      const s = useStore.getState();
      if (!s.song || !s.project) return;

      if (e.key === " ") {
        e.preventDefault();
        if (s.playing) s.pause();
        else void s.play();
      } else if (e.key === "Home") {
        s.stop();
      } else if (e.key === "l" || e.key === "L") {
        s.toggleLoop();
      } else if (/^[1-9]$/.test(e.key)) {
        const index = Number(e.key) - 1;
        if (index < s.project.tracks.length) s.setFocused(index);
      } else if (e.key === "m" || e.key === "M" || e.key === "s" || e.key === "S") {
        if (s.focusedIndex === null) return;
        const track = s.project.tracks[s.focusedIndex];
        if (!track) return;
        if (e.key === "m" || e.key === "M") s.updateTrack(track.id, { mute: !track.mute });
        else s.updateTrack(track.id, { solo: !track.solo });
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {song ? (
        <>
          <Header />
          <ChipRack />
          <BarRuler />
          <TrackList />
        </>
      ) : (
        <EmptyState />
      )}
      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded bg-zinc-800 px-4 py-2 text-sm text-zinc-200 shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
