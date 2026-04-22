"use client";

import { useEffect, useState } from "react";
import { useWalletContext } from "@/components/WalletContext";
import { WalletButton } from "@/components/WalletButton";
import { GlassCard } from "@/components/ui/GlassCard";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { 
  getUmbraClient, 
  getClaimableUtxoScannerFunction,
  getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction,
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
  getEncryptedBalanceQuerierFunction,
  getUmbraRelayer,
  pollClaimUntilTerminal
} from "@umbra-privacy/sdk";
import { createBrowserSigner, makeZkProverDeps, clearZkCache } from "@/lib/umbra";
import { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver } from "@umbra-privacy/web-zk-prover";
import { RPC_URL, RPC_WS_URL, UMBRA_INDEXER_URL, UMBRA_RELAYER_URL, NETWORK, TOKEN_CONFIG } from "@/lib/constants";
import type { Address } from "@solana/kit";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Zap, DollarSign, Activity, LayoutDashboard, Wallet, RefreshCw, CheckCircle2, Trash2 } from "lucide-react";

export default function DashboardPage() {
  const { wallet, account, connected } = useWalletContext();
  const [status, setStatus] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    pendingCount: 0,
    pendingSol: 0n,
    shieldedSol: 0n,
    shieldedUsdc: 0n
  });

  const handleClearCache = async () => {
      if (confirm("This will clear the ZK circuit cache and force a redownload. Use this if you hit 502 errors. Proceed?")) {
          await clearZkCache();
          setStatus("Cache cleared. Ready to retry.");
      }
  };

  const refreshStats = async () => {
    if (!connected || !wallet || !account) return;
    setLoading(true);
    setStatus("Scanning for revenue...");

    try {
      const signer = createBrowserSigner(wallet, account);
      const client = await getUmbraClient({
        signer,
        network: NETWORK,
        rpcUrl: RPC_URL,
        rpcSubscriptionsUrl: RPC_WS_URL,
        indexerApiEndpoint: UMBRA_INDEXER_URL,
        deferMasterSeedSignature: true,
      });

      // 1. Scan for UTXOs
      const scanner = getClaimableUtxoScannerFunction({ client });
      const { publicReceived } = await scanner(0n as any, 0n as any);
      
      const pendingSol = publicReceived.reduce((acc, utxo) => acc + BigInt(utxo.amount.toString()), 0n);

      // 2. Scan for Shielded Balances
      const querier = getEncryptedBalanceQuerierFunction({ client });
      const mints = [
          TOKEN_CONFIG.SOL.mint as Address,
          TOKEN_CONFIG.USDC.mint as Address
      ];
      const balances = await querier(mints);

      const getSafeBalance = (mint: Address) => {
          const res = balances.get(mint);
          return (res && "balance" in res) ? BigInt(res.balance.toString()) : 0n;
      };

      setStats({
        pendingCount: publicReceived.length,
        pendingSol,
        shieldedSol: getSafeBalance(mints[0]),
        shieldedUsdc: getSafeBalance(mints[1])
      });

      setStatus("");
    } catch (e: any) {
      console.error(e);
      setStatus(`Error refreshing: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const settleRevenue = async () => {
    if (!connected || !wallet || !account) return;
    setLoading(true);

    try {
      const signer = createBrowserSigner(wallet, account);
      const client = await getUmbraClient({
        signer,
        network: NETWORK,
        rpcUrl: RPC_URL,
        rpcSubscriptionsUrl: RPC_WS_URL,
        indexerApiEndpoint: UMBRA_INDEXER_URL,
        deferMasterSeedSignature: true,
      });

      // 1. Claim pending UTXOs if any
      const scanner = getClaimableUtxoScannerFunction({ client });
      const { publicReceived } = await scanner(0n as any, 0n as any);

      if (publicReceived.length > 0) {
        setStatus(`Breaking links for ${publicReceived.length} payments...`);
        const relayer = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER_URL });
        const claimProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(makeZkProverDeps());

        const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
            { client },
            {
                fetchBatchMerkleProof: client.fetchBatchMerkleProof!,
                zkProver: claimProver,
                relayer,
            }
        );

        const claimResult = await claim(publicReceived);
        for (const [, batch] of claimResult.batches) {
            await pollClaimUntilTerminal((rid) => relayer.pollClaimStatus(rid), batch.requestId);
        }
        setStatus("ZK Proofs verified! Waiting for propagation...");
        await new Promise(r => setTimeout(r, 15000));
      }

      // 2. Withdraw total balance
      setStatus("Withdrawing funds to public wallet...");
      const querier = getEncryptedBalanceQuerierFunction({ client });
      const mints = [TOKEN_CONFIG.SOL.mint as Address, TOKEN_CONFIG.USDC.mint as Address];
      const balances = await querier(mints);
      const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });

      for (const mint of mints) {
        const bal = balances.get(mint);
        if (bal && "balance" in bal && BigInt(bal.balance.toString()) > 0n) {
            await withdraw(account.address as Address, mint, bal.balance as any);
        }
      }

      setStatus("Success! Revenue settled.");
      await refreshStats();
    } catch (e: any) {
      console.error(e);
      setStatus(`Settlement failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (connected) refreshStats();
  }, [connected]);

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-20">
      <motion.div
        className="w-full max-w-4xl space-y-10"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-[#00b3ff15] border border-[#00b3ff25]">
                <LayoutDashboard className="w-4 h-4 text-[#00b3ff]" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight">Provider Dashboard</h1>
            </div>
            <p className="text-black/40 text-sm">Manage your private x402 revenue stream.</p>
          </div>
          <div className="flex items-center gap-3">
             <Trash2 
                className="w-5 h-5 text-black/20 cursor-pointer hover:text-red-400 transition-colors" 
                onClick={handleClearCache}
                title="Clear ZK Cache"
             />
             <RefreshCw 
                className={`w-5 h-5 text-black/20 cursor-pointer hover:text-black/40 transition-colors ${loading ? 'animate-spin' : ''}`} 
                onClick={refreshStats}
                title="Refresh Stats"
             />
             <WalletButton />
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Revenue Card */}
          <GlassCard className="md:col-span-2 p-8" glow="cyan">
            <div className="flex items-center justify-between mb-8">
               <div className="flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-black/40" />
                  <span className="text-xs font-bold uppercase tracking-widest text-black/30">Total Unsettled Revenue</span>
               </div>
               <Shield className="w-4 h-4 text-[#00b3ff] opacity-50" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
               <div className="space-y-1">
                  <p className="text-4xl font-bold tracking-tighter">
                    {(Number(stats.pendingSol + stats.shieldedSol) / 1e9).toFixed(3)}
                    <span className="text-lg text-black/20 ml-2">SOL</span>
                  </p>
                  <p className="text-xs text-black/40">From {stats.pendingCount} private payments</p>
               </div>
               <div className="space-y-1">
                  <p className="text-4xl font-bold tracking-tighter">
                    {(Number(stats.shieldedUsdc) / 1e9).toFixed(2)}
                    <span className="text-lg text-black/20 ml-2">USDC</span>
                  </p>
                  <p className="text-xs text-black/40">Ready to withdraw</p>
               </div>
            </div>

            <div className="mt-10 pt-8 border-t border-black/[0.05]">
                <LiquidButton 
                    fullWidth 
                    onClick={settleRevenue} 
                    loading={loading}
                    disabled={!connected || (stats.pendingCount === 0 && stats.shieldedSol === 0n && stats.shieldedUsdc === 0n)}
                >
                    <Zap className="w-4 h-4" />
                    Settle All Revenue
                </LiquidButton>
            </div>
          </GlassCard>

          {/* Status Sidebar */}
          <div className="space-y-6">
             <GlassCard className="p-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-black/30 mb-4 flex items-center gap-2">
                   <Activity className="w-3 h-3" />
                   On-Chain Pipeline
                </h3>
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                      <span className="text-sm text-black/40">In Pool</span>
                      <span className="text-sm font-medium">{(Number(stats.pendingSol) / 1e9).toFixed(3)} SOL</span>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-sm text-black/40">Shielded</span>
                      <span className="text-sm font-medium">{(Number(stats.shieldedSol) / 1e9).toFixed(3)} SOL</span>
                   </div>
                   <div className="flex items-center justify-between">
                      <span className="text-sm text-black/40">USDC</span>
                      <span className="text-sm font-medium">{(Number(stats.shieldedUsdc) / 1e9).toFixed(2)}</span>
                   </div>
                </div>
             </GlassCard>

             <AnimatePresence>
                {status && (
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className={`p-4 rounded-2xl border text-xs font-medium flex gap-3 ${
                            status.includes("Error") || status.includes("failed")
                            ? "bg-red-50 text-red-600 border-red-100"
                            : "bg-[#00b3ff]/5 text-[#00b3ff] border-[#00b3ff]/10"
                        }`}
                    >
                        <Activity className="w-4 h-4 shrink-0 mt-0.5 animate-pulse" />
                        <p className="leading-relaxed">{status}</p>
                    </motion.div>
                )}
             </AnimatePresence>
          </div>
        </div>

        {/* Documentation Footer */}
        <div className="p-8 bg-black/[0.02] border border-black/[0.05] rounded-[32px] space-y-4">
            <h4 className="text-sm font-bold flex items-center gap-2 text-black/60">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Security Verification
            </h4>
            <p className="text-xs text-black/40 leading-relaxed max-w-2xl">
                VeilPay uses Direct Stealth Routing. Your revenue is verified instantly via ECDH 
                decryption of the ZK proof payload, allowing sub-second API responses while the 
                funds remain in the shielded pool. Click &quot;Settle All Revenue&quot; to finalize 
                settlement into your public wallet.
            </p>
        </div>
      </motion.div>
    </div>
  );
}
