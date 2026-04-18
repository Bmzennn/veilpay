"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ChevronDown, Circle, X } from "lucide-react";
import { useWalletContext } from "./WalletContext";
import type { Wallet as WalletStandard } from "@wallet-standard/core";

export function WalletButton() {
  const {
    wallets,
    wallet,
    connected,
    connecting,
    displayAddress,
    connect,
    disconnect,
  } = useWalletContext();

  const [showPicker, setShowPicker] = useState(false);

  const handleConnectClick = () => {
    if (wallets.length === 1) {
      connect(wallets[0]);
    } else if (wallets.length > 1) {
      setShowPicker(true);
    } else {
      // No wallets detected — open Phantom install page
      window.open("https://phantom.app/download", "_blank");
    }
  };

  const handleSelect = (w: WalletStandard) => {
    setShowPicker(false);
    connect(w);
  };

  return (
    <div className="relative">
      <AnimatePresence mode="wait">
        {!connected ? (
          <motion.button
            key="connect"
            type="button"
            onClick={handleConnectClick}
            disabled={connecting}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl
                       bg-black/[0.05] border border-black/[0.1]
                       hover:bg-black/[0.08] text-sm text-black/75
                       hover:text-black transition-all duration-200
                       disabled:opacity-50 disabled:cursor-not-allowed"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <Wallet className="w-4 h-4 text-[#00b3ff]" />
            {connecting ? "Connecting…" : "Connect Wallet"}
          </motion.button>
        ) : (
          <motion.button
            key="connected"
            type="button"
            onClick={disconnect}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl
                       bg-black/[0.05] border border-black/[0.1]
                       hover:bg-black/[0.08] text-sm text-black/60
                       transition-all duration-200"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            <motion.div
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
            </motion.div>
            <span className="font-mono text-xs text-black/50">
              {displayAddress}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-black/30" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Wallet picker overlay */}
      <AnimatePresence>
        {showPicker && (
          <>
            <motion.div
              className="fixed inset-0 z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPicker(false)}
            />
            <motion.div
              className="absolute right-0 top-full mt-2 z-50 glass rounded-2xl overflow-hidden min-w-[200px]"
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-black/10">
                <span className="text-xs text-black/40 uppercase tracking-widest font-medium">
                  Select Wallet
                </span>
                <button
                  type="button"
                  onClick={() => setShowPicker(false)}
                  className="text-black/30 hover:text-black/50 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {wallets.map((w) => (
                <motion.button
                  key={w.name}
                  type="button"
                  onClick={() => handleSelect(w)}
                  className="flex items-center gap-3 px-4 py-3 w-full
                             hover:bg-black/[0.05] transition-colors text-sm text-black/70 hover:text-black"
                  whileHover={{ x: 3 }}
                >
                  {w.icon && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={w.icon} alt={w.name} className="w-6 h-6 rounded-full" />
                  )}
                  {w.name}
                </motion.button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Inline variant used inside GlassCards — no absolute positioning needed. */
export function InlineWalletButton() {
  return (
    <div className="flex items-center justify-end">
      <WalletButton />
    </div>
  );
}
