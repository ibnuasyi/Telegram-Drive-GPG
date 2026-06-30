import React, { useState, useMemo, useEffect } from "react";
import { X, Globe, ChevronDown, Lock, Youtube, DownloadCloud, Key, Shield } from "lucide-react";
import { TelegramFolder } from "../../../types";
import { useGpg } from "../../../hooks/useGpg";
import { toast } from "sonner";

interface EncryptionConfig {
  type: "none" | "passphrase" | "public_key";
  passphrase?: string;
  fingerprints?: string[];
}

interface RemoteUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: TelegramFolder[];
  onUpload: (url: string, folderId: number | null, encryptOrConfig?: boolean | EncryptionConfig, isVideo?: boolean) => void;
}

export function RemoteUploadModal({ isOpen, onClose, folders, onUpload }: RemoteUploadModalProps) {
  const [url, setUrl] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);

  // Encryption state
  const [encType, setEncType] = useState<"none" | "passphrase" | "public_key">("none");
  const [passphrase, setPassphrase] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const { keys } = useGpg();

  // Auto-select first key as default
  useEffect(() => {
    if (keys.length > 0 && selectedKeys.length === 0) {
      setSelectedKeys([keys[0].fingerprint]);
    }
  }, [keys, selectedKeys.length]);

  // PERUBAHAN 2: Regex pintar untuk mendeteksi platform video
  const isVideoLink = useMemo(() => {
    const videoPlatforms = /youtube\.com|youtu\.be|tiktok\.com|x\.com|twitter\.com|instagram\.com|facebook\.com/i;
    return videoPlatforms.test(url);
  }, [url]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) {
      toast.error("Please enter a URL");
      return;
    }
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      toast.error("URL must start with http:// or https://");
      return;
    }

    // Build encryption config
    let encConfig: EncryptionConfig = { type: "none" };
    if (encType === "passphrase" && passphrase) {
      encConfig = { type: "passphrase", passphrase };
    } else if (encType === "public_key" && selectedKeys.length > 0) {
      encConfig = { type: "public_key", fingerprints: selectedKeys };
    }

    // Kirimkan status isVideo dan config ke fungsi upload utama
    onUpload(url.trim(), folderId, encConfig, isVideoLink);

    setUrl("");
    setFolderId(null);
    setEncType("none");
    setPassphrase("");
    setSelectedKeys(keys.length > 0 ? [keys[0].fingerprint] : []);
    onClose();
  };

  const toggleKey = (fingerprint: string) => {
    setSelectedKeys((prev) =>
      prev.includes(fingerprint) ? prev.filter((k) => k !== fingerprint) : [...prev, fingerprint]
    );
  };

  // Reset state saat modal ditutup dari luar
  const handleClose = () => {
    setUrl("");
    setFolderId(null);
    setEncType("none");
    setPassphrase("");
    setSelectedKeys(keys.length > 0 ? [keys[0].fingerprint] : []);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <form onSubmit={handleSubmit} className="bg-telegram-surface border border-telegram-border rounded-xl w-[420px] shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
        <div className="p-4 border-b border-telegram-border flex items-center justify-between transition-colors duration-300" style={{ backgroundColor: isVideoLink ? "rgba(239, 68, 68, 0.1)" : "transparent" }}>
          <h3 className="text-telegram-text font-medium flex items-center gap-2">
            {/* Ikon berubah sesuai mode */}
            {isVideoLink ? <Youtube className="w-5 h-5 text-red-500" /> : <Globe className="w-5 h-5 text-telegram-primary" />}
            {isVideoLink ? "Video Downloader" : "Remote Upload (URL)"}
          </h3>
          <button type="button" onClick={handleClose} className="text-telegram-subtext hover:text-telegram-text transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-xs text-telegram-subtext font-medium">{isVideoLink ? "Video Link (YouTube, TikTok, dll)" : "Remote File URL"}</label>
            <input
              type="text"
              placeholder={isVideoLink ? "https://youtube.com/watch?v=..." : "https://example.com/file.zip"}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={`w-full bg-telegram-bg border rounded-lg px-3 py-2 text-sm text-telegram-text placeholder:text-telegram-subtext/60 focus:outline-none transition-colors ${
                isVideoLink ? "border-red-500/50 focus:border-red-500" : "border-telegram-border focus:border-telegram-primary/50"
              }`}
              autoFocus
            />
          </div>

          {/* PERUBAHAN 3: Info Box ketika Video Link terdeteksi */}
          {isVideoLink && (
            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg animate-in fade-in slide-in-from-top-2">
              <DownloadCloud className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-medium text-red-400">Mode Ekstraksi Video Aktif</span>
                <span className="text-[10px] text-telegram-subtext mt-0.5">Video akan diunduh dengan kualitas terbaik menggunakan yt-dlp sebelum diunggah ke Telegram.</span>
              </div>
            </div>
          )}

          {/* PANEL ENKRIPSI */}
          <div className="space-y-2">
            <span className="text-xs text-telegram-subtext font-medium">Encryption</span>

            {/* Opsi 1: No Encryption */}
            <div
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition ${
                encType === "none" ? "bg-telegram-primary/10 border-telegram-primary/50" : "bg-telegram-hover/30 border-telegram-border hover:bg-telegram-hover/50"
              }`}
              onClick={() => setEncType("none")}
            >
              <Shield className={`w-4 h-4 ${encType === "none" ? "text-telegram-primary" : "text-telegram-subtext"}`} />
              <span className="text-xs text-telegram-text">No Encryption</span>
            </div>

            {/* Opsi 2: Passphrase */}
            <div
              className={`flex flex-col gap-2 p-2 rounded-lg border cursor-pointer transition ${
                encType === "passphrase" ? "bg-telegram-primary/10 border-telegram-primary/50" : "bg-telegram-hover/30 border-telegram-border hover:bg-telegram-hover/50"
              }`}
              onClick={() => setEncType("passphrase")}
            >
              <div className="flex items-center gap-2">
                <Lock className={`w-4 h-4 ${encType === "passphrase" ? "text-telegram-primary" : "text-telegram-subtext"}`} />
                <span className="text-xs text-telegram-text">Encrypt with Passphrase</span>
              </div>
              {encType === "passphrase" && (
                <input
                  type="password"
                  placeholder="Enter passphrase..."
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  className="w-full bg-telegram-bg border border-telegram-border rounded px-2 py-1.5 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary/50"
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>

            {/* Opsi 3: Public Key (Saved Keys) */}
            <div
              className={`flex flex-col gap-2 p-2 rounded-lg border cursor-pointer transition ${
                encType === "public_key" ? "bg-telegram-primary/10 border-telegram-primary/50" : "bg-telegram-hover/30 border-telegram-border hover:bg-telegram-hover/50"
              }`}
              onClick={() => setEncType("public_key")}
            >
              <div className="flex items-center gap-2">
                <Key className={`w-4 h-4 ${encType === "public_key" ? "text-telegram-primary" : "text-telegram-subtext"}`} />
                <span className="text-xs text-telegram-text">Encrypt with Saved Keys</span>
              </div>
              {encType === "public_key" && (
                <div className="mt-1 space-y-1 max-h-[100px] overflow-y-auto pr-1" onClick={(e) => e.stopPropagation()}>
                  {keys.length === 0 ? (
                    <p className="text-[10px] text-red-400">No keys imported! Go to Settings → GPG Settings.</p>
                  ) : (
                    keys.map((k, index) => (
                      <label key={k.fingerprint} className="flex items-start gap-2 p-1 rounded hover:bg-telegram-hover/50 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-telegram-primary"
                          checked={selectedKeys.includes(k.fingerprint)}
                          onChange={() => toggleKey(k.fingerprint)}
                        />
                        <div className="flex flex-col">
                          <span className="text-[11px] text-telegram-text leading-tight">
                            {k.user_id} {index === 0 && <span className="text-[9px] text-telegram-primary ml-1">(Your Key)</span>}
                          </span>
                          <span className="text-[9px] text-telegram-subtext font-mono">{k.fingerprint.slice(-16)}</span>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-telegram-subtext font-medium">Destination Folder</label>
            <div className="relative">
              <select
                value={folderId === null ? "" : folderId}
                onChange={(e) => setFolderId(e.target.value === "" ? null : Number(e.target.value))}
                className="appearance-none w-full bg-telegram-bg border border-telegram-border rounded-md pl-3 pr-8 py-1.5 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary/50 transition cursor-pointer"
              >
                <option value="">Saved Messages</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-telegram-subtext absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-telegram-border bg-telegram-hover/20 flex gap-3 justify-end">
          <button type="button" onClick={handleClose} className="px-4 py-2 rounded-lg border border-telegram-border hover:bg-telegram-hover text-telegram-text text-sm font-medium transition-all">
            Cancel
          </button>
          <button type="submit" className={`px-4 py-2 rounded-lg text-white text-sm font-medium transition-all shadow-md ${isVideoLink ? "bg-red-500 hover:bg-red-600" : "bg-telegram-primary hover:bg-telegram-primary/95"}`}>
            {isVideoLink ? "Download & Upload" : "Start Upload"}
          </button>
        </div>
      </form>
    </div>
  );
}
