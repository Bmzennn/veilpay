"use client";

import { useCallback, useEffect, useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { ConnectWalletButton } from "@/components/WalletModal";
import { useWalletContext } from "@/components/WalletContext";
import {
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
  getEncryptedBalanceQuerierFunction,
  getClaimableUtxoScannerFunction,
  getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction,
  getUmbraRelayer,
  pollClaimUntilTerminal,
} from "@umbra-privacy/sdk";
import {
  createBrowserSigner, makeClient, makeZkProverDeps,
  clearZkCache, getRecentTreeIndices, ensureAssociatedTokenAccount,
  shieldFunds, type U32,
} from "@/lib/umbra";
import { getSolBalance, getPublicTokenBalance } from "@/lib/solana";
import { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver } from "@umbra-privacy/web-zk-prover";
import { UMBRA_RELAYER_URL, TOKEN_CONFIG } from "@/lib/constants";
import type { Token } from "@/types";
import type { Address } from "@solana/kit";
import {
  RefreshCw, Trash2, ArrowDownToLine, Inbox,
  Check, AlertTriangle, Plus, X, Shield, Lock, Unlock,
  ExternalLink,
} from "lucide-react";

type BalanceState = "shared" | "not_shared" | "none";
interface TokenBalance {
  token: Token;
  encryptedRaw: bigint;
  encryptedState: BalanceState;
  publicRaw: bigint;
  withdrawing: boolean;
  shielding: boolean;
}

function formatAmount(raw: bigint, decimals: number): string {
  if (raw === 0n) return "—";
  const n = Number(raw) / 10 ** decimals;
  return decimals >= 6 ? n.toFixed(2) : n.toFixed(4);
}

function formatSol(raw: bigint): string {
  const n = Number(raw) / 1e9;
  return n.toFixed(4);
}

const ALL_TOKENS = Object.keys(TOKEN_CONFIG) as Token[];

const TOKEN_LOGOS: Record<Token, string> = {
  SOL: "/tokens/sol.png", USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  BONK: "/tokens/bonk.png", JUP: "/tokens/jup.png", WIF: "/tokens/wif.png",
};

const CLAIMED_UTXOS_KEY = "vp_claimed_utxo_indices";
const MAX_LEAVES_PER_TREE = 1n << 20n;

// ─── Withdraw modal ───────────────────────────────────────────────────────────

interface WithdrawModalProps {
  token: Token;
  maxHuman: string;
  onClose: () => void;
  onConfirm: (amount: string) => void;
}

function WithdrawModal({ token, maxHuman, onClose, onConfirm }: WithdrawModalProps) {
  const [amount, setAmount] = useState("");
  const overMax = amount !== "" && parseFloat(amount) > parseFloat(maxHuman);
  const isEmpty = !amount || parseFloat(amount) <= 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="card glass"
        style={{ width: "100%", maxWidth: 420, padding: 0, overflow: "hidden", boxShadow: "0 24px 48px -12px rgba(0,0,0,0.55)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TOKEN_LOGOS[token]} alt={token} style={{ width: 28, height: 28, borderRadius: "50%" }} />
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Withdraw {token}</p>
              <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>Encrypted → public wallet</p>
            </div>
          </div>
          <button style={{ padding: 6, borderRadius: 8, background: "var(--glass-bg)", border: "0.5px solid var(--hairline)", cursor: "pointer", display: "flex", alignItems: "center" }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Amount input */}
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8 }}>
            Amount
          </label>
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              type="number"
              placeholder="0.00"
              className="modal-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !overMax && !isEmpty) onConfirm(amount); }}
            />
            <button
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 6, background: "rgba(0,179,255,0.12)", border: "0.5px solid rgba(0,179,255,0.25)", color: "var(--vp-sky-deep)", cursor: "pointer" }}
              onClick={() => setAmount(maxHuman)}
            >
              MAX
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Available: <strong style={{ color: "var(--ink-2)" }}>{maxHuman} {token}</strong></span>
            {overMax && <span style={{ fontSize: 11, color: "#dc2626" }}>Exceeds balance</span>}
          </div>

          {/* Info pill */}
          <div style={{ marginTop: 20, marginBottom: 24, padding: "10px 14px", background: "rgba(0,179,255,0.06)", border: "0.5px solid rgba(0,179,255,0.18)", borderRadius: "var(--radius-sm)", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Unlock size={14} style={{ color: "var(--vp-sky-deep)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11.5, color: "var(--vp-sky-deep)", margin: 0, lineHeight: 1.5 }}>
              Moves funds from your <strong>shielded balance</strong> to your <strong>public wallet</strong> address on-chain.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-glass" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              disabled={overMax || isEmpty}
              onClick={() => onConfirm(amount)}
            >
              <ArrowDownToLine size={14} /> Confirm Withdrawal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shield modal ─────────────────────────────────────────────────────────────

interface ShieldModalProps {
  token: Token;
  maxHuman: string;
  onClose: () => void;
  onConfirm: (amount: string) => void;
}

function ShieldModal({ token, maxHuman, onClose, onConfirm }: ShieldModalProps) {
  const [amount, setAmount] = useState("");
  const overMax = amount !== "" && parseFloat(amount) > parseFloat(maxHuman);
  const isEmpty = !amount || parseFloat(amount) <= 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="card glass"
        style={{ width: "100%", maxWidth: 420, padding: 0, overflow: "hidden", boxShadow: "0 24px 48px -12px rgba(0,0,0,0.55)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--hairline)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TOKEN_LOGOS[token]} alt={token} style={{ width: 28, height: 28, borderRadius: "50%" }} />
            <div>
              <p style={{ fontSize: 15, fontWeight: 600, margin: 0 }}>Shield {token}</p>
              <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>Public wallet → encrypted balance</p>
            </div>
          </div>
          <button style={{ padding: 6, borderRadius: 8, background: "var(--glass-bg)", border: "0.5px solid var(--hairline)", cursor: "pointer", display: "flex", alignItems: "center" }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 24 }}>
          {/* Amount input */}
          <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-3)", marginBottom: 8 }}>
            Amount
          </label>
          <div style={{ position: "relative" }}>
            <input
              autoFocus
              type="number"
              placeholder="0.00"
              className="modal-input"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !overMax && !isEmpty) onConfirm(amount); }}
            />
            <button
              style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "3px 8px", borderRadius: 6, background: "rgba(107,124,255,0.12)", border: "0.5px solid rgba(107,124,255,0.3)", color: "var(--vp-violet)", cursor: "pointer" }}
              onClick={() => setAmount(maxHuman)}
            >
              MAX
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Available: <strong style={{ color: "var(--ink-2)" }}>{maxHuman} {token}</strong></span>
            {overMax && <span style={{ fontSize: 11, color: "#dc2626" }}>Exceeds balance</span>}
          </div>

          {/* Info pill */}
          <div style={{ marginTop: 20, marginBottom: 24, padding: "10px 14px", background: "rgba(107,124,255,0.06)", border: "0.5px solid rgba(107,124,255,0.2)", borderRadius: "var(--radius-sm)", display: "flex", gap: 10, alignItems: "flex-start" }}>
            <Shield size={14} style={{ color: "var(--vp-violet)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11.5, color: "var(--vp-violet)", margin: 0, lineHeight: 1.5 }}>
              Moves funds from your <strong>public wallet</strong> into your <strong>encrypted balance</strong>. The amount is hidden on-chain.
            </p>
          </div>

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-glass" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
            <button
              className="btn btn-primary"
              style={{ flex: 2, background: "linear-gradient(180deg, #8b92ff, var(--vp-violet))", boxShadow: "0 8px 24px -8px rgba(107,124,255,0.5), 0 0 0 1px rgba(107,124,255,0.3)" }}
              disabled={overMax || isEmpty}
              onClick={() => onConfirm(amount)}
            >
              <Shield size={14} /> Confirm Shield
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard page ───────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { wallet, account, connected } = useWalletContext();

  const [balances, setBalances] = useState<TokenBalance[]>(
    ALL_TOKENS.map((t) => ({
      token: t,
      encryptedRaw: 0n,
      encryptedState: "none",
      publicRaw: 0n,
      withdrawing: false,
      shielding: false,
    }))
  );

  const [tokenPrices, setTokenPrices] = useState<Record<Token, number>>(
    Object.fromEntries(ALL_TOKENS.map((t) => [t, 0])) as Record<Token, number>
  );
  const [pendingUtxoCount, setPendingUtxoCount] = useState(0);
  const [pendingUtxoSol, setPendingUtxoSol] = useState(0n);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Modal state
  const [withdrawModal, setWithdrawModal] = useState<Token | null>(null);
  const [shieldModal, setShieldModal] = useState<Token | null>(null);

  const getClaimedIndices = useCallback((): Set<string> => {
    if (typeof window === "undefined") return new Set();
    const stored = localStorage.getItem(CLAIMED_UTXOS_KEY);
    if (!stored) return new Set();
    try { return new Set(JSON.parse(stored)); } catch { return new Set(); }
  }, []);

  const markAsClaimed = useCallback((absoluteIndex: string) => {
    if (typeof window === "undefined") return;
    const current = getClaimedIndices();
    current.add(absoluteIndex);
    localStorage.setItem(CLAIMED_UTXOS_KEY, JSON.stringify(Array.from(current)));
  }, [getClaimedIndices]);

  const refresh = useCallback(async () => {
    if (!connected || !wallet || !account) return;
    setGlobalLoading(true);
    setStatus("Scanning balances…");
    setError("");
    try {
      const signer = createBrowserSigner(wallet, account);
      const client = await makeClient(signer as Parameters<typeof makeClient>[0]);

      // Fetch encrypted balances
      const querier = getEncryptedBalanceQuerierFunction({ client });
      const mints = ALL_TOKENS.map((t) => TOKEN_CONFIG[t].mint as Address);
      const balMap = await querier(mints);

      // Fetch public balances in parallel
      const publicBalancePromises = ALL_TOKENS.map(async (token) => {
        if (token === "SOL") {
          const sol = await getSolBalance(account.address);
          return { token, raw: BigInt(Math.round(sol * 1e9)) };
        }
        const raw = await getPublicTokenBalance(account.address, TOKEN_CONFIG[token].mint);
        return { token, raw };
      });
      const publicResults = await Promise.all(publicBalancePromises);
      const publicMap = Object.fromEntries(publicResults.map((r) => [r.token, r.raw])) as Record<Token, bigint>;

      setBalances(ALL_TOKENS.map((token) => {
        const mint = TOKEN_CONFIG[token].mint as Address;
        const res = balMap.get(mint);
        let encryptedRaw = 0n;
        let encryptedState: BalanceState = "none";
        if (res) {
          if (res.state === "shared" && res.balance !== undefined && res.balance !== null) {
            encryptedRaw = BigInt(res.balance.toString());
          }
          encryptedState = (res.state === "shared" || res.state === "mxe" ? res.state : "none") as BalanceState;
        }
        return {
          token,
          encryptedRaw,
          encryptedState,
          publicRaw: publicMap[token] ?? 0n,
          withdrawing: false,
          shielding: false,
        };
      }));

      // Fetch pending UTXOs
      const scanner = getClaimableUtxoScannerFunction({ client });
      const treeIndices = await getRecentTreeIndices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let rawUtxos: any[] = [];
      for (const idx of treeIndices) {
        const r = await scanner(idx as U32, 0n as U32);
        if (r && r.publicReceived) rawUtxos = rawUtxos.concat(r.publicReceived);
      }
      const claimedIndices = getClaimedIndices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filteredUtxos = rawUtxos.filter((u: any) => {
        if (!u || u.treeIndex === undefined || u.insertionIndex === undefined) return false;
        const absIdx = BigInt(u.treeIndex) * MAX_LEAVES_PER_TREE + BigInt(u.insertionIndex);
        return !claimedIndices.has(absIdx.toString());
      });
      setPendingUtxoCount(filteredUtxos.length);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setPendingUtxoSol(filteredUtxos.reduce((s: bigint, u: any) => {
        const amt = (u && u.amount) ? BigInt(u.amount.toString()) : 0n;
        return s + amt;
      }, 0n));

      setStatus("");
    } catch (e) {
      setError(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGlobalLoading(false);
    }
  }, [wallet, account, connected, getClaimedIndices]);

  useEffect(() => { if (connected) refresh(); }, [connected, refresh]);

  useEffect(() => {
    const tokensWithBalance = balances.filter((b) => b.encryptedRaw > 0n || b.publicRaw > 0n).map((b) => b.token);
    if (tokensWithBalance.length === 0) return;
    fetch(`/api/prices?tokens=${tokensWithBalance.join(",")}`, { signal: AbortSignal.timeout(8000) })
      .then((r) => r.ok ? r.json() : null)
      .then((json) => { if (json) setTokenPrices(json as Record<Token, number>); })
      .catch(() => {});
  }, [balances]);

  // ── Withdraw ────────────────────────────────────────────────────────────────

  const withdraw = async (token: Token, amountStr: string) => {
    if (!connected || !wallet || !account) return;
    setWithdrawModal(null);
    setError("");
    const tokenCfg = TOKEN_CONFIG[token];
    setBalances((prev) => prev.map((b) => b.token === token ? { ...b, withdrawing: true } : b));
    setStatus(`Preparing ${token} token account…`);
    try {
      const signer = createBrowserSigner(wallet, account);
      const client = await makeClient(signer as Parameters<typeof makeClient>[0], { skipPreflight: true });
      await ensureAssociatedTokenAccount(wallet, account, tokenCfg.mint);
      setStatus(`Withdrawing ${token} to your public wallet…`);
      const querier = getEncryptedBalanceQuerierFunction({ client });
      const mint = tokenCfg.mint as Address;
      const withdrawFn = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
      const MAX_ATTEMPTS = 3;
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          setStatus(`Retrying withdrawal (${attempt}/${MAX_ATTEMPTS})…`);
          await new Promise((r) => setTimeout(r, 1500));
        }
        try {
          const freshBalMap = await querier([mint]);
          const freshBal = freshBalMap.get(mint);
          if (!freshBal || freshBal.state !== "shared" || freshBal.balance === undefined || freshBal.balance === null || BigInt(freshBal.balance.toString()) === 0n) {
            throw new Error(`No ${token} balance available to withdraw.`);
          }
          const availableRaw = BigInt(freshBal.balance.toString());
          const requestedRaw = BigInt(Math.round(parseFloat(amountStr) * 10 ** tokenCfg.decimals));
          if (requestedRaw > availableRaw) {
            const availHuman = (Number(availableRaw) / 10 ** tokenCfg.decimals).toFixed(tokenCfg.decimals === 6 ? 2 : 4);
            throw new Error(`Insufficient balance. Max available: ${availHuman} ${token}`);
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await withdrawFn(account.address as Address, mint, requestedRaw as any);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
          const isRetryable = msg.includes("timeout") || msg.includes("timed out") || msg.includes("block height") || msg.includes("blockhash") || msg.includes("expired") || msg.includes("unexpected response format") || msg.includes("rpc error") || msg.includes("fetch");
          if (attempt === MAX_ATTEMPTS || !isRetryable) break;
        }
      }
      if (lastErr) throw lastErr;
      setStatus(`${token} withdrawn successfully.`);
      await refresh();
    } catch (e) {
      setError(`Withdrawal failed: ${e instanceof Error ? e.message : String(e)}`);
      setStatus("");
    } finally {
      setBalances((prev) => prev.map((b) => b.token === token ? { ...b, withdrawing: false } : b));
    }
  };

  // ── Shield ──────────────────────────────────────────────────────────────────

  const shield = async (token: Token, amountStr: string) => {
    if (!connected || !wallet || !account) return;
    setShieldModal(null);
    setError("");
    setBalances((prev) => prev.map((b) => b.token === token ? { ...b, shielding: true } : b));
    try {
      await shieldFunds({
        wallet,
        account,
        token,
        amountHuman: amountStr,
        onStatusChange: setStatus,
      });
      setStatus(`${token} shielded successfully.`);
      await refresh();
    } catch (e) {
      setError(`Shield failed: ${e instanceof Error ? e.message : String(e)}`);
      setStatus("");
    } finally {
      setBalances((prev) => prev.map((b) => b.token === token ? { ...b, shielding: false } : b));
    }
  };

  // ── Claim pending UTXOs ─────────────────────────────────────────────────────

  const claimPending = async () => {
    if (!connected || !wallet || !account || pendingUtxoCount === 0) return;
    setClaimLoading(true);
    setError("");
    setStatus("Claiming pending payments into encrypted balance…");
    try {
      const signer = createBrowserSigner(wallet, account);
      const client = await makeClient(signer as Parameters<typeof makeClient>[0], { skipPreflight: true });
      const scanner = getClaimableUtxoScannerFunction({ client });
      const treeIndices = await getRecentTreeIndices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let utxos: any[] = [];
      for (const idx of treeIndices) {
        const r = await scanner(idx as U32, 0n as U32);
        if (r && r.publicReceived) utxos = utxos.concat(r.publicReceived);
      }
      const claimedIndices = getClaimedIndices();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filtered = utxos.filter((u: any) => {
        if (!u || u.treeIndex === undefined || u.insertionIndex === undefined) return false;
        const absIdx = BigInt(u.treeIndex) * MAX_LEAVES_PER_TREE + BigInt(u.insertionIndex);
        return !claimedIndices.has(absIdx.toString());
      });
      if (filtered.length === 0) { setStatus("No pending payments found."); setPendingUtxoCount(0); return; }

      const relayer = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER_URL });
      const claimProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(makeZkProverDeps());
      const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
        { client },
        { fetchBatchMerkleProof: client.fetchBatchMerkleProof!, zkProver: claimProver, relayer }
      );
      for (let i = 0; i < filtered.length; i++) {
        let attempt = 1;
        const maxAttempts = 3;
        let success = false;
        while (attempt <= maxAttempts && !success) {
          setStatus(`Claiming payment ${i + 1} of ${filtered.length}${attempt > 1 ? ` (attempt ${attempt}/${maxAttempts})` : ""}…`);
          try {
            const result = await claim([filtered[i]]);
            for (const [, b] of result.batches) {
              const final = await pollClaimUntilTerminal((rid) => relayer.pollClaimStatus(rid), b.requestId);
              if (final.status === "failed") {
                const burnt = final.failureReason?.includes("0x6d64") || final.failureReason?.includes("NullifierAlreadyBurnt");
                if (burnt) { success = true; break; }
                const isRpcError = final.failureReason?.toLowerCase().includes("rpc error") || final.failureReason?.toLowerCase().includes("response format") || final.failureReason?.toLowerCase().includes("fetch");
                if (isRpcError && attempt < maxAttempts) { attempt++; await new Promise((r) => setTimeout(r, 2000 * (attempt - 1))); continue; }
                throw new Error(`Claim failed: ${final.failureReason ?? "Unknown failure"}`);
              }
            }
            success = true;
            if (filtered[i]?.treeIndex !== undefined && filtered[i]?.insertionIndex !== undefined) {
              const absIdx = BigInt(filtered[i].treeIndex) * MAX_LEAVES_PER_TREE + BigInt(filtered[i].insertionIndex);
              markAsClaimed(absIdx.toString());
            }
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes("0x6d64") || msg.includes("NullifierAlreadyBurnt")) {
              success = true;
              if (filtered[i]?.treeIndex !== undefined && filtered[i]?.insertionIndex !== undefined) {
                const absIdx = BigInt(filtered[i].treeIndex) * MAX_LEAVES_PER_TREE + BigInt(filtered[i].insertionIndex);
                markAsClaimed(absIdx.toString());
              }
              break;
            }
            const isRpcError = msg.toLowerCase().includes("rpc error") || msg.toLowerCase().includes("response format") || msg.toLowerCase().includes("fetch") || msg.toLowerCase().includes("failed to fetch");
            if (isRpcError && attempt < maxAttempts) { attempt++; await new Promise((r) => setTimeout(r, 2000 * (attempt - 1))); continue; }
            throw e;
          }
        }
      }
      setStatus("Claimed. Refreshing balances…");
      await new Promise((r) => setTimeout(r, 8000));
      await refresh();
    } catch (e) {
      setError(`Claim failed: ${e instanceof Error ? e.message : String(e)}`);
      setStatus("");
    } finally {
      setClaimLoading(false);
    }
  };

  // ── Derived values ──────────────────────────────────────────────────────────

  const withdrawableBals = balances.filter((b) => b.encryptedRaw > 0n && b.encryptedState === "shared");
  const shieldableBals = balances.filter((b) => b.publicRaw > 0n);

  const encryptedTotalUsd = balances.reduce((sum, b) => {
    if (b.encryptedRaw === 0n) return sum;
    return sum + (Number(b.encryptedRaw) / 10 ** TOKEN_CONFIG[b.token].decimals) * (tokenPrices[b.token] ?? 0);
  }, 0);
  const publicSolBalance = balances.find((b) => b.token === "SOL")?.publicRaw ?? 0n;

  const hasPrices = Object.values(tokenPrices).some((p) => p > 0);
  const hasEncryptedBalance = withdrawableBals.length > 0;
  const encryptedUsdDisplay = !hasEncryptedBalance ? "$0.00" : !hasPrices ? "$—" : `$${encryptedTotalUsd < 0.01 ? encryptedTotalUsd.toFixed(4) : encryptedTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const withdrawModalBal = withdrawModal ? balances.find((b) => b.token === withdrawModal) : null;
  const withdrawMaxHuman = withdrawModalBal ? formatAmount(withdrawModalBal.encryptedRaw, TOKEN_CONFIG[withdrawModal!].decimals) : "0";

  const shieldModalBal = shieldModal ? balances.find((b) => b.token === shieldModal) : null;
  const shieldMaxHuman = shieldModalBal
    ? (shieldModal === "SOL"
        ? formatSol(shieldModalBal.publicRaw)
        : formatAmount(shieldModalBal.publicRaw, TOKEN_CONFIG[shieldModal!].decimals))
    : "0";

  return (
    <AppShell active="dashboard">
      {/* ── Header ── */}
      <section className="app-head">
        <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <span className="eyebrow">Dashboard</span>
            <h1 className="h2">Your <em>shielded</em> account.</h1>
            <p className="lead">Private balances are client-side only — nothing is visible on-chain.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/create" className="btn btn-primary btn-sm"><Plus size={13} /> Send</a>
            <button className="btn btn-glass btn-sm" onClick={() => clearZkCache().then(() => setStatus("ZK cache cleared."))} title="Clear ZK cache"><Trash2 size={13} /></button>
            <button className="btn btn-glass btn-sm" onClick={refresh} disabled={globalLoading} title="Refresh">
              <RefreshCw size={13} style={{ animation: globalLoading ? "spin 1s linear infinite" : "none" }} />
            </button>
          </div>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {!connected ? (
            <div className="card glass" style={{ padding: 64, textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 96, height: 96, objectFit: "contain", opacity: 0.4 }} />
              <p style={{ color: "var(--ink-3)", margin: 0 }}>Connect your wallet to view your balances.</p>
              <ConnectWalletButton variant="primary" />
            </div>
          ) : (
            <>
              {/* ── Pending UTXOs banner ── */}
              {pendingUtxoCount > 0 && (
                <div className="card glass" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 20px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 10, background: "rgba(245,158,11,0.12)", border: "0.5px solid rgba(245,158,11,0.25)", color: "#d97706", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Inbox size={15} />
                    </div>
                    <div>
                      <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0 }}>{pendingUtxoCount} pending payment{pendingUtxoCount > 1 ? "s" : ""}</p>
                      <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: 0 }}>{(Number(pendingUtxoSol) / 1e9).toFixed(4)} SOL waiting to enter encrypted balance</p>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={claimPending} disabled={claimLoading}>
                    {claimLoading ? "Claiming…" : "Claim now"}
                  </button>
                </div>
              )}

              {/* ── Balance overview cards ── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, alignItems: "stretch" }} className="dash-overview">
                {/* Encrypted balance */}
                <div className="card glass card-pad-lg reveal in" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(0,179,255,0.12)", border: "0.5px solid rgba(0,179,255,0.25)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Lock size={13} style={{ color: "var(--vp-sky-deep)" }} />
                    </div>
                    <span className="stat-label" style={{ margin: 0 }}>Encrypted Balance</span>
                  </div>

                  <div className="stat-value" style={{ fontSize: 38, lineHeight: 1.1 }}><em>{encryptedUsdDisplay}</em></div>

                  <div style={{ marginTop: 16, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    {balances.filter((b) => b.encryptedRaw > 0n).length > 0 ? (
                      balances.filter((b) => b.encryptedRaw > 0n).map((b) => (
                        <div key={b.token} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={TOKEN_LOGOS[b.token]} alt={b.token} style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)", flex: 1 }}>
                            <strong style={{ fontFamily: "var(--font-mono)" }}>{formatAmount(b.encryptedRaw, TOKEN_CONFIG[b.token].decimals)}</strong> {b.token}
                          </span>
                          {b.encryptedState !== "shared" && (
                            <span style={{ fontSize: 10, color: "#d97706", background: "rgba(245,158,11,0.1)", padding: "1px 6px", borderRadius: 4, flexShrink: 0 }}>pending</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--ink-4)", margin: 0 }}>No encrypted balance yet.</p>
                    )}
                  </div>

                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "0.5px solid var(--hairline)" }}>
                    <button
                      className="btn btn-glass btn-sm"
                      style={{ width: "100%", justifyContent: "center", fontSize: 12, gap: 6 }}
                      disabled={!hasEncryptedBalance}
                      onClick={() => { const t = withdrawableBals[0]?.token; if (t) setWithdrawModal(t); }}
                    >
                      <ArrowDownToLine size={12} /> Withdraw to wallet
                    </button>
                  </div>
                </div>

                {/* Public balance */}
                <div className="card glass card-pad-lg reveal in" style={{ display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(107,124,255,0.1)", border: "0.5px solid rgba(107,124,255,0.22)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Unlock size={13} style={{ color: "var(--vp-violet)" }} />
                    </div>
                    <span className="stat-label" style={{ margin: 0 }}>Public Balance</span>
                  </div>

                  <div className="stat-value" style={{ fontSize: 38, lineHeight: 1.1 }}>
                    <em style={{ color: "var(--vp-violet)" }}>{formatSol(publicSolBalance)}</em>
                    <span style={{ fontSize: 15, color: "var(--ink-3)", fontFamily: "var(--font-sans)", fontWeight: 400, fontStyle: "normal", marginLeft: 6 }}>SOL</span>
                  </div>

                  <div style={{ marginTop: 16, flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                    {balances.filter((b) => b.token !== "SOL" && b.publicRaw > 0n).length > 0 ? (
                      balances.filter((b) => b.token !== "SOL" && b.publicRaw > 0n).map((b) => (
                        <div key={b.token} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={TOKEN_LOGOS[b.token]} alt={b.token} style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0 }} />
                          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink-2)" }}>
                            <strong style={{ fontFamily: "var(--font-mono)" }}>{formatAmount(b.publicRaw, TOKEN_CONFIG[b.token].decimals)}</strong> {b.token}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--ink-4)", margin: 0 }}>Only SOL detected.</p>
                    )}
                  </div>

                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: "0.5px solid var(--hairline)" }}>
                    <button
                      className="btn btn-sm"
                      style={{ width: "100%", justifyContent: "center", fontSize: 12, gap: 6, background: "rgba(107,124,255,0.1)", border: "0.5px solid rgba(107,124,255,0.3)", color: "var(--vp-violet)", borderRadius: "var(--radius-pill)", cursor: shieldableBals.length === 0 ? "not-allowed" : "pointer", opacity: shieldableBals.length === 0 ? 0.4 : 1 }}
                      disabled={shieldableBals.length === 0}
                      onClick={() => { const t = shieldableBals[0]?.token; if (t) setShieldModal(t); }}
                    >
                      <Shield size={12} /> Shield to encrypted
                    </button>
                  </div>
                </div>
              </div>

              {/* ── Token table ── */}
              <div className="card glass reveal in" style={{ padding: 0, overflow: "hidden" }}>
                {/* Header row — columns must exactly mirror data rows */}
                <div className="bal-row bal-header">
                  <span style={{ gridArea: "token" }}>Token</span>
                  <span style={{ gridArea: "pub", textAlign: "right" }}>Public</span>
                  <span style={{ gridArea: "enc", textAlign: "right" }}>Encrypted</span>
                  <span style={{ gridArea: "shield" }} />
                  <span style={{ gridArea: "withdraw" }} />
                </div>

                {balances.map((b) => {
                  const cfg = TOKEN_CONFIG[b.token];
                  const isWithdrawable = b.encryptedState === "shared" && b.encryptedRaw > 0n;
                  const isShieldable = b.publicRaw > 0n;
                  const publicDisplay = b.token === "SOL"
                    ? (b.publicRaw > 0n ? formatSol(b.publicRaw) : "—")
                    : formatAmount(b.publicRaw, cfg.decimals);
                  const encDisplay = formatAmount(b.encryptedRaw, cfg.decimals);
                  const isBusy = b.withdrawing || b.shielding;

                  return (
                    <div key={b.token} className="bal-row bal-data">
                      {/* Token identity */}
                      <div style={{ gridArea: "token", display: "flex", alignItems: "center", gap: 12 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={TOKEN_LOGOS[b.token]} alt={b.token} style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                        <div>
                          <p style={{ fontSize: 13.5, fontWeight: 500, margin: 0 }}>{b.token}</p>
                          <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>{cfg.name}</p>
                        </div>
                      </div>

                      {/* Public balance */}
                      <div style={{ gridArea: "pub", textAlign: "right" }}>
                        <p style={{ fontSize: 13, fontFamily: "var(--font-mono)", margin: 0, color: isShieldable ? "var(--ink)" : "var(--ink-4)" }}>{publicDisplay}</p>
                        <p style={{ fontSize: 9.5, color: "var(--ink-4)", margin: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>Public</p>
                      </div>

                      {/* Encrypted balance */}
                      <div style={{ gridArea: "enc", textAlign: "right" }}>
                        <p style={{ fontSize: 13, fontFamily: "var(--font-mono)", margin: 0, color: isWithdrawable ? "var(--vp-sky-deep)" : "var(--ink-4)" }}>{encDisplay}</p>
                        {b.encryptedRaw > 0n && b.encryptedState !== "shared"
                          ? <p style={{ fontSize: 9.5, color: "#d97706", margin: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>Pending</p>
                          : <p style={{ fontSize: 9.5, color: "var(--ink-4)", margin: 0, letterSpacing: "0.05em", textTransform: "uppercase" }}>Encrypted</p>
                        }
                      </div>

                      {/* Shield */}
                      <div style={{ gridArea: "shield" }}>
                        <button
                          className="btn btn-glass btn-sm bal-action"
                          disabled={!isShieldable || isBusy}
                          onClick={() => setShieldModal(b.token)}
                          style={isShieldable && !isBusy ? { border: "0.5px solid rgba(107,124,255,0.35)", color: "var(--vp-violet)" } : {}}
                        >
                          {b.shielding ? "…" : <><Shield size={11} /> Shield</>}
                        </button>
                      </div>

                      {/* Withdraw */}
                      <div style={{ gridArea: "withdraw" }}>
                        <button
                          className="btn btn-glass btn-sm bal-action"
                          disabled={!isWithdrawable || isBusy}
                          onClick={() => setWithdrawModal(b.token)}
                        >
                          {b.withdrawing ? "…" : <><ArrowDownToLine size={11} /> Withdraw</>}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── Status / Error ── */}
              {(status || error) && (
                <div style={{ display: "flex", alignItems: "start", gap: 12, padding: "12px 16px", borderRadius: "var(--radius-md)", border: "0.5px solid", ...(error ? { background: "rgba(220,38,38,0.06)", borderColor: "rgba(220,38,38,0.2)", color: "#dc2626" } : { background: "rgba(0,179,255,0.06)", borderColor: "rgba(0,179,255,0.2)", color: "var(--vp-sky-deep)" }) }}>
                  {error
                    ? <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                    : <Check size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                  }
                  <p style={{ fontSize: 12.5, margin: 0, lineHeight: 1.5 }}>{error || status}</p>
                  {error && (
                    <button style={{ marginLeft: "auto", flexShrink: 0, padding: 4, borderRadius: 6, background: "transparent", cursor: "pointer", color: "inherit", opacity: 0.6 }} onClick={() => setError("")}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* ── Modals ── */}
      {withdrawModal && withdrawModalBal && (
        <WithdrawModal
          token={withdrawModal}
          maxHuman={withdrawMaxHuman}
          onClose={() => setWithdrawModal(null)}
          onConfirm={(amount) => withdraw(withdrawModal, amount)}
        />
      )}

      {shieldModal && shieldModalBal && (
        <ShieldModal
          token={shieldModal}
          maxHuman={shieldMaxHuman}
          onClose={() => setShieldModal(null)}
          onConfirm={(amount) => shield(shieldModal, amount)}
        />
      )}

      <style jsx global>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Overview cards — equal halves, collapse to single column on mobile */
        .dash-overview { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; align-items: stretch; }
        @media (max-width: 720px) { .dash-overview { grid-template-columns: 1fr; } }

        /* Balance table grid
           columns: [icon+name] [public] [encrypted] [shield btn] [withdraw btn]
           We name each area so header and data rows bind the same grid. */
        .bal-row {
          display: grid;
          grid-template-columns: 1fr 110px 110px 100px 108px;
          grid-template-areas: "token pub enc shield withdraw";
          align-items: center;
          gap: 0 8px;
          padding: 13px 24px;
          border-bottom: 1px solid var(--hairline);
        }
        .bal-header {
          padding: 12px 24px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: var(--ink-4);
        }
        .bal-action {
          width: 100%;
          justify-content: center;
          font-size: 11.5px;
          gap: 5px;
          padding: 7px 10px;
        }
        @media (max-width: 680px) {
          .bal-row { grid-template-columns: 1fr 90px 90px 80px 88px; gap: 0 4px; padding: 12px 16px; }
          .bal-header { padding: 10px 16px; }
        }
        @media (max-width: 520px) {
          .bal-row {
            grid-template-columns: 1fr 80px;
            grid-template-areas:
              "token pub"
              "enc shield"
              ". withdraw";
            padding: 14px 16px;
            gap: 6px 8px;
          }
          .bal-header { display: none; }
        }

        /* Modal overlay */
        .modal-overlay {
          position: fixed;
          inset: 0;
          background: rgba(4, 10, 20, 0.78);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          padding: 20px;
        }
        .modal-input {
          width: 100%;
          background: var(--glass-bg-strong);
          border: 1px solid var(--hairline-strong);
          border-radius: var(--radius-md);
          padding: 14px 64px 14px 18px;
          font-size: 22px;
          font-family: var(--font-mono);
          color: var(--ink);
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s;
        }
        .modal-input:focus {
          border-color: var(--vp-sky);
          box-shadow: 0 0 0 4px rgba(0, 179, 255, 0.12);
        }
        .modal-input[type=number]::-webkit-outer-spin-button,
        .modal-input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        .modal-input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </AppShell>
  );
}
