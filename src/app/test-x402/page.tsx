"use client";

import { useEffect, useState } from "react";
import { useWalletContext } from "@/components/WalletContext";
import { WalletButton } from "@/components/WalletButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { LiquidButton } from "@/components/ui/LiquidButton";
import {
  getPublicBalanceToReceiverClaimableUtxoCreatorFunction,
  getUserAccountQuerierFunction,
  getUserRegistrationFunction,
} from "@umbra-privacy/sdk";
import {
  getCreateReceiverClaimableUtxoFromPublicBalanceProver,
  getUserRegistrationProver,
} from "@umbra-privacy/web-zk-prover";
import { createBrowserSigner, makeZkProverDeps, preloadCreateAssets, makeClient } from "@/lib/umbra";
import { TOKEN_CONFIG } from "@/lib/constants";
import { getSolBalance } from "@/lib/solana";
import type { Token } from "@/types";
import type { Address } from "@solana/kit";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Zap, Terminal, Activity } from "lucide-react";

const INVOICE_AMOUNT_SOL = 0.1;

export default function TestX402Page() {
  const { wallet, account, connected } = useWalletContext();

  // Preload ZK assets in the background so the ZK proof step is faster
  useEffect(() => {
    if (connected) {
      preloadCreateAssets().catch(() => {});
    }
  }, [connected]);

  const [status, setStatus] = useState<string>("");
  const [premiumData, setPremiumData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testPayment = async () => {
    if (!connected || !wallet || !account) {
      alert("Please connect your wallet first!");
      return;
    }

    setLoading(true);
    setStatus("Checking balance…");
    setPremiumData(null);

    try {
      // 0. Check SOL Balance
      const balance = await getSolBalance(account.address);
      const minRequired = INVOICE_AMOUNT_SOL + 0.02; // amount + buffer for reg/rent
      if (balance < minRequired) {
        throw new Error(`Insufficient SOL. You have ${balance.toFixed(3)} SOL but need at least ${minRequired.toFixed(3)} SOL for the payment and Umbra registration fees.`);
      }

      // 1. Initial Request (triggers 402)
      const initialRes = await fetch("/api/premium-data");

      if (initialRes.status !== 402) {
        const data = await initialRes.json();
        setPremiumData(data);
        setStatus("Success! (Already paid or free access)");
        setLoading(false);
        return;
      }

      // 2. Parse Invoice
      const { invoice } = await initialRes.json();
      setStatus(`Invoice received: ${invoice.amount} ${invoice.token}. Preparing shielded payment…`);

      // 3. Setup Umbra client with connected wallet
      const signer = createBrowserSigner(wallet, account);
      const client = await makeClient(signer as any, { skipPreflight: true });

      // 4. Ensure payer is registered with Umbra (required for UTXO creation)
      setStatus("Verifying payer account with Umbra…");
      const querier = getUserAccountQuerierFunction({ client });
      const state   = await querier(signer.address as Address);
      const needsReg = state.state !== "exists"
        || !state.data.isUserCommitmentRegistered
        || !state.data.isUserAccountX25519KeyRegistered;

      if (needsReg) {
        setStatus("Registering with Umbra (wallet will prompt 2–4 times)…");
        const regProver = getUserRegistrationProver(makeZkProverDeps());
        const register  = getUserRegistrationFunction({ client }, { zkProver: regProver });
        await register({ confidential: true, anonymous: true });
      }

      // 5. Create receiver-claimable UTXO — invoiceId embedded in optionalData
      //    Two transactions: createProofAccount + createUtxo (wallet prompts twice)
      setStatus("Computing ZK proof for shielded payment (15–30s)…");

      const tokenCfg    = TOKEN_CONFIG[invoice.token as Token];
      const amountRaw   = BigInt(Math.round(invoice.amount * 10 ** tokenCfg.decimals));
      const invoiceBytes = new Uint8Array(
        (invoice.invoiceId as string).match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16))
      );

      const proverDeps = makeZkProverDeps();
      const utxoProver = getCreateReceiverClaimableUtxoFromPublicBalanceProver({
        assetProvider: proverDeps.assetProvider,
        callbacks:     proverDeps.callbacks,
      });
      const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
        { client },
        { zkProver: utxoProver }
      );

      setStatus("Signing shielded UTXO transactions (wallet will prompt twice)…");

      const result = await createUtxo(
        {
          destinationAddress: invoice.destination as Address,
          mint:               tokenCfg.mint as Address,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          amount:             amountRaw as any,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { optionalData: invoiceBytes as any }
      );

      const proofTxSig = result.createProofAccountSignature.toString();
      const depositSig = result.createUtxoSignature.toString();

      setStatus("UTXO created! Verifying with server…");

      // 6. Retry with x402 Authorization header
      const finalRes = await fetch("/api/premium-data", {
        headers: {
          "X-402-Payment": `x402 ${proofTxSig}:${depositSig}:${invoice.invoiceId}`,
        },
      });

      const resultBody = await finalRes.json();
      if (finalRes.ok) {
        setPremiumData(resultBody.data);
        setStatus("Payment verified! Data unlocked.");
      } else {
        throw new Error(resultBody.error || "Verification failed");
      }

    } catch (e: any) {
      console.error(e);
      setStatus(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

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
            <Zap className="w-4 h-4 text-[#00b3ff]" />
          </div>
          <span className="text-xl font-semibold tracking-[-0.03em]">x402 Test Lab</span>
        </div>
        <p className="text-black/40 text-sm tracking-tight">Machine-to-Machine · Privacy Routing</p>
      </motion.div>

      {/* Main card */}
      <GlassCard
        className="w-full max-w-sm"
        glow={premiumData ? "cyan" : "none"}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.1 }}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Terminal className="w-3 h-3 text-black/40" />
            <span className="text-xs text-black/40 uppercase tracking-widest font-medium">
              API Simulation
            </span>
          </div>
          <WalletButton />
        </div>

        <div className="space-y-4">
          <div className="p-4 bg-black/[0.04] rounded-2xl border border-black/[0.08] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-black/40 uppercase tracking-widest font-medium">Resource</span>
              <span className="text-[10px] px-2 py-0.5 bg-[#00b3ff15] text-[#00b3ff] rounded-full border border-[#00b3ff20]">Premium</span>
            </div>
            <p className="font-mono text-xs text-gray-900 break-all">GET /api/premium-data</p>
          </div>

          <LiquidButton
            fullWidth
            onClick={testPayment}
            loading={loading}
            disabled={!connected}
          >
            <Zap className="w-4 h-4" />
            Purchase Access ({INVOICE_AMOUNT_SOL} SOL)
          </LiquidButton>

          {!connected && (
            <p className="text-center text-[11px] text-black/30 mt-2">
              Connect wallet to purchase
            </p>
          )}

          <AnimatePresence>
            {status && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className={`p-4 rounded-2xl text-xs font-medium border mt-2 flex gap-3 ${
                  status.startsWith("Error")
                    ? "bg-red-50 text-red-600 border-red-100"
                    : "bg-[#00b3ff]/5 text-[#00b3ff] border-[#00b3ff]/10"
                }`}>
                  <Activity className="w-4 h-4 shrink-0 mt-0.5 opacity-60" />
                  <p className="leading-relaxed">{status}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {premiumData && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-5 bg-green-50/50 rounded-2xl border border-green-100 space-y-3"
            >
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-green-500/20 flex items-center justify-center">
                  <Shield className="w-3 h-3 text-green-600" />
                </div>
                <h3 className="text-green-800 text-xs font-bold uppercase tracking-widest">
                  Content Unlocked
                </h3>
              </div>
              <div className="space-y-2 text-green-700">
                <p className="font-medium">{premiumData.message}</p>
                <p className="text-sm italic">&quot;{premiumData.secretData}&quot;</p>
              </div>
              <div className="pt-2 border-t border-green-100/50">
                <p className="text-[9px] text-green-600/60 font-mono break-all uppercase tracking-tighter">
                  Receipt: {premiumData.paymentReceipt.depositTx}
                </p>
              </div>
            </motion.div>
          )}
        </div>
      </GlassCard>

      {/* Footer */}
      <motion.p
        className="text-black/20 text-xs mt-8 text-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
      >
        VeilPay x402 Protocol · Shielded UTXO · Fully Unlinkable
      </motion.p>
    </div>
  );
}
