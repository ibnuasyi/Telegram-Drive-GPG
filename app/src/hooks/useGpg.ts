import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog"; // Pastikan plugin ini sudah terinstall
import { toast } from "sonner";

export interface GpgKeyInfo {
  fingerprint: string;
  user_id: string;
  key_type: string;
  created_at: string;
  source: string;
}

export function useGpg() {
  const [keys, setKeys] = useState<GpgKeyInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshKeys = async () => {
    setLoading(true);
    try {
      const result = await invoke<GpgKeyInfo[]>("cmd_list_gpg_keys");
      setKeys(result);
    } catch (err) {
      console.error("Gagal memuat kunci GPG:", err);
    } finally {
      setLoading(false);
    }
  };

  const generateKey = async (name: string, passphrase: string) => {
    return await invoke<GpgKeyInfo>("cmd_generate_keypair", { name, passphrase });
  };

  const importKey = async (armoredKey: string) => {
    return await invoke<GpgKeyInfo>("cmd_import_private_key", { armoredKey });
  };

  // FUNGSI BARU: Picker file
  const pickAndImportKeypair = async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "GPG Private Key", extensions: ["asc", "gpg", "key"] }],
      });

      if (selected) {
        const fileContent = await invoke<string>("cmd_read_file_to_string", { path: selected });
        await importKey(fileContent);
        toast.success("Keypair berhasil diimpor!");
        refreshKeys();
      }
    } catch (e) {
      toast.error(`Gagal mengimpor file: ${e}`);
    }
  };

  useEffect(() => {
    refreshKeys();
  }, []);

  // Jangan lupa export fungsi barunya di sini
  return { keys, loading, refreshKeys, generateKey, importKey, pickAndImportKeypair };
}
