"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Share2, Lock, UserCheck } from "lucide-react";

interface LinkDisplayProps {
  link: string;
  amount: string;
  token: string;
  expiresAt: number;
  lockedTo?: string;
}

export function LinkDisplay({ link, amount, token, expiresAt, lockedTo }: LinkDisplayProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (typeof navigator !== "undefined" && navigator.share) {
      navigator.share({ title: "You've received a VeilPay payment", url: link });
    } else {
      handleCopy();
    }
  };

  const daysLeft = Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24));

  return (
    <motion.div
      className="space-y-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28, delay: 0.1 }}
    >
      {/* Success banner */}
      <motion.div
        className="flex items-center gap-3 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 400, damping: 24 }}
      >
        <motion.div
          className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0"
          animate={{ rotate: [0, 10, -10, 0] }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Check className="w-4 h-4 text-emerald-600" />
        </motion.div>
        <div>
          <p className="text-sm font-medium text-gray-900">Payment link created</p>
          <p className="text-xs text-black/40">
            {amount} {token} deposited into Umbra&apos;s shielded pool
          </p>
        </div>
      </motion.div>

      {/* Link box */}
      <div className="bg-black/[0.03] border border-black/[0.08] rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-3 h-3 text-[#00b3ff]" />
          <span className="text-[11px] text-black/40 uppercase tracking-widest font-medium">
            Shareable link
          </span>
        </div>
        <p className="text-xs font-mono text-black/50 break-all leading-relaxed mb-4 select-all">
          {link}
        </p>
        <div className="flex gap-2">
          <motion.button
            type="button"
            onClick={handleCopy}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-black/[0.05] border border-black/[0.08] text-sm text-black/60
                       hover:text-black hover:bg-black/[0.08] transition-all duration-200"
            whileTap={{ scale: 0.96 }}
          >
            <AnimatePresence mode="wait">
              {copied ? (
                <motion.span
                  key="check"
                  className="flex items-center gap-1.5 text-emerald-600"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  <Check className="w-3.5 h-3.5" /> Copied
                </motion.span>
              ) : (
                <motion.span
                  key="copy"
                  className="flex items-center gap-1.5"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                >
                  <Copy className="w-3.5 h-3.5" /> Copy
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <motion.button
            type="button"
            onClick={handleShare}
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl
                       bg-black/[0.05] border border-black/[0.08] text-sm text-black/60
                       hover:text-black hover:bg-black/[0.08] transition-all duration-200"
            whileTap={{ scale: 0.96 }}
          >
            <Share2 className="w-3.5 h-3.5" />
          </motion.button>
        </div>
      </div>

      {lockedTo && (
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#00b3ff08] border border-[#00b3ff20]">
          <UserCheck className="w-3.5 h-3.5 text-[#00b3ff] shrink-0" />
          <p className="text-[11px] text-[#00b3ffcc] font-mono truncate">
            Locked to {lockedTo.slice(0, 4)}…{lockedTo.slice(-4)}
          </p>
        </div>
      )}

      <p className="text-[11px] text-black/25 text-center leading-relaxed">
        Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""} · Zero on-chain
        link between you and the recipient
      </p>
    </motion.div>
  );
}
