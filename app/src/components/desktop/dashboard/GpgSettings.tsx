import { useState } from "react";
import { Upload, Trash2, Download, Key, Eye, EyeOff } from "lucide-react";
import { useGpg } from "../../../hooks/useGpg";
import { toast } from "sonner";
import { GenerateKeyModal } from "./GenerateKeyModal";

export function GpgSettings() {
  const { keys, refreshKeys, importPublicKey, generateKey, pickAndImportKeypair, exportPublicKey, exportPrivateKey, deleteKey } = useGpg();
  const [importText, setImportText] = useState("");
  const [showGenModal, setShowGenModal] = useState(false);
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [exportPassphrase, setExportPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const handleExportPublic = async (fingerprint: string, userId: string) => {
    await exportPublicKey(fingerprint, userId);
  };

  const handleExportPrivate = async (fingerprint: string, userId: string) => {
    if (!exportPassphrase.trim()) {
      toast.error("Masukkan passphrase untuk export private key");
      return;
    }
    await exportPrivateKey(fingerprint, userId, exportPassphrase);
    setExportingKey(null);
    setExportPassphrase("");
  };

  const handleDeleteKey = async (fingerprint: string) => {
    if (deletingKey === fingerprint) {
      // Confirmed - user clicked delete again
      await deleteKey(fingerprint);
      setDeletingKey(null);
    } else {
      // First click - ask for confirmation
      setDeletingKey(fingerprint);
      setTimeout(() => setDeletingKey(null), 3000); // Auto-cancel after 3s
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. YOUR IDENTITY */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Your Identity</h3>
        <div className="p-3 rounded-lg bg-telegram-hover/50 border border-telegram-border/30 space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-telegram-text">Manage your GPG Keypair</span>
            <button onClick={() => setShowGenModal(true)} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-telegram-primary text-white hover:bg-telegram-primary/90 transition">
              Generate New
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={pickAndImportKeypair}
              className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-telegram-bg border border-telegram-border text-telegram-text hover:bg-telegram-hover transition"
            >
              <Upload className="w-3.5 h-3.5" /> Import Keypair
            </button>
            <button
              onClick={() => toast.info("Pilih key dari daftar Saved Keys untuk export")}
              className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-telegram-bg border border-telegram-border text-telegram-text hover:bg-telegram-hover transition"
            >
              <Download className="w-3.5 h-3.5" /> Export Keys
            </button>
          </div>
        </div>
      </section>

      {/* 2. IMPORT PUBLIC KEY (dari orang lain) */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Import Public Key (Orang Lain)</h3>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste Public Key orang lain (BEGIN PGP PUBLIC KEY BLOCK...)"
          className="w-full h-24 bg-telegram-bg border border-telegram-border rounded-md p-2.5 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary/50 transition font-mono"
        />
        <button
          onClick={async () => {
            if (!importText.trim()) return;
            try {
              await importPublicKey(importText);
              setImportText("");
              refreshKeys();
              toast.success("Public key berhasil diimpor!");
            } catch (e) {
              toast.error(`Import failed: ${e}`);
            }
          }}
          className="w-full py-2 rounded-lg text-xs font-medium bg-telegram-primary/10 text-telegram-primary hover:bg-telegram-primary/20 transition"
        >
          Import Public Key
        </button>
      </section>

      {/* 3. SAVED KEYS */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Saved Keys ({keys.length})</h3>
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.fingerprint} className="p-3 rounded-lg bg-telegram-hover/30 border border-telegram-border/20 space-y-3">
              {/* Key Info */}
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <p className="text-sm font-medium text-telegram-text">{key.user_id}</p>
                  <p className="text-[10px] font-mono text-telegram-subtext">
                    Fingerprint: {key.fingerprint.slice(-16)}
                  </p>
                  <p className="text-[10px] text-telegram-subtext mt-0.5">
                    Type: {key.key_type}
                  </p>
                </div>
              </div>

              {/* Export Section */}
              {exportingKey === key.fingerprint ? (
                <div className="bg-telegram-bg/50 rounded-lg p-2 space-y-2">
                  <p className="text-[10px] text-telegram-subtext">Export Private Key - masukkan passphrase:</p>
                  <div className="flex gap-1">
                    <input
                      type={showPassphrase ? "text" : "password"}
                      value={exportPassphrase}
                      onChange={(e) => setExportPassphrase(e.target.value)}
                      placeholder="Passphrase"
                      className="flex-1 bg-telegram-bg border border-telegram-border rounded px-2 py-1 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary/50"
                    />
                    <button
                      onClick={() => setShowPassphrase(!showPassphrase)}
                      className="p-1.5 text-telegram-subtext hover:text-telegram-text"
                    >
                      {showPassphrase ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setExportingKey(null);
                        setExportPassphrase("");
                      }}
                      className="flex-1 py-1 rounded text-xs text-telegram-subtext hover:text-telegram-text transition"
                    >
                      Batal
                    </button>
                    <button
                      onClick={() => handleExportPrivate(key.fingerprint, key.user_id)}
                      className="flex-1 py-1 rounded text-xs bg-telegram-primary text-white hover:bg-telegram-primary/90 transition"
                    >
                      Export
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleExportPublic(key.fingerprint, key.user_id)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium bg-telegram-bg border border-telegram-border text-telegram-text hover:bg-telegram-hover transition"
                  >
                    <Download className="w-3.5 h-3.5" /> Export Public
                  </button>
                  <button
                    onClick={() => setExportingKey(key.fingerprint)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-xs font-medium bg-telegram-bg border border-telegram-border text-telegram-text hover:bg-telegram-hover transition"
                  >
                    <Key className="w-3.5 h-3.5" /> Export Private
                  </button>
                  <button
                    onClick={() => handleDeleteKey(key.fingerprint)}
                    className={`p-1.5 rounded transition ${
                      deletingKey === key.fingerprint
                        ? "bg-red-500 text-white"
                        : "text-red-400 hover:bg-red-500/10"
                    }`}
                    title={deletingKey === key.fingerprint ? "Klik lagi untuk konfirmasi hapus" : "Hapus key"}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ))}
          {keys.length === 0 && <p className="text-xs text-telegram-subtext text-center py-4">No keys imported yet.</p>}
        </div>
      </section>

      <GenerateKeyModal
        isOpen={showGenModal}
        onClose={() => setShowGenModal(false)}
        onGenerate={async (n, p) => {
          try {
            await generateKey(n, p);
            toast.success("Keypair berhasil dibuat!");
            refreshKeys();
          } catch (e) {
            toast.error(`Gagal generate: ${e}`);
          }
        }}
      />
    </div>
  );
}
