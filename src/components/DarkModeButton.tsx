"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/components/ThemeContext";

export function DarkModeButton() {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  return (
    <motion.button
      onClick={toggle}
      className="fixed bottom-6 right-6 z-50 w-10 h-10 rounded-full glass
                 flex items-center justify-center shadow-lg"
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={isDark ? "sun" : "moon"}
          initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
          animate={{ opacity: 1, rotate: 0, scale: 1 }}
          exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
          transition={{ duration: 0.18 }}
        >
          {isDark ? (
            <Sun className="w-4 h-4 text-[#00b3ff]" />
          ) : (
            <Moon className="w-4 h-4 text-[#00b3ff]" />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.button>
  );
}
