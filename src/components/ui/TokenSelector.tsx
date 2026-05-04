"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { ChevronDown, Check } from "lucide-react";
import type { Token } from "@/types";

const TOKEN_LOGO_URLS: Record<Token, string> = {
  SOL:   "/tokens/sol.png",
  USDC:  "/tokens/usdc.png",
  USDT:  "/tokens/usdt.png",
  UMBRA: "/tokens/umbra.png",
  CASH:  "/tokens/cash.png",
};


function TokenLogo({ symbol, size = 32 }: { symbol: Token; size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={TOKEN_LOGO_URLS[symbol]}
      alt={symbol}
      width={size}
      height={size}
      style={{ borderRadius: "50%", objectFit: "cover", flexShrink: 0 }}
    />
  );
}

type TokenMeta = { symbol: Token; name: string };

const TOKENS: TokenMeta[] = [
  { symbol: "SOL",   name: "Solana"     },
  { symbol: "USDC",  name: "USD Coin"   },
  { symbol: "USDT",  name: "Tether USD" },
  { symbol: "UMBRA", name: "Umbra"      },
  { symbol: "CASH",  name: "CASH"       },
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
          <TokenLogo symbol={selected.symbol} size={32} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-medium text-gray-900">{selected.symbol}</p>
          <p className="text-[11px] text-black/40">{selected.name}</p>
        </div>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
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
            <div className="px-3 py-2 border-b border-black/[0.05]">
              <p className="text-[10px] text-black/30 uppercase tracking-widest font-medium">Select token</p>
            </div>
            {TOKENS.map((token) => (
              <motion.button
                key={token.symbol}
                type="button"
                onClick={() => { onChange(token.symbol); setOpen(false); }}
                className="flex items-center gap-3 px-4 py-2.5 w-full hover:bg-black/[0.05] transition-colors duration-150"
                whileHover={{ x: 3 }}
              >
                <div className="w-7 h-7 rounded-full overflow-hidden shrink-0 flex items-center justify-center">
                  <TokenLogo symbol={token.symbol} size={28} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-sm font-medium text-gray-900">{token.symbol}</p>
                  <p className="text-[10px] text-black/40">{token.name}</p>
                </div>
                {value === token.symbol && <Check className="w-3.5 h-3.5 text-[#00b3ff]" />}
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
