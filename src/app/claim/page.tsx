"use client";

/**
 * Claim page — reads the ephemeral private key from the URL hash.
 * Hash never reaches the server. All parsing is client-side.
 *
 * Route: /claim  (hash: #<bs58_ephemeral_private_key>)
 * Optional query params:
 *   ?to=<address>  — wallet-locked: only this address may claim
 */

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Gift, Shield, Sparkles, AlertTriangle, UserCheck } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { WalletButton } from "@/components/WalletButton";
import { useWalletContext } from "@/components/WalletContext";
import { scanForUtxo, claimPaymentLink, parseClaimHash, preloadClaimAssets } from "@/lib/umbra";
import { NETWORK } from "@/lib/constants";
import type { Wallet, WalletAccount } from "@wallet-standard/core";
import type { ClaimStep, Token } from "@/types";

/** Sign arbitrary bytes using the Wallet Standard solana:signMessage feature. */
function makeSignMessage(wallet: Wallet, account: WalletAccount) {
  return async (message: Uint8Array): Promise<Uint8Array> => {
    const feature = wallet.features["solana:signMessage"] as {
      signMessage: (
        ...inputs: readonly { account: WalletAccount; message: Uint8Array }[]
      ) => Promise<readonly { signature: Uint8Array }[]>;
    };
    const results = await feature.signMessage({ account, message });
    return results[0].signature;
  };
}

export default function ClaimPage() {
  const { connected, address, wallet, account } = useWalletContext();

  const [claimSecret, setClaimSecret] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [lockedTo, setLockedTo] = useState<string | null>(null);
  const [step, setStep] = useState<ClaimStep>("scanning");
  const [statusMsg, setStatusMsg] = useState("Scanning pool…");
  const [amount, setAmount] = useState("—");
  const [token, setToken] = useState<Token>("USDC");
  const [txSig, setTxSig] = useState("");
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  // Parse hash + query params on client only
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Start background ZK pre-load immediately
    preloadClaimAssets();

    // Use a small timeout to allow initial render to complete
    // and avoid synchronous setState warnings in strict mode
    setTimeout(() => {
      const raw = window.location.hash.replace("#", "");
      if (!raw) {
        setError("No claim key found in this link.");
        setStep("preview");
        return;
      }

      const params = new URLSearchParams(window.location.search);

      // Check expiry
      const expMs = params.get("exp");
      if (expMs && Date.now() > Number(expMs)) {
        setError("This payment link has expired.");
        setStep("preview");
        return;
      }

      setLinkId(params.get("lid"));

      // Wallet-lock param
      const to = params.get("to");
      if (to) setLockedTo(to);

      const { claimSecret: secret, token: parsedToken } = parseClaimHash(raw);
      setClaimSecret(secret);
      setToken(parsedToken);

      // Security: Remove the private key from the URL hash so it doesn't leak
      // to browser history or via Referer headers to external links.
      if (window.history.replaceState) {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
    }, 0);
  }, []);

  // Auto-scan when secret is available
  useEffect(() => {
    if (!claimSecret) return;
    let cancelled = false;

    (async () => {
      try {
        setStep("scanning");
        setStatusMsg("Scanning shielded pool…");
        const result = await scanForUtxo(claimSecret, token, {
          maxAttempts: 15,
          retryDelayMs: 4000,
        });

        if (cancelled) return;

        if (!result.hasUtxo) {
          setError("No unclaimed payment found for this link.");
          setStep("preview");
          return;
        }

        setAmount(result.amountHuman);
        setToken(result.token);
        setStep("preview");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to scan pool");
        setStep("preview");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [claimSecret, token]);

  // Wallet-lock check: connected wallet must match the locked address
  const walletMismatch =
    lockedTo !== null && connected && address !== undefined && address !== lockedTo;

  const handleClaim = async () => {
    if (!claimSecret || !address || walletMismatch) return;
    setError(null);
    setStep("claiming");

    try {
      const result = await claimPaymentLink({
        claimSecret,
        token,
        linkId,
        recipientAddress: address,
        onStatusChange: setStatusMsg,
        lockedTo: lockedTo ?? undefined,
        signMessage:
          lockedTo && wallet && account
            ? makeSignMessage(wallet, account)
            : undefined,
      });
      setTxSig(result.signature);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setStep("preview");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      {/* Header */}
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
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
        <p className="text-black/40 text-sm tracking-tight">Someone sent you a private payment</p>
      </motion.div>

      {/* Main card */}
      <GlassCard
        className="w-full max-w-sm overflow-hidden"
        glow={step === "done" ? "cyan" : "none"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        {/* Success background tint */}
        <AnimatePresence>
          {step === "done" && (
            <motion.div
              className="absolute inset-0 bg-gradient-to-b from-emerald-500/5 to-transparent pointer-events-none"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
          )}
        </AnimatePresence>

        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <span className="text-xs text-black/40 uppercase tracking-widest font-medium">
            Claim payment
          </span>
          <WalletButton />
        </div>

        <AnimatePresence mode="wait">
          {/* ── Scanning ── */}
          {step === "scanning" && (
            <motion.div
              key="scanning"
              className="py-10 flex flex-col items-center gap-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="relative">
                {[1, 2].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full border border-[#00b3ff30]"
                    animate={{ scale: [1, 1 + i * 0.6], opacity: [0.5, 0] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      delay: i * 0.4,
                    }}
                  />
                ))}
                <div
                  className="w-14 h-14 rounded-full bg-[#00b3ff15] border border-[#00b3ff30]
                               flex items-center justify-center relative z-10"
                >
                  <Shield className="w-6 h-6 text-[#00b3ff]" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">Scanning pool</p>
                <p className="text-xs text-black/40 mt-1">{statusMsg}</p>
              </div>
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

          {/* ── Preview ── */}
          {step === "preview" && (
            <motion.div
              key="preview"
              className="space-y-4"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.22 }}
            >
              {error ? (
                <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/20">
                  <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              ) : (
                <>
                  {/* Amount display */}
                  <div className="bg-black/[0.03] border border-black/[0.07] rounded-2xl p-5 text-center">
                    <div
                      className="w-12 h-12 rounded-full bg-[#00b3ff15] border border-[#00b3ff25]
                                   flex items-center justify-center mx-auto mb-3"
                    >
                      <Gift className="w-5 h-5 text-[#00b3ff]" />
                    </div>
                    <p className="text-4xl font-light text-gray-900 tracking-tight">
                      {amount}
                      <span className="text-xl text-black/40 ml-1.5">{token}</span>
                    </p>
                    <p className="text-xs text-black/30 mt-2">
                      Waiting in Umbra&apos;s shielded pool
                    </p>
                  </div>

                  {/* Wallet-lock badge */}
                  {lockedTo && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#00b3ff08] border border-[#00b3ff20]">
                      <UserCheck className="w-4 h-4 text-[#00b3ff] shrink-0" />
                      <p className="text-xs text-[#00b3ffcc] font-mono truncate">
                        Locked to {lockedTo.slice(0, 4)}…{lockedTo.slice(-4)}
                      </p>
                    </div>
                  )}

                  {/* Wallet mismatch warning */}
                  {walletMismatch && (
                    <motion.div
                      className="flex items-start gap-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700 leading-relaxed">
                        This link is locked to a different wallet. Connect{" "}
                        <span className="font-mono">
                          {lockedTo!.slice(0, 4)}…{lockedTo!.slice(-4)}
                        </span>{" "}
                        to claim.
                      </p>
                    </motion.div>
                  )}

                  {/* Privacy badge — only show when no mismatch */}
                  {!walletMismatch && (
                    <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-[#00b3ff08] border border-[#00b3ff20]">
                      <Shield className="w-4 h-4 text-[#00b3ff] shrink-0" />
                      <p className="text-xs text-[#00b3ffcc] leading-relaxed">
                        Claiming won&apos;t reveal the sender&apos;s identity or
                        link to their wallet
                      </p>
                    </div>
                  )}

                  <LiquidButton
                    fullWidth
                    disabled={!connected || walletMismatch}
                    onClick={handleClaim}
                  >
                    <Gift className="w-4 h-4" />
                    Claim {amount} {token}
                  </LiquidButton>

                  {!connected && (
                    <p className="text-center text-[11px] text-black/30">
                      {lockedTo
                        ? `Connect ${lockedTo.slice(0, 4)}…${lockedTo.slice(-4)} to claim`
                        : "Connect your wallet to claim"}
                    </p>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ── Claiming ── */}
          {step === "claiming" && (
            <motion.div
              key="claiming"
              className="py-10 flex flex-col items-center gap-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <div className="relative">
                {[1, 2, 3].map((i) => (
                  <motion.div
                    key={i}
                    className="absolute inset-0 rounded-full border border-[#00b3ff30]"
                    animate={{ scale: [1, 1 + i * 0.5], opacity: [0.5, 0] }}
                    transition={{
                      duration: 1.8,
                      repeat: Infinity,
                      delay: i * 0.3,
                    }}
                  />
                ))}
                <div
                  className="w-14 h-14 rounded-full bg-[#00b3ff15] border border-[#00b3ff30]
                               flex items-center justify-center relative z-10"
                >
                  <Shield className="w-6 h-6 text-[#00b3ff]" />
                </div>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-900">Withdrawing from pool</p>
                <p className="text-xs text-black/40 mt-1">{statusMsg}</p>
              </div>
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

          {/* ── Done ── */}
          {step === "done" && (
            <motion.div
              key="done"
              className="py-6 text-center space-y-5"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 300, damping: 24 }}
            >
              {/* Particle burst */}
              <div className="relative flex items-center justify-center">
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-1.5 h-1.5 rounded-full bg-emerald-400"
                    initial={{ scale: 0, x: 0, y: 0 }}
                    animate={{
                      scale: [0, 1, 0],
                      x: Math.cos((i / 8) * Math.PI * 2) * 44,
                      y: Math.sin((i / 8) * Math.PI * 2) * 44,
                    }}
                    transition={{ duration: 0.7, delay: 0.1 + i * 0.04 }}
                  />
                ))}
                <motion.div
                  className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-400/30
                              flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.05 }}
                >
                  <Sparkles className="w-7 h-7 text-emerald-300" />
                </motion.div>
              </div>

              <div>
                <p className="text-2xl font-light text-gray-900">
                  +{amount}{" "}
                  <span className="text-black/40">{token}</span>
                </p>
                <p className="text-sm text-emerald-600 mt-1">Received successfully</p>
              </div>

              <p className="text-xs text-black/30 leading-relaxed px-4">
                Funds are in your wallet. No link to the sender exists on-chain.
              </p>

              {txSig && (
                <a
                  href={`https://solscan.io/tx/${txSig}${NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-[#00b3ff80] hover:text-[#00b3ff] transition-colors"
                >
                  View on Solscan →
                </a>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>

      {/* Footer */}
      <motion.p
        className="text-black/20 text-xs mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        Powered by Umbra Protocol · Solana
      </motion.p>
    </div>
  );
}
