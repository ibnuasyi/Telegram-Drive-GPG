import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { toast } from "sonner";
import { DownloadItem, TelegramFile } from "../types";
import { isAndroidPlatform, showFileDialogFallback, pickWithFallback, sanitizeFilename } from "../utils";
import { useSettings } from "../context/SettingsContext";
import type { Store } from "@tauri-apps/plugin-store";

interface ProgressPayload {
  id: string;
  percent: number;
  uploaded_bytes: number;
  total_bytes: number;
  speed_bytes_per_sec: number;
}

export function useFileDownload(store: Store | null) {
  const [downloadQueue, setDownloadQueue] = useState<DownloadItem[]>([]);
  const [initialized, setInitialized] = useState(false);
  const cancelledRef = useRef<Set<string>>(new Set());
  const activeCountRef = useRef(0);
  const { settings } = useSettings();

  // State untuk Modal Dekripsi ditambahkan variabel attempt untuk hitung mundur
  const [decryptRequest, setDecryptRequest] = useState<{ filename: string; attempt?: number; maxAttempts?: number } | null>(null);
  const decryptResolveRef = useRef<((passphrase: string | null) => void) | null>(null);

  // Fungsi untuk memanggil modal dan menunggu jawaban
  const requestPassphrase = (filename: string, attempt: number = 1, maxAttempts: number = 3): Promise<string | null> => {
    setDecryptRequest({ filename, attempt, maxAttempts });
    return new Promise((resolve) => {
      decryptResolveRef.current = resolve;
    });
  };

  // Fungsi untuk menerima jawaban dari modal
  const submitPassphrase = (passphrase: string | null) => {
    if (decryptResolveRef.current) {
      decryptResolveRef.current(passphrase);
      decryptResolveRef.current = null;
    }
    setDecryptRequest(null);
  };

  useEffect(() => {
    let unlisten: UnlistenFn | undefined;
    listen<ProgressPayload>("download-progress", (event) => {
      setDownloadQueue((q) =>
        q.map((i) =>
          i.id === event.payload.id
            ? {
                ...i,
                progress: event.payload.percent,
                downloadedBytes: event.payload.uploaded_bytes,
                totalBytes: event.payload.total_bytes,
                speedBytesPerSec: event.payload.speed_bytes_per_sec,
              }
            : i,
        ),
      );
    }).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (!store || initialized) return;
    store.get<DownloadItem[]>("downloadQueue").then((saved) => {
      if (saved && saved.length > 0) {
        const pending = saved.filter((i) => i.status === "pending");
        if (pending.length > 0) {
          setDownloadQueue(pending);
          toast.info(`Restored ${pending.length} pending downloads`);
        }
      }
      setInitialized(true);
    });
  }, [store, initialized]);

  useEffect(() => {
    if (!store || !initialized) return;
    const pending = downloadQueue.filter((i) => i.status === "pending");
    store.set("downloadQueue", pending).then(() => store.save());
  }, [store, downloadQueue, initialized]);

  useEffect(() => {
    const maxConcurrent = settings.maxConcurrentDownloads || 1;
    const available = maxConcurrent - activeCountRef.current;
    if (available <= 0) return;
    const pendingItems = downloadQueue.filter((i) => i.status === "pending").slice(0, available);
    for (const item of pendingItems) {
      processItem(item);
    }
  }, [downloadQueue, settings.maxConcurrentDownloads]);

  const processItem = async (item: DownloadItem) => {
    activeCountRef.current++;
    setDownloadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "downloading", progress: 0 } : i)));

    try {
      let savePath: string | null = item.savePath || null;
      if (!savePath) {
        if (isAndroidPlatform) {
          savePath = item.filename;
        } else {
          // Wrapper dengan timeout untuk mencegah hang
          const saveDialogPromise = save({ defaultPath: item.filename });
          const timeoutPromise = new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 30000));

          const result = await Promise.race([saveDialogPromise, timeoutPromise]);

          if (result === 'timeout') {
            toast.error("Save dialog timeout. Please try again.");
            setDownloadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "pending" as const, error: "Dialog timeout" } : i)));
            activeCountRef.current--;
            return;
          }

          savePath = result;

          if (!savePath) {
            setDownloadQueue((q) => q.filter((i) => i.id !== item.id));
            activeCountRef.current--;
            return;
          }
        }
      }

      const finalPath = savePath || item.filename;
      const isGpg = finalPath.endsWith(".gpg");
      let currentPassphrase: string | null = null;
      const maxAttempts = 3;

      // 1. MINTA PASSPHRASE SEBELUM DOWNLOAD DIMULAI
      if (isGpg) {
        currentPassphrase = await requestPassphrase(item.filename, 1, maxAttempts);

        // Jika user menutup modal (null) tanpa input
        if (currentPassphrase === null) {
          toast.info(`Unduhan dibatalkan.`);
          setDownloadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "cancelled" as const } : i)));
          activeCountRef.current--;
          return;
        }
      }

      // 2. MULAI UNDUH FILE BINER
      await invoke("cmd_download_file", {
        req: {
          message_id: item.messageId,
          save_path: savePath,
          folder_id: item.folderId,
          transfer_id: item.id,
        },
      });

      if (cancelledRef.current.has(item.id)) {
        cancelledRef.current.delete(item.id);
      } else {
        // 3. LOGIKA DEKRIPSI OTOMATIS & SELF-DESTRUCT
        if (isGpg) {
          toast.info(`Membuka segel GPG untuk ${item.filename}...`);
          let attempts = 1;
          let success = false;

          while (attempts <= maxAttempts && !success) {
            try {
              let decryptedPath;
              // Eksekusi dekripsi berdasarkan input sandi (mendukung input kosong untuk pure-public-key)
              if (currentPassphrase === "") {
                decryptedPath = await invoke<string>("cmd_gpg_decrypt_file", { inputPath: finalPath });
              } else {
                decryptedPath = await invoke<string>("cmd_gpg_decrypt_file_with_passphrase", {
                  inputPath: finalPath,
                  passphrase: currentPassphrase,
                });
              }

              const cleanName = decryptedPath.split(/[/\\]/).pop();
              toast.success(`Berhasil didekripsi: ${cleanName}`);

              // Hapus file biner .gpg setelah sukses
              await invoke("cmd_delete_temp_file", { path: finalPath }).catch(() => {});
              success = true;
            } catch (err) {
              if (attempts >= maxAttempts) {
                // EKSEKUSI SELF-DESTRUCT
                toast.error(`Gagal 3 kali. File .gpg dihancurkan dari sistem.`);
                await invoke("cmd_delete_temp_file", { path: finalPath }).catch(() => {});
                throw new Error("Sandi salah 3 kali. File dihancurkan demi keamanan.");
              } else {
                // Tanyakan ulang sandi jika masih ada kesempatan
                toast.error(`Sandi salah. Kesempatan sisa: ${maxAttempts - attempts}`);
                attempts++;
                currentPassphrase = await requestPassphrase(item.filename, attempts, maxAttempts);

                if (currentPassphrase === null) {
                  toast.error(`Dibatalkan. Menghapus file .gpg...`);
                  await invoke("cmd_delete_temp_file", { path: finalPath }).catch(() => {});
                  throw new Error("Dekripsi dibatalkan pengguna.");
                }
              }
            }
          }
          setDownloadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "success", progress: 100 } : i)));
        } else {
          // File normal non-gpg
          setDownloadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "success", progress: 100 } : i)));
          toast.success(`Downloaded: ${item.filename}`);
        }
      }
    } catch (e) {
      if (!cancelledRef.current.has(item.id)) {
        const errMsg = String(e);
        if (errMsg.includes("Transfer cancelled")) {
          setDownloadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "cancelled" } : i)));
        } else {
          setDownloadQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: "error", error: errMsg } : i)));
          toast.error(`Download failed: ${item.filename}`);
        }
      } else {
        cancelledRef.current.delete(item.id);
      }
    } finally {
      activeCountRef.current--;
    }
  };

  const queueDownload = (messageId: number, filename: string, folderId: number | null) => {
    const newItem: DownloadItem = {
      id: Math.random().toString(36).substr(2, 9),
      messageId,
      filename: sanitizeFilename(filename),
      folderId,
      status: "pending",
    };
    setDownloadQueue((prev) => [...prev, newItem]);
  };

  const queueBulkDownload = async (files: TelegramFile[], folderId: number | null) => {
    if (isAndroidPlatform) {
      const newItems: DownloadItem[] = files.map((file) => ({
        id: Math.random().toString(36).substr(2, 9),
        messageId: file.id,
        filename: sanitizeFilename(file.name),
        folderId,
        status: "pending" as const,
      }));
      setDownloadQueue((prev) => [...prev, ...newItems]);
      toast.info(`Downloading ${files.length} file${files.length !== 1 ? "s" : ""} to Downloads`);
      return;
    }

    const enqueueFiles = (dir: string) => {
      const separator = dir.includes("\\") ? "\\" : "/";
      const newItems: DownloadItem[] = files.map((file) => {
        const sanitizedName = sanitizeFilename(file.name);
        return {
          id: Math.random().toString(36).substr(2, 9),
          messageId: file.id,
          filename: sanitizedName,
          folderId,
          status: "pending" as const,
          savePath: dir.endsWith(separator) ? `${dir}${sanitizedName}` : `${dir}${separator}${sanitizedName}`,
        };
      });
      setDownloadQueue((prev) => [...prev, ...newItems]);
      toast.info(`Queued ${files.length} files for download`);
    };

    const dirPath = await pickWithFallback(
      () => open({ directory: true, multiple: false, title: "Select Download Destination" }),
      () => queueBulkDownload(files, folderId),
      {
        errorTitle: "Folder picker failed",
        onBrowserPicker: async () => {
          const paths = await showFileDialogFallback({ directory: true, multiple: false });
          if (paths.length === 0) return null;
          const sep = paths[0].includes("\\") ? "\\" : "/";
          return paths[0].substring(0, paths[0].lastIndexOf(sep));
        },
      },
    );
    if (!dirPath) return;

    enqueueFiles(dirPath);
  };

  const clearFinished = () => {
    setDownloadQueue((q) => q.filter((i) => i.status !== "success"));
  };

  const cancelAll = () => {
    setDownloadQueue((q) => {
      const downloading = q.find((i) => i.status === "downloading");
      if (downloading) {
        cancelledRef.current.add(downloading.id);
        invoke("cmd_cancel_transfer", { transferId: downloading.id }).catch(() => {});
      }
      return q.filter((i) => i.status !== "pending").map((i) => (i.status === "downloading" ? { ...i, status: "cancelled" as const } : i));
    });
    toast.info("All downloads cancelled");
  };

  const cancelItem = (id: string) => {
    setDownloadQueue((q) => {
      const item = q.find((i) => i.id === id);
      if (item?.status === "downloading") {
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
    setDownloadQueue((q) =>
      q.map((i) =>
        i.id === id && (i.status === "error" || i.status === "cancelled") ? { ...i, status: "pending" as const, error: undefined, progress: undefined, downloadedBytes: undefined, totalBytes: undefined, speedBytesPerSec: undefined } : i,
      ),
    );
  };

  return {
    downloadQueue,
    queueDownload,
    queueBulkDownload,
    clearFinished,
    cancelAll,
    cancelItem,
    retryItem,
    decryptRequest,
    submitPassphrase,
  };
}
