"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Check } from "lucide-react";
import type { Token } from "@/types";

// Official USDC logo (Circle)
function UsdcIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="16" cy="16" r="16" fill="#2775CA" />
      <path
        d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.234-2.194-.702-2.194-1.518s.61-1.326 1.83-1.326c1.1 0 1.71.364 2.02 1.286a.35.35 0 00.33.234h.75a.344.344 0 00.344-.352v-.04a3.04 3.04 0 00-2.73-2.49V9.826a.352.352 0 00-.352-.342h-.71a.352.352 0 00-.352.342v.916c-1.83.234-2.994 1.406-2.994 2.952 0 2.008 1.25 2.79 3.81 3.094 1.7.2 2.226.668 2.226 1.584s-.752 1.54-1.972 1.54c-1.554 0-2.11-.65-2.304-1.586a.35.35 0 00-.34-.27h-.776a.344.344 0 00-.344.352v.04c.234 1.718 1.36 2.914 3.5 3.194v.92a.352.352 0 00.352.342h.71a.352.352 0 00.352-.342v-.906c1.868-.28 3.04-1.45 3.04-3.136z"
        fill="white"
      />
    </svg>
  );
}

// Official Solana logo (gradient bars)
function SolanaIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 397.7 311.7" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="sol-a" x1="90.91%" x2="35.49%" y1="35.38%" y2="64.62%">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
        <linearGradient id="sol-b" x1="65.58%" x2="10.05%" y1="35.38%" y2="64.62%">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
        <linearGradient id="sol-c" x1="78.02%" x2="22.3%" y1="35.38%" y2="64.62%">
          <stop offset="0" stopColor="#00FFA3" />
          <stop offset="1" stopColor="#DC1FFF" />
        </linearGradient>
      </defs>
      <path
        d="M64.6 237.9a7.69 7.69 0 015.5-2.3H391c3.5 0 5.2 4.2 2.8 6.7l-55.6 55.6a7.69 7.69 0 01-5.5 2.3H6.1c-3.5 0-5.2-4.2-2.8-6.7z"
        fill="url(#sol-a)"
      />
      <path
        d="M64.6 18.3A7.86 7.86 0 0170.1 16H391c3.5 0 5.2 4.2 2.8 6.7l-55.6 55.6a7.69 7.69 0 01-5.5 2.3H6.1c-3.5 0-5.2-4.2-2.8-6.7z"
        fill="url(#sol-b)"
      />
      <path
        d="M333.1 127.8a7.69 7.69 0 00-5.5-2.3H6.1c-3.5 0-5.2 4.2-2.8 6.7l55.6 55.6a7.69 7.69 0 005.5 2.3H391c3.5 0 5.2-4.2 2.8-6.7z"
        fill="url(#sol-c)"
      />
    </svg>
  );
}

const TOKENS: {
  symbol: Token;
  name: string;
  Icon: typeof UsdcIcon;
}[] = [
  { symbol: "USDC", name: "USD Coin",  Icon: UsdcIcon },
  { symbol: "SOL",  name: "Solana",    Icon: SolanaIcon },
];

interface TokenSelectorProps {
  value: Token;
  onChange: (v: Token) => void;
}

export function TokenSelector({ value, onChange }: TokenSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = TOKENS.find((t) => t.symbol === value) ?? TOKENS[0];

  return (
    <div className="relative">
      <motion.button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2.5 px-4 py-3 rounded-2xl w-full
                   bg-black/[0.04] border border-black/[0.08] hover:bg-black/[0.06]
                   transition-colors duration-200"
        whileTap={{ scale: 0.98 }}
      >
        <div className="w-8 h-8 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
          <selected.Icon size={32} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-gray-900">{selected.symbol}</p>
          <p className="text-[11px] text-black/40">{selected.name}</p>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown className="w-4 h-4 text-black/40" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="absolute z-20 top-full mt-2 left-0 right-0 glass rounded-2xl overflow-hidden"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
          >
            {TOKENS.map((token) => (
              <motion.button
                key={token.symbol}
                type="button"
                onClick={() => {
                  onChange(token.symbol);
                  setOpen(false);
                }}
                className="flex items-center gap-3 px-4 py-3 w-full
                           hover:bg-black/[0.05] transition-colors duration-150"
                whileHover={{ x: 3 }}
              >
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
                  <token.Icon size={28} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-900">{token.symbol}</p>
                  <p className="text-[10px] text-black/40">{token.name}</p>
                </div>
                {value === token.symbol && (
                  <Check className="w-3.5 h-3.5 text-[#00b3ff]" />
                )}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
