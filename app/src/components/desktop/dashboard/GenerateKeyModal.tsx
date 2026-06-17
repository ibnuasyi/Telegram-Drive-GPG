import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (name: string, pass: string) => Promise<void>;
}

export function GenerateKeyModal({ isOpen, onClose, onGenerate }: Props) {
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} className="bg-telegram-surface p-6 rounded-xl w-[350px] border border-telegram-border space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-telegram-text font-bold">Generate New Keypair</h3>
            <input placeholder="Name (e.g. My Key)" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-telegram-bg border border-telegram-border p-2 rounded text-sm text-telegram-text" />
            <input type="password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} className="w-full bg-telegram-bg border border-telegram-border p-2 rounded text-sm text-telegram-text" />

            <div className="flex gap-2 justify-end">
              <button onClick={onClose} className="px-3 py-1 text-xs text-telegram-subtext">
                Cancel
              </button>
              <button onClick={() => onGenerate(name, pass)} className="px-3 py-1 bg-telegram-primary text-white rounded text-xs">
                Generate
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
