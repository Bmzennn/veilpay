"use client";

import { useState } from "react";
import { useWalletContext } from "@/components/WalletContext";
import { WalletButton } from "@/components/WalletButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { 
  getUmbraClient, 
  getPublicBalanceToReceiverClaimableUtxoCreatorFunction 
} from "@umbra-privacy/sdk";
import { createBrowserSigner, makeZkProverDeps } from "@/lib/umbra";
import { getCreateReceiverClaimableUtxoFromPublicBalanceProver } from "@umbra-privacy/web-zk-prover";
import { RPC_URL, RPC_WS_URL, UMBRA_INDEXER_URL, NETWORK, TOKEN_CONFIG } from "@/lib/constants";
import type { Token } from "@/types";
import type { Address } from "@solana/kit";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Zap, Terminal, Activity } from "lucide-react";

const INVOICE_AMOUNT_USDC = 0.5;

export default function TestX402Page() {
  const { wallet, account, connected } = useWalletContext();
  const [status, setStatus] = useState<string>("");
  const [premiumData, setPremiumData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const testPayment = async () => {
    if (!connected || !wallet || !account) {
      alert("Please connect your wallet first!");
      return;
    }

    setLoading(true);
    setStatus("Requesting premium data...");
    setPremiumData(null);

    try {
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
      setStatus(`Invoice Received: ${invoice.amount} ${invoice.token}. Preparing Shielded Deposit...`);

      // 3. Setup Umbra Client using browser wallet
      const signer = createBrowserSigner(wallet, account);
      const client = await getUmbraClient({
        signer,
        network: NETWORK,
        rpcUrl: RPC_URL,
        rpcSubscriptionsUrl: RPC_WS_URL,
        indexerApiEndpoint: UMBRA_INDEXER_URL,
        deferMasterSeedSignature: true,
      });

      // 4. Execute Stealth Deposit
      setStatus("Generating ZK Proof... (This takes ~20s)");
      const tokenCfg = TOKEN_CONFIG[invoice.token as Token];
      const amountRaw = BigInt(Math.round(invoice.amount * 10 ** tokenCfg.decimals));
      const invoiceIdBytes = new Uint8Array(Buffer.from(invoice.invoiceId, "hex"));

      const utxoProver = getCreateReceiverClaimableUtxoFromPublicBalanceProver(makeZkProverDeps());
      const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
        { client },
        { zkProver: utxoProver }
      );

      // createUtxo returns an object { createUtxoSignature, createProofAccountSignature, ... }
      const result = await createUtxo({
        destinationAddress: invoice.destination as Address,
        mint: tokenCfg.mint as Address,
        amount: amountRaw as any,
      }, {
        optionalData: invoiceIdBytes as any
      });

      console.log("[testPayment] Deposit Result:", result);
      
      const depositTxSig = result.createUtxoSignature;
      const proofTxSig = result.createProofAccountSignature;

      setStatus("Deposit confirmed! Verifying with server...");

      // 5. Retry Request with Proof of Payment
      const finalRes = await fetch("/api/premium-data", {
        headers: {
          "Authorization": `x402 ${proofTxSig}:${depositTxSig}:${invoice.invoiceId}`
        }
      });

      const resultBody = await finalRes.json();
      if (finalRes.ok) {
        setPremiumData(resultBody.data);
        setStatus("Payment Verified! Data Unlocked.");
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
            Purchase Access ({INVOICE_AMOUNT_USDC} USDC)
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
                <p className="text-sm italic">"{premiumData.secretData}"</p>
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
        VeilPay x402 Protocol · Instant Shielded Verification
      </motion.p>
    </div>
  );
}
