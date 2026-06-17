import { useState, useEffect } from "react";
import { X, Lock, KeyRound } from "lucide-react";

interface Props {
  request: { filename: string } | null;
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
    if (!passphrase.trim()) return;
    onSubmit(passphrase);
  };

  const handleCancel = () => {
    onSubmit(null); // Kirim null tanda dibatalkan
  };

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

        <p className="text-sm text-telegram-text">
          File <strong className="text-telegram-primary">{request.filename}</strong> dikunci dengan Passphrase. Masukkan kunci sandi untuk membukanya:
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <KeyRound className="h-4 w-4 text-telegram-subtext" />
            </div>
            <input
              type="password"
              autoFocus
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Masukkan rahasia Anda..."
              className="w-full bg-telegram-bg border border-telegram-border rounded-lg pl-10 pr-3 py-2 text-sm text-telegram-text focus:outline-none focus:border-telegram-primary transition"
            />
          </div>

          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={handleCancel} className="px-4 py-2 text-sm text-telegram-subtext hover:text-telegram-text transition">
              Batal
            </button>
            <button type="submit" disabled={!passphrase} className="px-4 py-2 bg-telegram-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition">
              Buka Segel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
