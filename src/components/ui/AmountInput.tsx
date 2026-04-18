"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface AmountInputProps {
  value: string;
  onChange: (v: string) => void;
  token: string;
}

export function AmountInput({ value, onChange, token }: AmountInputProps) {
  const [focused, setFocused] = useState(false);

  return (
    <motion.div
      className="relative rounded-2xl overflow-hidden"
      animate={{
        boxShadow: focused
          ? "0 0 0 1.5px rgba(0,179,255,0.6), 0 0 20px rgba(0,179,255,0.12)"
          : "0 0 0 1px rgba(0,0,0,0.08)",
      }}
      transition={{ duration: 0.2 }}
    >
      <div className="bg-black/[0.04] px-5 py-4">
        <label className="block text-[11px] text-black/40 uppercase tracking-widest mb-1.5 font-medium">
          Amount
        </label>
        <div className="flex items-baseline gap-2">
          <input
            type="number"
            inputMode="decimal"
            placeholder="0.00"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className="flex-1 bg-transparent text-3xl font-light text-gray-900
                       placeholder:text-black/20 outline-none tracking-tight min-w-0"
          />
          <span className="text-black/30 text-base font-light shrink-0">
            {token}
          </span>
        </div>
      </div>
    </motion.div>
  );
}
