import { useEffect } from "react";
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
      if (!file || !/\.midi?$/i.test(file.name)) return;
      loadMidi(new Uint8Array(await file.arrayBuffer()), file.name);
    }
    const drop = (e: DragEvent) => void onDrop(e);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("drop", drop);
    };
  }, [loadMidi]);

  return (
    <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
      {song ? (
        <>
          <Header />
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
