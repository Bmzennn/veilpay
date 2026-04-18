"use client";

import { motion } from "framer-motion";
import { clsx } from "clsx";
import { Loader2 } from "lucide-react";

interface LiquidButtonProps {
  children: React.ReactNode;
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: "primary" | "ghost" | "danger";
  className?: string;
  fullWidth?: boolean;
  type?: "button" | "submit";
}

export function LiquidButton({
  children,
  onClick,
  loading = false,
  disabled = false,
  variant = "primary",
  className,
  fullWidth = false,
  type = "button",
}: LiquidButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <motion.button
      type={type}
      onClick={!isDisabled ? onClick : undefined}
      className={clsx(
        "relative flex items-center justify-center gap-2",
        "px-6 py-3.5 rounded-full font-semibold text-sm tracking-tight",
        "overflow-hidden transition-all select-none",
        fullWidth && "w-full",
        isDisabled && "opacity-40 cursor-not-allowed",
        variant === "primary" && [
          "text-white",
          "bg-[#00b3ff]",
          !isDisabled && "hover:bg-[#00c5ff]",
        ],
        variant === "ghost" && [
          "text-black/60 bg-black/[0.04] border border-black/[0.1]",
          !isDisabled && "hover:text-black hover:bg-[#00b3ff10] hover:border-[#00b3ff30]",
        ],
        variant === "danger" && [
          "text-red-600 bg-red-500/10 border border-red-500/20",
        ],
        className
      )}
      style={
        variant === "primary" && !isDisabled
          ? {
              boxShadow:
                "0 0.7px 30px rgba(0,179,255,0.4), inset 0 0 12px rgba(255,255,255,0.1)",
            }
          : undefined
      }
      whileTap={!isDisabled ? { scale: 0.97 } : undefined}
      whileHover={
        !isDisabled && variant === "primary"
          ? {
              scale: 1.02,
              boxShadow:
                "0 0.7px 30px 6px rgba(0,179,255,0.45), inset 0 0 15px 2px rgba(255,255,255,0.12)",
            }
          : !isDisabled
          ? { scale: 1.02 }
          : undefined
      }
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
    >
      {/* Shimmer sweep on primary */}
      {variant === "primary" && !isDisabled && (
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent"
          initial={{ x: "-100%" }}
          animate={{ x: "200%" }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            repeatDelay: 4,
            ease: "easeInOut",
          }}
        />
      )}

      {loading ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        children
      )}
    </motion.button>
  );
}
