"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Lock, Globe, UserCheck } from "lucide-react";
import { PublicKey } from "@solana/web3.js";
import { GlassCard } from "@/components/ui/GlassCard";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { AmountInput } from "@/components/ui/AmountInput";
import { TokenSelector } from "@/components/ui/TokenSelector";
import { LinkDisplay } from "@/components/ui/LinkDisplay";
import { WalletButton } from "@/components/WalletButton";
import { useWalletContext } from "@/components/WalletContext";
import { createPaymentLink, validateAmount, preloadCreateAssets } from "@/lib/umbra";
import type { Token, LinkStep, PaymentLinkMeta, PaymentMode } from "@/types";
import { LINK_EXPIRY_DAYS } from "@/lib/constants";

function isValidSolanaAddress(addr: string): boolean {
  try {
    new PublicKey(addr);
    return true;
  } catch {
    return false;
  }
}

export default function CreatePage() {
  const { connected, wallet, account } = useWalletContext();

  // Pre-load ZK circuits in the background
  useEffect(() => {
    preloadCreateAssets();
  }, []);

  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<Token>("USDC");
  const [mode, setMode] = useState<PaymentMode>("general");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [recipientFocused, setRecipientFocused] = useState(false);
  const [step, setStep] = useState<LinkStep>("input");
  const [statusMsg, setStatusMsg] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [meta, setMeta] = useState<PaymentLinkMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountError = amount ? validateAmount(amount, token) : null;
  const recipientError =
    mode === "locked" && recipientAddress && !isValidSolanaAddress(recipientAddress)
      ? "Enter a valid Solana wallet address."
      : null;
  const canCreate =
    connected &&
    !amountError &&
    parseFloat(amount) > 0 &&
    (mode === "general" || (recipientAddress.length > 0 && !recipientError));

  const handleCreate = async () => {
    if (!wallet || !account) return;
    setError(null);
    setStep("funding");

    try {
      const result = await createPaymentLink({
        senderWallet: wallet,
        senderAccount: account,
        amountHuman: amount,
        token,
        onStatusChange: (msg) => {
          setStatusMsg(msg);
          if (msg.includes("Registering")) setStep("registering");
          if (msg.includes("Depositing")) setStep("creating");
        },
        recipientAddress: mode === "locked" ? recipientAddress : undefined,
      });

      setGeneratedUrl(result.url);
      setMeta(result.meta);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("input");
    }
  };

  const handleReset = () => {
    setStep("input");
    setAmount("");
    setRecipientAddress("");
    setMode("general");
    setGeneratedUrl("");
    setMeta(null);
    setError(null);
    setStatusMsg("");
  };

  const isProcessing =
    step === "funding" || step === "registering" || step === "creating";

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <div className="flex items-center justify-center gap-2 mb-4">
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center
                          bg-[#00b3ff15] border border-[#00b3ff25]"
          >
            <Shield className="w-4 h-4 text-[#00b3ff]" />
          </div>
          <span className="text-xl font-semibold tracking-[-0.03em]">VeilPay</span>
        </div>
        <p className="text-black/40 text-sm tracking-tight">Private payments · Zero traces</p>
      </motion.div>

      {/* Main card */}
      <GlassCard
        className="w-full max-w-sm"
        glow={step === "done" ? "cyan" : "none"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-black/40 uppercase tracking-widest font-medium">
            {step === "done" ? "Link ready" : "New payment"}
          </span>
          <WalletButton />
        </div>

        <AnimatePresence mode="wait">
          {/* ── Input step ── */}
          {step === "input" && (
            <motion.div
              key="input"
              className="space-y-3"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.22 }}
            >
              {/* Mode toggle */}
              <div className="bg-black/[0.04] rounded-2xl p-1 flex gap-1">
                {(["general", "locked"] as PaymentMode[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={[
                      "flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl",
                      "text-xs font-medium transition-all duration-200",
                      mode === m
                        ? "bg-white/80 border border-black/[0.07] shadow-sm text-black/80"
                        : "text-black/35 hover:text-black/55",
                    ].join(" ")}
                  >
                    {m === "general" ? (
                      <Globe className="w-3 h-3" />
                    ) : (
                      <UserCheck className="w-3 h-3" />
                    )}
                    {m === "general" ? "General" : "Wallet-locked"}
                  </button>
                ))}
              </div>

              {/* Mode description */}
              <motion.p
                key={mode}
                className="text-[11px] text-black/35 px-1 leading-relaxed"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.18 }}
              >
                {mode === "general"
                  ? "Anyone with the link can claim. Both sender and receiver stay private."
                  : "Only the specified wallet can claim. Sender stays private."}
              </motion.p>

              <AmountInput value={amount} onChange={setAmount} token={token} />
              {amountError && amount && (
                <p className="text-[11px] text-red-500 px-1">{amountError}</p>
              )}
              <TokenSelector value={token} onChange={setToken} />

              {/* Recipient address input — only shown in locked mode */}
              <AnimatePresence>
                {mode === "locked" && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden"
                  >
                    <motion.div
                      className="relative rounded-2xl overflow-hidden"
                      animate={{
                        boxShadow: recipientFocused
                          ? "0 0 0 1.5px rgba(0,179,255,0.6), 0 0 20px rgba(0,179,255,0.12)"
                          : "0 0 0 1px rgba(0,0,0,0.08)",
                      }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="bg-black/[0.04] px-5 py-4">
                        <label className="block text-[11px] text-black/40 uppercase tracking-widest mb-1.5 font-medium">
                          Recipient Wallet
                        </label>
                        <input
                          type="text"
                          placeholder="Solana address…"
                          value={recipientAddress}
                          onChange={(e) => setRecipientAddress(e.target.value.trim())}
                          onFocus={() => setRecipientFocused(true)}
                          onBlur={() => setRecipientFocused(false)}
                          className="w-full bg-transparent text-sm font-mono text-gray-900
                                     placeholder:text-black/25 outline-none tracking-tight
                                     truncate"
                        />
                      </div>
                    </motion.div>
                    {recipientError && (
                      <p className="text-[11px] text-red-500 px-1 mt-1">{recipientError}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {error && (
                <motion.p
                  className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {error}
                </motion.p>
              )}

              <div className="pt-2">
                <LiquidButton
                  fullWidth
                  disabled={!canCreate}
                  onClick={handleCreate}
                >
                  <Lock className="w-4 h-4" />
                  Create Private Link
                </LiquidButton>
                {!connected && (
                  <p className="text-center text-[11px] text-black/30 mt-2.5">
                    Connect wallet to continue
                  </p>
                )}
              </div>
            </motion.div>
          )}

          {/* ── Processing step ── */}
          {isProcessing && (
            <motion.div
              key="processing"
              className="py-8 flex flex-col items-center gap-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Pulsing shield */}
              <div className="relative">
                <motion.div
                  className="absolute inset-0 rounded-full bg-[#00b3ff20]"
                  animate={{ scale: [1, 1.8, 1], opacity: [0.5, 0, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <motion.div
                  className="absolute inset-0 rounded-full bg-[#00b3ff10]"
                  animate={{ scale: [1, 2.2, 1], opacity: [0.3, 0, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity, delay: 0.3 }}
                />
                <div
                  className="w-14 h-14 rounded-full bg-[#00b3ff15] border border-[#00b3ff30]
                               flex items-center justify-center relative z-10"
                >
                  <Shield className="w-6 h-6 text-[#00b3ff]" />
                </div>
              </div>

              <div className="text-center">
                <p className="text-sm font-semibold tracking-tight text-gray-900">
                  {step === "funding" && "Preparing privacy channel"}
                  {step === "registering" && "Setting up ephemeral key"}
                  {step === "creating" && "Shielding your funds"}
                </p>
                <p className="text-xs text-black/40 mt-1">{statusMsg}</p>
              </div>

              {/* Animated dots */}
              <div className="flex gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-[#00b3ff80]"
                    animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                    transition={{
                      duration: 1.2,
                      repeat: Infinity,
                      delay: i * 0.2,
                    }}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Done step ── */}
          {step === "done" && meta && (
            <motion.div
              key="done"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.22 }}
              className="space-y-4"
            >
              <LinkDisplay
                link={generatedUrl}
                amount={meta.amount}
                token={meta.token}
                expiresAt={meta.expiresAt}
                lockedTo={meta.lockedTo}
              />
              <LiquidButton fullWidth variant="ghost" onClick={handleReset}>
                Create another link
              </LiquidButton>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Footer */}
      <motion.p
        className="text-black/20 text-xs mt-8 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        Powered by Umbra Protocol · Solana · {LINK_EXPIRY_DAYS}-day links
      </motion.p>
    </div>
  );
}
