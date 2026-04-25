"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Share2, Lock, UserCheck, Eye, EyeOff, AlertTriangle, Shield, Timer } from "lucide-react";

interface LinkDisplayProps {
  link: string;
  amount: string;
  token: string;
  expiresAt: number;
  lockedTo?: string;
}

const REVEAL_DURATION_MS = 15_000;

// Detect if navigator.clipboard.writeText has been monkey-patched by an extension.
// Extensions that hijack the clipboard typically override the method; they rarely
// also spoof Function.prototype.toString, so calling the prototype's toString is
// a harder-to-defeat canary.
function isClipboardPatched(): boolean {
  try {
    const src = Function.prototype.toString.call(navigator.clipboard.writeText);
    return !src.includes("native code");
  } catch {
    return false; // can't tell — assume OK
  }
}

export function LinkDisplay({ link, amount, token, expiresAt, lockedTo }: LinkDisplayProps) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [clipboardWarning, setClipboardWarning] = useState(false);
  const [daysLeft, setDaysLeft] = useState<number | null>(null);

  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setDaysLeft(Math.ceil((expiresAt - Date.now()) / (1000 * 60 * 60 * 24)));
  }, [expiresAt]);

  // Check for clipboard tampering once on mount.
  useEffect(() => {
    if (isClipboardPatched()) setClipboardWarning(true);
  }, []);

  const clearRevealTimers = useCallback(() => {
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
    revealTimerRef.current = null;
    countdownRef.current = null;
  }, []);

  const reBlur = useCallback(() => {
    setRevealed(false);
    setSecondsLeft(0);
    clearRevealTimers();
  }, [clearRevealTimers]);

  // Re-blur immediately if the window loses focus (screen share / remote access observation).
  useEffect(() => {
    const onBlur = () => { if (revealed) reBlur(); };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [revealed, reBlur]);

  // Cleanup on unmount.
  useEffect(() => () => clearRevealTimers(), [clearRevealTimers]);

  const startReveal = useCallback(() => {
    clearRevealTimers();
    setRevealed(true);
    setSecondsLeft(Math.ceil(REVEAL_DURATION_MS / 1000));

    countdownRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) { reBlur(); return 0; }
        return s - 1;
      });
    }, 1000);

    revealTimerRef.current = setTimeout(reBlur, REVEAL_DURATION_MS);
  }, [clearRevealTimers, reBlur]);

  const handleReveal = () => {
    if (revealed) { reBlur(); return; }
    startReveal();
  };

  const handleCopy = async () => {
    if (isClipboardPatched()) {
      setClipboardWarning(true);
      return;
    }
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({ title: "You've received a VeilPay payment", url: link });
    } else {
      handleCopy();
    }
  };

  // Blurred preview — show domain + path but blur the hash fragment (the secret).
  const hashIdx = link.indexOf("#");
  const publicPart = hashIdx >= 0 ? link.slice(0, hashIdx) : link;
  const secretPart = hashIdx >= 0 ? link.slice(hashIdx) : "";

  return (
    <motion.div
      className="space-y-3"
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
            {amount} {token} deposited into VeilPay&apos;s shielded pool
          </p>
        </div>
      </motion.div>

      {/* Clipboard hijack warning */}
      <AnimatePresence>
        {clipboardWarning && (
          <motion.div
            className="flex items-start gap-2.5 px-3.5 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/25"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-[11px] font-semibold text-amber-700">Clipboard extension detected</p>
              <p className="text-[11px] text-amber-600/80 mt-0.5 leading-relaxed">
                A browser extension may have modified the clipboard API. Avoid copying the link until you disable clipboard-related extensions. Share via the Share button instead, or copy manually from the revealed text.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Security notice */}
      <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-[#00b3ff08] border border-[#00b3ff15]">
        <Shield className="w-3.5 h-3.5 text-[#00b3ff] shrink-0" />
        <p className="text-[11px] text-[#00b3ffcc] leading-relaxed">
          The claim key in this link grants access to the funds. Keep it private. The link auto-hides if you switch windows.
        </p>
      </div>

      {/* Link box */}
      <div className="bg-black/[0.03] border border-black/[0.08] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Lock className="w-3 h-3 text-[#00b3ff]" />
            <span className="text-[11px] text-black/40 uppercase tracking-widest font-medium">
              Shareable link
            </span>
          </div>

          {/* Reveal toggle */}
          <motion.button
            type="button"
            onClick={handleReveal}
            className={[
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all duration-200",
              revealed
                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                : "bg-black/[0.05] text-black/40 border border-black/[0.08] hover:text-black/60",
            ].join(" ")}
            whileTap={{ scale: 0.95 }}
          >
            {revealed ? (
              <>
                <EyeOff className="w-3 h-3" />
                Hide
                {secondsLeft > 0 && (
                  <span className="flex items-center gap-0.5 text-amber-500/80">
                    <Timer className="w-2.5 h-2.5" />
                    {secondsLeft}s
                  </span>
                )}
              </>
            ) : (
              <>
                <Eye className="w-3 h-3" />
                Reveal
              </>
            )}
          </motion.button>
        </div>

        {/* Link text — public part always visible, secret fragment blurred */}
        <div className="mb-4 font-mono text-xs leading-relaxed break-all">
          <span className="text-black/40">{publicPart}</span>
          <span
            className={[
              "text-black/70 transition-all duration-300",
              revealed ? "" : "blur-sm select-none pointer-events-none",
            ].join(" ")}
          >
            {secretPart}
          </span>
        </div>

        {/* Not revealed nudge */}
        <AnimatePresence>
          {!revealed && (
            <motion.button
              type="button"
              onClick={handleReveal}
              className="w-full flex items-center justify-center gap-1.5 py-2 mb-3 rounded-xl border border-dashed border-black/[0.12] text-[11px] text-black/35 hover:text-black/55 hover:border-black/20 transition-all duration-200"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              whileTap={{ scale: 0.97 }}
            >
              <Eye className="w-3 h-3" />
              Click to reveal the claim key — auto-hides in {REVEAL_DURATION_MS / 1000}s
            </motion.button>
          )}
        </AnimatePresence>

        {/* Actions */}
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
        Expires in {daysLeft} day{daysLeft !== 1 ? "s" : ""} · Zero on-chain link between you and the recipient
      </p>
    </motion.div>
  );
}
