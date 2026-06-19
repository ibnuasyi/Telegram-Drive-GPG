import React, { useState, useMemo } from "react";
import { X, Globe, ChevronDown, Lock, Youtube, DownloadCloud } from "lucide-react";
import { TelegramFolder } from "../../../types";
import { toast } from "sonner";

interface RemoteUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  folders: TelegramFolder[];
  // PERUBAHAN 1: Tambahkan parameter isVideo untuk dikirim ke parent
  onUpload: (url: string, folderId: number | null, encrypt: boolean, isVideo: boolean) => void;
}

export function RemoteUploadModal({ isOpen, onClose, folders, onUpload }: RemoteUploadModalProps) {
  const [url, setUrl] = useState("");
  const [folderId, setFolderId] = useState<number | null>(null);
  const [encrypt, setEncrypt] = useState(false);

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

    // Kirimkan status isVideo ke fungsi upload utama
    onUpload(url.trim(), folderId, encrypt, isVideoLink);

    setUrl("");
    setFolderId(null);
    setEncrypt(false);
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
          <button type="button" onClick={onClose} className="text-telegram-subtext hover:text-telegram-text transition-colors">
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

          {/* TOGGLE ENKRIPSI */}
          <div className="flex items-center gap-2 p-2 bg-telegram-hover/30 rounded-lg cursor-pointer border border-telegram-border/50 hover:bg-telegram-hover/60 transition" onClick={() => setEncrypt(!encrypt)}>
            <input type="checkbox" checked={encrypt} onChange={(e) => setEncrypt(e.target.checked)} className="accent-telegram-primary" />
            <Lock className="w-3.5 h-3.5 text-telegram-subtext" />
            <span className="text-xs text-telegram-text">Encrypt with GPG before upload</span>
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
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg border border-telegram-border hover:bg-telegram-hover text-telegram-text text-sm font-medium transition-all">
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
