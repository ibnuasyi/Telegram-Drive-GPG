import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
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

  const importPublicKey = async (armoredKey: string) => {
    return await invoke<GpgKeyInfo>("cmd_import_gpg_key", { armoredKey });
  };

  // FUNGSI BARU: Picker file untuk import keypair
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

  // FUNGSI: Export Public Key
  const exportPublicKey = async (fingerprint: string, userId: string) => {
    try {
      const armoredKey = await invoke<string>("cmd_export_public_key", { fingerprint });
      const defaultPath = `${userId.replace(/[^a-zA-Z0-9]/g, "_")}_public.asc`;

      const savePath = await save({
        defaultPath,
        filters: [{ name: "PGP Public Key", extensions: ["asc"] }],
      });

      if (savePath) {
        await invoke("cmd_write_file_to_path", { path: savePath, content: armoredKey });
        toast.success("Public key berhasil di-export!");
      }
    } catch (e) {
      toast.error(`Gagal export public key: ${e}`);
    }
  };

  // FUNGSI: Export Private Key (meminta passphrase untuk konfirmasi)
  const exportPrivateKey = async (fingerprint: string, userId: string, passphrase: string) => {
    // Passphrase adalah konfirmasi bahwa user memiliki hak untuk export
    if (!passphrase || passphrase.trim() === "") {
      toast.error("Passphrase diperlukan untuk export private key");
      return;
    }

    try {
      const armoredKey = await invoke<string>("cmd_export_private_key", { fingerprint });
      const defaultPath = `${userId.replace(/[^a-zA-Z0-9]/g, "_")}_private.asc`;

      const savePath = await save({
        defaultPath,
        filters: [{ name: "PGP Private Key", extensions: ["asc"] }],
      });

      if (savePath) {
        await invoke("cmd_write_file_to_path", { path: savePath, content: armoredKey });
        toast.success("Private key berhasil di-export!");
      }
    } catch (e) {
      toast.error(`Gagal export private key: ${e}`);
    }
  };

  // FUNGSI: Delete Key
  const deleteKey = async (fingerprint: string) => {
    try {
      await invoke("cmd_delete_gpg_key", { fingerprint });
      toast.success("Key berhasil dihapus!");
      refreshKeys();
    } catch (e) {
      toast.error(`Gagal hapus key: ${e}`);
    }
  };

  useEffect(() => {
    refreshKeys();
  }, []);

  return {
    keys,
    loading,
    refreshKeys,
    generateKey,
    importKey,
    importPublicKey,
    pickAndImportKeypair,
    exportPublicKey,
    exportPrivateKey,
    deleteKey,
  };
}
