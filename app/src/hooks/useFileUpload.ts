import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
// Kita import QueueItem asli, lalu kita perluas (extend) untuk kebutuhan yt-dlp
import { QueueItem as CoreQueueItem } from "../types";
import { isAndroidPlatform, showFileDialogFallback, pickWithFallback } from "../utils";
import { useSettings } from "../context/SettingsContext";
import type { Store } from "@tauri-apps/plugin-store";

export interface EncryptionConfig {
  type: "none" | "passphrase" | "public_key";
  passphrase?: string;
  fingerprints?: string[];
}

// Perluasan tipe data untuk menampung properti tambahan kita
export type QueueItem = CoreQueueItem & {
  isVideoExtract?: boolean;
  encryptionConfig?: EncryptionConfig;
  tempZipPath?: string;
};

interface ProgressPayload {
  id: string;
  percent: number;
  uploaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
}
interface RemoteProgressPayload {
  id: string;
  phase: "downloading" | "uploading";
  percent: number;
  speed: number;
  uploaded_bytes: number;
  total_bytes: number;
}

export function useFileUpload(activeFolderId: number | null, store: Store | null) {
  const queryClient = useQueryClient();
  const { settings } = useSettings();
  const [uploadQueue, setUploadQueue] = useState<QueueItem[]>([]);
  const [initialized, setInitialized] = useState(false);

  // STATE UNTUK MODAL KONFIRMASI UPLOAD
  const [confirmPaths, setConfirmPaths] = useState<string[] | null>(null);

  const cancelledRef = useRef<Set<string>>(new Set());
  const activeCountRef = useRef(0);

  useEffect(() => {
    let unlistenProgress: UnlistenFn | undefined;
    let unlistenRemote: UnlistenFn | undefined;

    listen<ProgressPayload>("upload-progress", (event) => {
      setUploadQueue((q) =>
        q.map((i) => (i.id === event.payload.id ? { ...i, progress: event.payload.percent, uploadedBytes: event.payload.uploaded_bytes, totalBytes: event.payload.total_bytes, speedBytesPerSec: event.payload.speed_bytes_per_sec } : i)),
      );
    }).then((fn) => {
      unlistenProgress = fn;
    });

    listen<RemoteProgressPayload>("remote-upload-progress", (event) => {
      setUploadQueue((q) => q.map((i) => (i.id === event.payload.id ? { ...i, status: event.payload.phase, progress: event.payload.percent, speedBytesPerSec: event.payload.speed } : i)));
    }).then((fn) => {
      unlistenRemote = fn;
    });

    return () => {
      unlistenProgress?.();
      unlistenRemote?.();
    };
  }, []);

  useEffect(() => {
    if (!store || initialized) return;
    store.get<QueueItem[]>("uploadQueue").then((saved) => {
      if (saved && saved.length > 0) {
        const pending = saved.filter((i) => i.status === "pending");
        if (pending.length > 0) {
          setUploadQueue(pending);
          toast.info(`Restored ${pending.length} pending uploads`);
        }
      }
      setInitialized(true);
    });
  }, [store, initialized]);

  useEffect(() => {
    if (!store || !initialized) return;
    const pending = uploadQueue.filter((i) => i.status === "pending");
    store.set("uploadQueue", pending).then(() => store.save());
  }, [store, uploadQueue, initialized]);

  useEffect(() => {
    const maxConcurrent = settings.maxConcurrentUploads || 1;
    const available = maxConcurrent - activeCountRef.current;
    if (available <= 0) return;
    const pendingItems = uploadQueue.filter((i) => i.status === "pending").slice(0, available);
    for (const item of pendingItems) {
      processItem(item);
    }
  }, [uploadQueue, settings.maxConcurrentUploads]);

  useEffect(() => {
    if (!isAndroidPlatform) return;
    const hasActiveUploads = uploadQueue.some((i) => i.status === "uploading" || i.status === "pending");
    if (hasActiveUploads) {
      invoke("cmd_start_foreground_service").catch(() => {});
    } else if (initialized) {
      invoke("cmd_stop_foreground_service").catch(() => {});
    }
  }, [uploadQueue, initialized]);

  const cleanupTempZip = async (item: QueueItem) => {
    if (item.tempZipPath) {
      try {
        await invoke("cmd_delete_temp_zip", { path: item.tempZipPath });
      } catch {}
    }
  };

  const processItem = async (item: QueueItem) => {
    activeCountRef.current++;
    let filePathToUpload = item.path;

    // Jika isVideoExtract true, ini akan berubah menjadi upload file LOKAL
    let isRemoteUrlUpload = !!item.url && !item.isVideoExtract;

    const initialStatus = isRemoteUrlUpload ? "downloading" : "uploading";
    setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: initialStatus, progress: 0 } : i)));

    // ARRAY TRACKER: Melacak file sementara yang harus dihapus (Zero-Trust)
    const tempFilesToClean: string[] = [];

    try {
      // --- FASE 1: YT-DLP EXTRACTION ---
      if (item.isVideoExtract && item.url) {
        setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "downloading", progress: 0 } : i)));

        // Memanggil Rust untuk mengunduh video ke folder /temp
        filePathToUpload = await invoke<string>("cmd_ytdlp_download", { url: item.url });

        // Tandai file MP4 ini untuk dihapus nanti
        tempFilesToClean.push(filePathToUpload);

        setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "uploading", progress: 0 } : i)));
      }

      // --- FASE 2: ROUTER ENKRIPSI ---
      if (item.encryptionConfig && item.encryptionConfig.type !== "none" && !isRemoteUrlUpload) {
        setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "uploading" as const } : i)));

        let encryptedPath = "";
        if (item.encryptionConfig.type === "passphrase" && item.encryptionConfig.passphrase) {
          encryptedPath = await invoke<string>("cmd_gpg_encrypt_file_symmetric", {
            inputPath: filePathToUpload,
            passphrase: item.encryptionConfig.passphrase,
          });
        } else if (item.encryptionConfig.type === "public_key" && item.encryptionConfig.fingerprints) {
          encryptedPath = await invoke<string>("cmd_gpg_encrypt_file", {
            inputPath: filePathToUpload,
            fingerprints: item.encryptionConfig.fingerprints,
          });
        }

        if (encryptedPath) {
          filePathToUpload = encryptedPath;
          // Tandai file .gpg ini untuk dihapus nanti
          tempFilesToClean.push(encryptedPath);
        }
      }

      // --- FASE 3: UPLOAD KE TELEGRAM ---
      if (isRemoteUrlUpload) {
        await invoke("cmd_upload_from_url", { url: item.url, folderId: item.folderId, transferId: item.id });
      } else {
        await invoke("cmd_upload_file", { path: filePathToUpload, folderId: item.folderId, transferId: item.id });
      }

      if (!cancelledRef.current.has(item.id)) {
        setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "success", progress: 100 } : i)));
        queryClient.invalidateQueries({ queryKey: ["files", item.folderId] });
      }
    } catch (e) {
      if (!cancelledRef.current.has(item.id)) {
        const errMsg = String(e);
        if (errMsg.includes("Transfer cancelled")) {
          setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "cancelled" } : i)));
        } else {
          setUploadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "error", error: errMsg } : i)));
          toast.error(`Upload failed: ${e}`);
        }
      } else {
        cancelledRef.current.delete(item.id);
      }
    } finally {
      // --- FASE 4: SANITASI (SELF-DESTRUCT) ---
      // Menghapus semua file residu yang tercipta selama proses
      for (const file of tempFilesToClean) {
        // Jangan hapus file asli pengguna jika itu upload lokal biasa
        if (file !== item.path) {
          await invoke("cmd_delete_temp_file", { path: file }).catch(() => {});
        }
      }
      await cleanupTempZip(item);
      activeCountRef.current--;
    }
  };

  const queueFiles = (paths: string[], encConfig: EncryptionConfig = { type: "none" }) => {
    if (!paths || paths.length === 0) return;
    const newItems: QueueItem[] = paths.map((path: string) => ({
      id: Math.random().toString(36).substr(2, 9),
      path,
      folderId: activeFolderId,
      status: "pending" as const,
      encryptionConfig: encConfig,
    }));
    setUploadQueue((prev) => [...prev, ...newItems]);
  };

  const confirmUpload = (config: EncryptionConfig) => {
    if (confirmPaths) {
      queueFiles(confirmPaths, config);
      setConfirmPaths(null);
    }
  };

  const handleManualUpload = async () => {
    const paths = await pickWithFallback(
      async () => {
        const selected = await open({ multiple: true, directory: false });
        if (!selected) return null;
        return Array.isArray(selected) ? selected : [selected];
      },
      () => handleManualUpload(),
      {
        errorTitle: "File picker failed",
        onBrowserPicker: async () => {
          const fallbackPaths = await showFileDialogFallback({ directory: false, multiple: true });
          return fallbackPaths.length > 0 ? fallbackPaths : null;
        },
      },
    );
    if (paths && paths.length > 0) {
      setConfirmPaths(paths);
    }
  };

  const handleDropUpload = (paths: string[]) => {
    if (!paths || paths.length === 0) return;
    setConfirmPaths(paths);
  };

  const handleFolderUpload = async () => {
    toast.info("Upload folder saat ini akan langsung diantrekan tanpa opsi enkripsi GPG.");
    const folderPath = await pickWithFallback(
      async () => {
        const selected = await open({ multiple: false, directory: true, title: "Select Folder to Upload" });
        if (!selected) return null;
        return Array.isArray(selected) ? selected[0] : selected;
      },
      () => handleFolderUpload(),
      { errorTitle: "Folder picker failed", onBrowserPicker: async () => null },
    );
    if (!folderPath) return;

    if (settings.zipFolders) {
      toast.info(`Zipping folder...`);
      try {
        const zipPath = await invoke<string>("cmd_zip_folder", { folderPath });
        setConfirmPaths([zipPath]);
      } catch (e) {
        toast.error(`Failed to zip: ${e}`);
      }
    } else {
      toast.info(`Enable "Zip folders before upload" in Settings.`);
    }
  };

  const handleUrlUpload = (url: string, folderId: number | null, encryptOrConfig?: boolean | EncryptionConfig, isVideo: boolean = false) => {
    if (!url || !url.trim()) return;
    let filename = url.split("/").pop() || "remote_file";
    if (isVideo) filename = "Memproses_Video..."; // Placeholder nama, Rust/Telegram akan menggantinya

    let encConfig: EncryptionConfig = { type: "none" };

    // Jika pengguna mencentang "Encrypt" di modal Remote URL
    if (typeof encryptOrConfig === "boolean" && encryptOrConfig) {
      // Kita gunakan prompt bawaan browser/OS yang cepat & memblokir antrean
      const pass = window.prompt("Masukkan Passphrase untuk mengenkripsi file/video ini (Kosongkan untuk batal):", "");
      if (pass) {
        encConfig = { type: "passphrase", passphrase: pass };
      } else {
        toast.info("Upload dibatalkan karena Passphrase kosong.");
        return;
      }
    } else if (typeof encryptOrConfig === "object") {
      encConfig = encryptOrConfig;
    }

    const item: QueueItem = {
      id: Math.random().toString(36).substr(2, 9),
      path: filename,
      url: url.trim(),
      folderId: folderId,
      status: "pending" as const,
      encryptionConfig: encConfig,
      isVideoExtract: isVideo, // Indikator untuk mengaktifkan yt-dlp di processItem
    };

    setUploadQueue((prev) => [...prev, item]);
    toast.info(isVideo ? `Mengantrekan Unduhan Video...` : `Queued remote upload`);
  };

  const cancelAll = () => {
    setUploadQueue((q) => {
      const activeItems = q.filter((i) => i.status === "uploading" || i.status === "downloading");
      for (const item of activeItems) {
        cancelledRef.current.add(item.id);
        invoke("cmd_cancel_transfer", { transferId: item.id }).catch(() => {});
      }
      return q.filter((i) => i.status !== "pending").map((i) => (i.status === "uploading" || i.status === "downloading" ? { ...i, status: "cancelled" as const } : i));
    });
    toast.info("All uploads cancelled");
  };

  const cancelItem = (id: string) => {
    setUploadQueue((q) => {
      const item = q.find((i) => i.id === id);
      if (item?.status === "uploading" || item?.status === "downloading") {
        cancelledRef.current.add(id);
        invoke("cmd_cancel_transfer", { transferId: id }).catch(() => {});
        return q.map((i) => (i.id === id ? { ...i, status: "cancelled" as const } : i));
      }
      if (item?.status === "pending") {
        return q.filter((i) => i.id !== id);
      }
      return q;
    });
  };

  const retryItem = (id: string) => {
    setUploadQueue((q) =>
      q.map((i) =>
        i.id === id && (i.status === "error" || i.status === "cancelled") ? { ...i, status: "pending" as const, error: undefined, progress: undefined, uploadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined } : i,
      ),
    );
  };

  return {
    uploadQueue,
    setUploadQueue,
    handleManualUpload,
    handleFolderUpload,
    handleDropUpload,
    handleUrlUpload,
    cancelAll,
    cancelItem,
    retryItem,
    confirmPaths,
    setConfirmPaths,
    confirmUpload,
  };
}
