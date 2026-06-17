import { useState } from "react";
import { Upload, Trash2, Download } from "lucide-react";
import { useGpg } from "../../../hooks/useGpg";
import { toast } from "sonner";
import { GenerateKeyModal } from "./GenerateKeyModal";

export function GpgSettings() {
  const { keys, refreshKeys, importKey, generateKey, pickAndImportKeypair } = useGpg();
  const [importText, setImportText] = useState("");
  const [showGenModal, setShowGenModal] = useState(false);

  const handleImport = async () => {
    if (!importText.trim()) return;
    try {
      await importKey(importText);
      setImportText("");
      refreshKeys();
      toast.success("Key imported successfully");
    } catch (e) {
      toast.error(`Import failed: ${e}`);
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
            <button className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-telegram-bg border border-telegram-border text-telegram-text hover:bg-telegram-hover transition">
              <Download className="w-3.5 h-3.5" /> Export Keypair
            </button>
          </div>
        </div>
      </section>

      {/* 2. IMPORT PUBLIC KEY */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Import Public Key</h3>
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder="Paste Public Key (BEGIN PGP PUBLIC KEY BLOCK...)"
          className="w-full h-24 bg-telegram-bg border border-telegram-border rounded-md p-2.5 text-xs text-telegram-text focus:outline-none focus:border-telegram-primary/50 transition"
        />
        <button onClick={handleImport} className="w-full py-2 rounded-lg text-xs font-medium bg-telegram-primary/10 text-telegram-primary hover:bg-telegram-primary/20 transition">
          Import Public Key
        </button>
      </section>

      {/* 3. SAVED KEYS */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold text-telegram-subtext uppercase tracking-wider">Saved Keys ({keys.length})</h3>
        <div className="space-y-2">
          {keys.map((key) => (
            <div key={key.fingerprint} className="p-3 rounded-lg bg-telegram-hover/30 border border-telegram-border/20 flex justify-between items-center">
              <div>
                <p className="text-sm font-medium text-telegram-text">{key.user_id}</p>
                <p className="text-[10px] font-mono text-telegram-subtext">Fingerprint: {key.fingerprint.slice(-16)}</p>
              </div>
              <button className="p-1.5 text-red-400 hover:bg-red-500/10 rounded transition">
                <Trash2 className="w-4 h-4" />
              </button>
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
