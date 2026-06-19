import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2 } from "lucide-react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { DragDropOverlay } from "./DragDropOverlay";

export function ExternalDropBlocker({ onFilesDropped }: { onFilesDropped?: (paths: string[]) => void; onUploadClick?: () => void }) {
  const [isDragging, setIsDragging] = useState(false);
  const [droppedCount, setDroppedCount] = useState<number | null>(null);

  const onFilesDroppedRef = useRef(onFilesDropped);
  onFilesDroppedRef.current = onFilesDropped;

  useEffect(() => {
    let unlistenDrop: UnlistenFn | undefined;
    let unlistenEnter: UnlistenFn | undefined;
    let unlistenLeave: UnlistenFn | undefined;
    let messageTimeout: ReturnType<typeof setTimeout>;

    (async () => {
      try {
        // 1. Tangkap saat file mulai ditarik ke dalam jendela (Native OS)
        unlistenEnter = await listen("tauri://drag-enter", () => {
          setIsDragging(true);
        });

        // 2. Tangkap saat file batal ditarik keluar jendela
        unlistenLeave = await listen("tauri://drag-leave", () => {
          setIsDragging(false);
        });

        // 3. Tangkap File yang dijatuhkan beserta Path Absolutnya dari Rust!
        unlistenDrop = await listen<{ paths: string[] }>("tauri://drop", (event) => {
          setIsDragging(false);
          const paths = event.payload.paths;

          if (paths && paths.length > 0) {
            onFilesDroppedRef.current?.(paths);
            clearTimeout(messageTimeout);
            setDroppedCount(paths.length);
            messageTimeout = setTimeout(() => setDroppedCount(null), 2000);
          }
        });
      } catch (e) {
        console.warn("[ExternalDropBlocker] Gagal melampirkan native drag-and-drop listener:", e);
      }
    })();

    // Bersihkan DOM listener default agar tidak bentrok
    const preventDefault = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    document.addEventListener("dragover", preventDefault, false);
    document.addEventListener("drop", preventDefault, false);

    return () => {
      if (unlistenDrop) unlistenDrop();
      if (unlistenEnter) unlistenEnter();
      if (unlistenLeave) unlistenLeave();
      clearTimeout(messageTimeout);
      document.removeEventListener("dragover", preventDefault);
      document.removeEventListener("drop", preventDefault);
    };
  }, []);

  return (
    <>
      {/* Animasi saat file melayang di atas aplikasi */}
      <AnimatePresence>{isDragging && <DragDropOverlay />}</AnimatePresence>

      {/* Notifikasi hijau saat berhasil ditangkap */}
      <AnimatePresence>
        {droppedCount !== null && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="fixed bottom-20 right-4 z-[110] pointer-events-none">
            <div className="glass bg-telegram-surface border border-green-500/30 rounded-xl p-4 flex items-center gap-3 shadow-xl">
              <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0" />
              <span className="text-sm text-telegram-text">Berhasil memasukkan {droppedCount} file ke antrean</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
