import { useState, useEffect } from "react";
import { X, Lock, KeyRound, AlertTriangle } from "lucide-react"; // Tambahkan icon peringatan

interface Props {
  // 1. Perbarui Props untuk menerima data attempt
  request: {
    filename: string;
    attempt?: number;
    maxAttempts?: number;
  } | null;
  onSubmit: (passphrase: string | null) => void;
}

export function DecryptPromptModal({ request, onSubmit }: Props) {
  const [passphrase, setPassphrase] = useState("");

  // Reset input setiap kali modal muncul
  useEffect(() => {
    if (request) setPassphrase("");
  }, [request]);

  if (!request) return null;

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    // 2. Kita hapus validasi '!passphrase.trim()' agar pengguna bisa
    // menekan "Buka Segel" dengan kotak kosong (untuk penggunaan murni Public Key)
    onSubmit(passphrase);
  };

  const handleCancel = () => {
    onSubmit(null); // Kirim null tanda dibatalkan
  };

  // Cek apakah ini adalah percobaan ulang akibat sandi salah
  const isRetry = request.attempt && request.attempt > 1;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={handleCancel}>
      <div className="bg-telegram-surface border border-telegram-border rounded-xl w-[380px] shadow-2xl p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-telegram-border pb-3">
          <h3 className="text-telegram-text font-medium flex items-center gap-2">
            <Lock className="w-5 h-5 text-telegram-primary" />
            Dekripsi File
          </h3>
          <button onClick={handleCancel}>
            <X className="w-5 h-5 text-telegram-subtext hover:text-telegram-text" />
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-sm text-telegram-text">
            File <strong className="text-telegram-primary">{request.filename}</strong> dikunci. Masukkan Passphrase, atau biarkan kosong jika Anda menggunakan Public Key:
          </p>

          {/* 3. TAMBAHAN UI SELF-DESTRUCT */}
          {isRetry && (
            <div className="flex items-center gap-2 text-red-500 bg-red-500/10 p-2.5 rounded border border-red-500/20 text-xs font-medium animate-pulse">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>
                Sandi salah! Percobaan ke-{request.attempt} dari {request.maxAttempts}. File akan dihancurkan jika terus gagal.
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <KeyRound className={`h-4 w-4 ${isRetry ? "text-red-400" : "text-telegram-subtext"}`} />
            </div>
            <input
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Masukkan rahasia Anda..."
              // Kotak input akan berubah kemerahan jika sedang dalam mode retry
              className={`w-full bg-telegram-bg border rounded-lg pl-10 pr-3 py-2 text-sm text-telegram-text focus:outline-none transition ${
                isRetry ? "border-red-500/50 focus:border-red-500" : "border-telegram-border focus:border-telegram-primary"
              }`}
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={handleCancel} className="px-4 py-2 text-sm text-telegram-subtext hover:text-telegram-text transition">
              Batal
            </button>
            {/* 4. Hapus 'disabled={!passphrase}' dari tombol submit */}
            <button type="submit" className="px-4 py-2 bg-telegram-primary text-white rounded-lg text-sm font-medium hover:bg-telegram-primary/90 transition">
              Buka Segel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
