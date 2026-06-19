import { useState, useEffect } from "react";
import { X, FileUp, Lock, Key, Shield } from "lucide-react"; // CheckSquare dihapus agar tidak kuning
import { useGpg } from "../../../hooks/useGpg";

export interface EncryptionConfig {
  type: "none" | "passphrase" | "public_key";
  passphrase?: string;
  fingerprints?: string[];
}

interface Props {
  isOpen: boolean;
  paths: string[] | null;
  onClose: () => void;
  onConfirm: (config: EncryptionConfig) => void;
}

export function UploadConfirmModal({ isOpen, paths, onClose, onConfirm }: Props) {
  const { keys } = useGpg();
  const [encType, setEncType] = useState<"none" | "passphrase" | "public_key">("none");
  const [passphrase, setPassphrase] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  // Efek otomatis: Pilih kunci pertama di daftar sebagai "Kunci Saya" secara default
  useEffect(() => {
    if (keys.length > 0 && selectedKeys.length === 0) {
      setSelectedKeys([keys[0].fingerprint]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys]); // Baris disable eslint di atas akan menghilangkan garis kuning dependency

  if (!isOpen || !paths) return null;

  const toggleKey = (fingerprint: string) => {
    setSelectedKeys((prev) => (prev.includes(fingerprint) ? prev.filter((k) => k !== fingerprint) : [...prev, fingerprint]));
  };

  const handleSubmit = () => {
    onConfirm({
      type: encType,
      passphrase: encType === "passphrase" ? passphrase : "",
      fingerprints: encType === "public_key" ? selectedKeys : [],
    });
    setEncType("none");
    setPassphrase("");
    setSelectedKeys(keys.length > 0 ? [keys[0].fingerprint] : []);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-telegram-surface border border-telegram-border rounded-xl w-[400px] shadow-2xl p-5 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-telegram-border pb-3">
          <h3 className="text-telegram-text font-medium flex items-center gap-2">
            <FileUp className="w-5 h-5 text-telegram-primary" />
            Konfirmasi Keamanan
          </h3>
          <button onClick={onClose}>
            <X className="w-5 h-5 text-telegram-subtext hover:text-telegram-text" />
          </button>
        </div>

        <p className="text-sm text-telegram-text">
          File: <strong>{paths.length} item</strong>. Pilih metode proteksi sebelum transmisi:
        </p>

        <div className="space-y-2">
          {/* Opsi 1: Tanpa Enkripsi */}
          <div
            className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${encType === "none" ? "bg-telegram-primary/10 border-telegram-primary/50" : "bg-telegram-hover/30 border-telegram-border hover:bg-telegram-hover/50"}`}
            onClick={() => setEncType("none")}
          >
            <Shield className={`w-4 h-4 ${encType === "none" ? "text-telegram-primary" : "text-telegram-subtext"}`} />
            <span className="text-sm text-telegram-text">Kirim Normal (Cleartext)</span>
          </div>

          {/* Opsi 2: Passphrase */}
          <div
            className={`flex flex-col gap-2 p-3 rounded-lg border cursor-pointer transition ${encType === "passphrase" ? "bg-telegram-primary/10 border-telegram-primary/50" : "bg-telegram-hover/30 border-telegram-border hover:bg-telegram-hover/50"}`}
            onClick={() => setEncType("passphrase")}
          >
            <div className="flex items-center gap-3">
              <Lock className={`w-4 h-4 ${encType === "passphrase" ? "text-telegram-primary" : "text-telegram-subtext"}`} />
              <span className="text-sm text-telegram-text">Enkripsi Symmetric (Passphrase)</span>
            </div>
            {encType === "passphrase" && (
              <input
                type="password"
                placeholder="Masukkan passphrase..."
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                className="w-full bg-telegram-bg border border-telegram-border rounded p-2 text-sm text-telegram-text mt-1 focus:outline-none focus:border-telegram-primary/50"
                autoFocus
              />
            )}
          </div>

          {/* Opsi 3: Public Key (Multi-Recipient) */}
          <div
            className={`flex flex-col gap-2 p-3 rounded-lg border cursor-pointer transition ${encType === "public_key" ? "bg-telegram-primary/10 border-telegram-primary/50" : "bg-telegram-hover/30 border-telegram-border hover:bg-telegram-hover/50"}`}
            onClick={() => setEncType("public_key")}
          >
            <div className="flex items-center gap-3">
              <Key className={`w-4 h-4 ${encType === "public_key" ? "text-telegram-primary" : "text-telegram-subtext"}`} />
              <span className="text-sm text-telegram-text">Enkripsi Asymmetric (Public Key)</span>
            </div>
            {encType === "public_key" && (
              <div className="mt-2 space-y-1 max-h-[120px] overflow-y-auto pr-1">
                {keys.length === 0 ? (
                  <p className="text-xs text-red-400">Tidak ada kunci tersimpan!</p>
                ) : (
                  keys.map((k, index) => (
                    <label key={k.fingerprint} className="flex items-start gap-2 p-1.5 rounded hover:bg-telegram-hover/50 cursor-pointer">
                      <input type="checkbox" className="mt-0.5 accent-telegram-primary" checked={selectedKeys.includes(k.fingerprint)} onChange={() => toggleKey(k.fingerprint)} />
                      <div className="flex flex-col">
                        <span className="text-xs text-telegram-text font-medium leading-tight">
                          {k.user_id} {index === 0 && <span className="text-[10px] text-telegram-primary ml-1">(Kunci Anda)</span>}
                        </span>
                        <span className="text-[10px] text-telegram-subtext font-mono">{k.fingerprint.slice(-16)}</span>
                      </div>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 justify-end pt-3 border-t border-telegram-border/50">
          <button onClick={onClose} className="px-4 py-2 text-sm text-telegram-subtext">
            Batal
          </button>
          <button
            onClick={handleSubmit}
            disabled={(encType === "passphrase" && !passphrase) || (encType === "public_key" && selectedKeys.length === 0)}
            className="px-4 py-2 bg-telegram-primary text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition"
          >
            Amankan & Upload
          </button>
        </div>
      </div>
    </div>
  );
}
