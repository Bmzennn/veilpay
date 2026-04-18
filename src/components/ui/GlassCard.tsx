"use client";

import { motion, type MotionProps } from "framer-motion";
import { clsx } from "clsx";

interface GlassCardProps extends MotionProps {
  children: React.ReactNode;
  className?: string;
  glow?: "cyan" | "violet" | "none";
  hover?: boolean;
}

export function GlassCard({
  children,
  className,
  glow = "none",
  hover = false,
  ...motionProps
}: GlassCardProps) {
  return (
    <motion.div
      className={clsx(
        "relative glass rounded-2xl p-6",
        hover && "glass-hover cursor-pointer",
        glow === "cyan" && "glow-cyan",
        glow === "violet" && "glow-violet",
        className
      )}
      whileHover={hover ? { y: -2, scale: 1.004 } : undefined}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      {...motionProps}
    >
      {/* Umbra-style inner top edge highlight */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden pointer-events-none">
        <div className="absolute -top-px left-6 right-6 h-px bg-gradient-to-r from-transparent via-[#00b3ff20] to-transparent" />
      </div>
      {children}
    </motion.div>
  );
}
