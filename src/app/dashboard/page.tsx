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
  shieldFunds, auditLinkStatus,
  type U32, type LinkAuditResult,
} from "@/lib/umbra";
import { getSolBalance, getPublicTokenBalance } from "@/lib/solana";
import { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver } from "@umbra-privacy/web-zk-prover";
import { UMBRA_RELAYER_URL, TOKEN_CONFIG } from "@/lib/constants";
import type { Token } from "@/types";
import type { Address } from "@solana/kit";
import {
  RefreshCw, Trash2, ArrowDownToLine, Inbox,
  Check, AlertTriangle, Plus, X, Shield, Lock, Unlock,
  ExternalLink, Wallet, ArrowLeftRight, Key, Search, Clock,
  Eye, EyeOff, Layers, ArrowRight as ArrowRightIcon,
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
  return n.toFixed(4);
}

function formatSol(raw: bigint): string {
  const n = Number(raw) / 1e9;
  return n.toFixed(4);
}

const ALL_TOKENS = Object.keys(TOKEN_CONFIG) as Token[];

const TOKEN_LOGOS: Record<Token, string> = {
  SOL: "/tokens/sol.png", USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  UMBRA: "/tokens/umbra.png", CASH: "/tokens/cash.png",
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
              placeholder="0.0000"
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
              placeholder="0.0000"
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

  // ── Flip card state ──────────────────────────────────────────────────────────
  const [face, setFace] = useState<"encrypted" | "public">("encrypted");
  const [isFlipping, setIsFlipping] = useState(false);
  const [cipherActive, setCipherActive] = useState(false);
  const [cipherTick, setCipherTick] = useState(0); // increments to drive re-renders
  const flipTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cipherInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleFlip = useCallback(() => {
    if (isFlipping) return;
    setIsFlipping(true);
    // t=250ms: start cipher scramble on incoming face
    const t1 = setTimeout(() => {
      setCipherActive(true);
      cipherInterval.current = setInterval(() => setCipherTick(n => n + 1), 40);
    }, 250);
    // t=370ms: resolve cipher + swap face
    const t2 = setTimeout(() => {
      if (cipherInterval.current) { clearInterval(cipherInterval.current); cipherInterval.current = null; }
      setCipherActive(false);
      setFace(f => f === "encrypted" ? "public" : "encrypted");
    }, 370);
    // t=560ms: done
    const t3 = setTimeout(() => setIsFlipping(false), 560);
    flipTimers.current = [t1, t2, t3];
  }, [isFlipping]);

  useEffect(() => {
    const timers = flipTimers.current;
    const interval = cipherInterval.current;
    return () => { timers.forEach(clearTimeout); if (interval) clearInterval(interval); };
  }, []);

  // ── Dashboard tabs ───────────────────────────────────────────────────────────
  const [dashTab, setDashTab] = useState<"balances" | "audit">("balances");

  // ── Audit tab state ──────────────────────────────────────────────────────────
  const [auditInput, setAuditInput] = useState("");
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditResult, setAuditResult] = useState<LinkAuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);

  const handleAudit = async () => {
    const secret = auditInput.trim().replace(/^#/, "");
    if (!secret) return;
    setAuditError(null);
    setAuditResult(null);
    setAuditLoading(true);
    try {
      const r = await auditLinkStatus(secret);
      setAuditResult(r);
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setAuditLoading(false);
    }
  };

  const AUDIT_STATUS = {
    pending:    { label: "Awaiting claim",             color: "#d97706", dot: "rgba(245,158,11,.8)" },
    in_transit: { label: "Claimed — withdrawal pending", color: "var(--vp-sky-deep)", dot: "var(--vp-sky)" },
    complete:   { label: "Delivered",                  color: "#059669", dot: "rgba(16,185,129,.8)" },
    not_found:  { label: "Not found",                  color: "#dc2626", dot: "rgba(239,68,68,.8)" },
  } as const;

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
            const availHuman = (Number(availableRaw) / 10 ** tokenCfg.decimals).toFixed(4);
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

  // ── Cipher helpers ───────────────────────────────────────────────────────────
  void cipherTick; // used to force re-renders during cipher animation
  const CIPHER = "01█▓▒░⣿⠿01100101";
  const cipher = (s: string) => cipherActive
    ? s.split("").map(c => /[0-9.]/.test(c) ? CIPHER[Math.floor(Math.random() * CIPHER.length)] : c).join("")
    : s;

  // Token rows for each face
  const encryptedRows = balances.filter(b => b.encryptedRaw > 0n || b.encryptedState === "shared");
  const publicRows = balances.filter(b => b.publicRaw > 0n);

  // Public total USD
  const publicTotalUsd = balances.reduce((sum, b) => {
    if (b.publicRaw === 0n) return sum;
    const decimals = b.token === "SOL" ? 9 : TOKEN_CONFIG[b.token].decimals;
    return sum + (Number(b.publicRaw) / 10 ** decimals) * (tokenPrices[b.token] ?? 0);
  }, 0);
  const publicUsdDisplay = !hasPrices ? "$—"
    : `$${publicTotalUsd < 0.01 ? publicTotalUsd.toFixed(4) : publicTotalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;


  return (
    <AppShell active="dashboard">

      {/* ── Modals ── */}
      {withdrawModal && withdrawModalBal && (
        <WithdrawModal
          token={withdrawModal}
          maxHuman={withdrawMaxHuman}
          onClose={() => setWithdrawModal(null)}
          onConfirm={(amt) => withdraw(withdrawModal, amt)}
        />
      )}
      {shieldModal && shieldModalBal && (
        <ShieldModal
          token={shieldModal}
          maxHuman={shieldMaxHuman}
          onClose={() => setShieldModal(null)}
          onConfirm={(amt) => shield(shieldModal, amt)}
        />
      )}

      <section className="app-head">
        <div className="container" style={{ maxWidth: 600 }}>
          <span className="eyebrow">Dashboard</span>
          <h1 className="h2">Your <em>shielded</em> account.</h1>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ maxWidth: 600, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* ── Tab switcher ── */}
          <div style={{ display: "flex", borderBottom: "0.5px solid var(--hairline)", gap: 2 }}>
            {([
              { id: "balances" as const, label: "Balances" },
              { id: "audit"    as const, label: "Link Audit" },
            ]).map(t => (
              <button key={t.id} onClick={() => setDashTab(t.id)} style={{
                padding: "10px 18px", fontSize: 13, fontWeight: 600,
                background: "none", border: "none", cursor: "pointer",
                color: dashTab === t.id ? "var(--ink)" : "var(--ink-4)",
                borderBottom: dashTab === t.id ? "2px solid var(--vp-sky)" : "2px solid transparent",
                marginBottom: -1, transition: "all .15s",
              }}>{t.label}</button>
            ))}
          </div>

          {/* ── BALANCES TAB ── */}
          {dashTab === "balances" && (<>

          {/* ── Not connected ── */}
          {!connected ? (
            <div className="card glass card-pad-lg" style={{ textAlign: "center" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 72, height: 72, objectFit: "contain", opacity: 0.3, margin: "0 auto 16px" }} />
              <p style={{ color: "var(--ink-3)", marginBottom: 20 }}>Connect your wallet to view your balances.</p>
              <ConnectWalletButton variant="primary" />
            </div>
          ) : (
            <>
              {/* ── Segmented state switcher ── */}
              <div style={{ display: "flex", background: "var(--glass-bg)", border: "0.5px solid var(--glass-border)", borderRadius: 16, padding: 4, gap: 4 }}>
                {([
                  { id: "encrypted" as const, label: "Encrypted", icon: <Lock size={13} />, accent: "rgba(107,124,255,.12)", border: "rgba(107,124,255,.35)", color: "var(--vp-violet)" },
                  { id: "public"    as const, label: "Public",    icon: <Unlock size={13} />, accent: "rgba(0,179,255,.10)",   border: "rgba(0,179,255,.3)",   color: "var(--vp-sky-2)" },
                ] as const).map(tab => {
                  const active = face === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => !isFlipping && face !== tab.id && handleFlip()}
                      disabled={isFlipping}
                      style={{
                        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                        padding: "10px 16px", borderRadius: 12, fontSize: 13, fontWeight: 600,
                        background: active ? tab.accent : "transparent",
                        border: active ? `0.5px solid ${tab.border}` : "0.5px solid transparent",
                        color: active ? tab.color : "var(--ink-4)",
                        cursor: active || isFlipping ? "default" : "pointer",
                        transition: "all .2s",
                      }}
                    >
                      {tab.icon}
                      {tab.label} Balance
                      {active && <ArrowLeftRight size={11} style={{ opacity: 0.5, marginLeft: 2 }} />}
                    </button>
                  );
                })}
              </div>

              {/* ── Flip card scene ── */}
              <div style={{ perspective: "1400px" }}>
                <div style={{
                  display: "grid",
                  transformStyle: "preserve-3d",
                  transition: "transform 560ms cubic-bezier(0.4, 0, 0.2, 1)",
                  transform: face === "public" ? "rotateY(180deg)" : "rotateY(0deg)",
                }}>

                  {/* ── FRONT: Encrypted balance ── */}
                  <div style={{
                    gridArea: "1/1",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                  }}>
                    <div className="card glass" style={{
                      padding: "28px 28px 24px",
                      background: "linear-gradient(135deg, rgba(107,124,255,.06) 0%, var(--glass-bg) 60%)",
                      border: "0.5px solid rgba(107,124,255,.22)",
                      position: "relative", overflow: "hidden",
                    }}>
                      {/* Encrypted glow */}
                      <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "radial-gradient(circle, rgba(107,124,255,.1), transparent 70%)", pointerEvents: "none" }} />

                      {/* Row 1: label + refresh */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, position: "relative" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(107,124,255,.15)", border: "0.5px solid rgba(107,124,255,.3)", display: "grid", placeItems: "center" }}>
                            <Lock size={13} style={{ color: "var(--vp-violet)" }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vp-violet)" }}>Encrypted Balance</span>
                          <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "rgba(107,124,255,.12)", color: "rgba(107,124,255,.8)", letterSpacing: "0.06em" }}>PRIVATE</span>
                        </div>
                        <button onClick={refresh} disabled={globalLoading} title="Refresh"
                          style={{ width: 30, height: 30, borderRadius: 8, background: "var(--glass-bg)", border: "0.5px solid var(--hairline)", cursor: "pointer", display: "grid", placeItems: "center" }}>
                          <RefreshCw size={13} style={{ animation: globalLoading ? "spin 1s linear infinite" : "none", color: "var(--ink-3)" }} />
                        </button>
                      </div>

                      {/* Total USD */}
                      <p style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 4, lineHeight: 1, color: cipherActive ? "var(--vp-violet)" : "var(--ink)", transition: "color .1s", fontFamily: "var(--font-sans)" }}>
                        {cipher(encryptedUsdDisplay)}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 24 }}>Total encrypted value</p>

                      {/* Token rows */}
                      {encryptedRows.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 24, fontStyle: "italic" }}>No encrypted balance yet. Shield some funds to get started.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
                          {encryptedRows.map(b => {
                            const cfg = TOKEN_CONFIG[b.token];
                            const humanAmt = formatAmount(b.encryptedRaw, cfg.decimals);
                            const usd = (Number(b.encryptedRaw) / 10 ** cfg.decimals) * (tokenPrices[b.token] ?? 0);
                            const usdStr = usd > 0 ? `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}` : "";
                            return (
                              <div key={b.token} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "var(--glass-bg)", cursor: "pointer" }}
                                onClick={() => setWithdrawModal(b.token)}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={TOKEN_LOGOS[b.token]} alt={b.token} style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "var(--ink)" }}>{b.token}</p>
                                  <p style={{ fontSize: 11, color: "var(--ink-4)", margin: 0 }}>{cfg.name}</p>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontFamily: "var(--font-mono)", color: cipherActive ? "var(--vp-violet)" : "var(--ink)", transition: "color .1s" }}>
                                    {cipher(humanAmt)}
                                  </p>
                                  {usdStr && <p style={{ fontSize: 11, color: "var(--ink-4)", margin: 0 }}>{cipher(usdStr)}</p>}
                                </div>
                                {b.withdrawing ? (
                                  <RefreshCw size={14} style={{ color: "var(--vp-sky)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                                ) : (
                                  <Wallet size={14} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Action row */}
                      <div style={{ display: "flex", gap: 10 }}>
                        {encryptedRows.length > 0 && (
                          <button
                            className="btn btn-glass"
                            style={{ flex: 1, justifyContent: "center", fontSize: 13 }}
                            onClick={() => setWithdrawModal(encryptedRows[0].token)}
                          >
                            <ArrowDownToLine size={13} /> Withdraw
                          </button>
                        )}
                        {pendingUtxoCount > 0 && (
                          <button
                            className="btn btn-primary"
                            style={{ flex: 1, justifyContent: "center", fontSize: 13, gap: 6 }}
                            onClick={claimPending}
                            disabled={claimLoading}
                          >
                            <Inbox size={13} />
                            {claimLoading ? "Claiming…" : `Claim ${pendingUtxoCount} pending`}
                          </button>
                        )}
                        {encryptedRows.length === 0 && pendingUtxoCount === 0 && (
                          <a href="/create" className="btn btn-primary" style={{ flex: 1, justifyContent: "center", fontSize: 13 }}>
                            <Plus size={13} /> Send a link
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* ── BACK: Public balance ── */}
                  <div style={{
                    gridArea: "1/1",
                    backfaceVisibility: "hidden",
                    WebkitBackfaceVisibility: "hidden",
                    transform: "rotateY(180deg)",
                  }}>
                    <div className="card glass" style={{
                      padding: "28px 28px 24px",
                      background: "var(--glass-bg)",
                      border: "0.5px solid var(--glass-border)",
                      position: "relative", overflow: "hidden",
                    }}>
                      {/* Row 1: label */}
                      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 28 }}>
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(0,179,255,.1)", border: "0.5px solid rgba(0,179,255,.25)", display: "grid", placeItems: "center" }}>
                          <Unlock size={13} style={{ color: "var(--vp-sky)" }} />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--vp-sky-2)" }}>Public Balance</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 20, background: "rgba(0,179,255,.08)", color: "rgba(0,179,255,.7)", letterSpacing: "0.06em" }}>ON-CHAIN</span>
                      </div>

                      {/* Total USD */}
                      <p style={{ fontSize: 42, fontWeight: 800, letterSpacing: "-0.04em", marginBottom: 4, lineHeight: 1, color: cipherActive ? "var(--vp-sky)" : "var(--ink)", transition: "color .1s", fontFamily: "var(--font-sans)" }}>
                        {cipher(publicUsdDisplay)}
                      </p>
                      <p style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 24 }}>Total public value</p>

                      {/* Token rows */}
                      {publicRows.length === 0 ? (
                        <p style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 24, fontStyle: "italic" }}>No public balance detected on this wallet.</p>
                      ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 24 }}>
                          {publicRows.map(b => {
                            const cfg = TOKEN_CONFIG[b.token];
                            const humanAmt = b.token === "SOL" ? formatSol(b.publicRaw) : formatAmount(b.publicRaw, cfg.decimals);
                            const usd = (Number(b.publicRaw) / 10 ** (b.token === "SOL" ? 9 : cfg.decimals)) * (tokenPrices[b.token] ?? 0);
                            const usdStr = usd > 0 ? `$${usd < 0.01 ? usd.toFixed(4) : usd.toFixed(2)}` : "";
                            return (
                              <div key={b.token} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 12, background: "var(--glass-bg)", cursor: "pointer" }}
                                onClick={() => setShieldModal(b.token)}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={TOKEN_LOGOS[b.token]} alt={b.token} style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, color: "var(--ink)" }}>{b.token}</p>
                                  <p style={{ fontSize: 11, color: "var(--ink-4)", margin: 0 }}>{cfg.name}</p>
                                </div>
                                <div style={{ textAlign: "right" }}>
                                  <p style={{ fontSize: 14, fontWeight: 600, margin: 0, fontFamily: "var(--font-mono)", color: cipherActive ? "var(--vp-sky)" : "var(--ink)", transition: "color .1s" }}>
                                    {cipher(humanAmt)}
                                  </p>
                                  {usdStr && <p style={{ fontSize: 11, color: "var(--ink-4)", margin: 0 }}>{cipher(usdStr)}</p>}
                                </div>
                                {b.shielding ? (
                                  <RefreshCw size={14} style={{ color: "var(--vp-violet)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
                                ) : (
                                  <Shield size={14} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Action row */}
                      <div style={{ display: "flex", gap: 10 }}>
                        {publicRows.length > 0 && (
                          <button
                            className="btn btn-glass"
                            style={{ flex: 1, justifyContent: "center", fontSize: 13, background: "linear-gradient(180deg, rgba(107,124,255,.08), rgba(107,124,255,.04))", borderColor: "rgba(107,124,255,.25)", color: "var(--vp-violet)" }}
                            onClick={() => setShieldModal(publicRows[0].token)}
                          >
                            <Shield size={13} /> Shield funds
                          </button>
                        )}
                        <a href="/create" className="btn btn-primary" style={{ flex: 1, justifyContent: "center", fontSize: 13 }}>
                          <Plus size={13} /> Send
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── Status / error ── */}
              {(status || error) && (
                <div style={{ padding: "12px 16px", borderRadius: 12, background: error ? "rgba(239,68,68,.08)" : "rgba(0,179,255,.06)", border: `0.5px solid ${error ? "rgba(239,68,68,.2)" : "rgba(0,179,255,.18)"}`, display: "flex", alignItems: "center", gap: 10 }}>
                  {error
                    ? <AlertTriangle size={14} style={{ color: "#ef4444", flexShrink: 0 }} />
                    : <RefreshCw size={14} style={{ color: "var(--vp-sky)", flexShrink: 0, animation: globalLoading || claimLoading ? "spin 1s linear infinite" : "none" }} />}
                  <p style={{ fontSize: 13, color: error ? "#ef4444" : "var(--vp-sky)", margin: 0 }}>{error || status}</p>
                  {error && (
                    <button onClick={() => setError("")} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "var(--ink-4)" }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              )}

              {/* ── Cache clear (tucked away) ── */}
              <div style={{ textAlign: "right" }}>
                <button
                  className="btn btn-glass btn-sm"
                  style={{ fontSize: 11, gap: 4, color: "var(--ink-4)", opacity: 0.6 }}
                  onClick={() => clearZkCache().then(() => setStatus("ZK cache cleared."))}
                  title="Clear ZK proof cache"
                >
                  <Trash2 size={11} /> Clear ZK cache
                </button>
              </div>
            </>
          )}

          {/* closes BALANCES TAB wrapper */}
          </>)}

          {/* ── AUDIT TAB ── */}
          {dashTab === "audit" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="card glass card-pad-lg reveal in">
                <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 16 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(0,179,255,.1)", border: "0.5px solid rgba(0,179,255,.2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Key size={16} style={{ color: "var(--vp-sky)" }} />
                  </div>
                  <div>
                    <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Link receipt checker</p>
                    <p style={{ fontSize: 13, color: "var(--ink-3)", lineHeight: 1.5, margin: 0 }}>
                      Paste the claim secret (the part after <code style={{ fontFamily: "var(--font-mono)", fontSize: 11, padding: "1px 5px", borderRadius: 4, background: "var(--glass-bg-strong)" }}>#</code>) to check payment status.
                    </p>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="e.g. 3mFc…:USDC"
                  value={auditInput}
                  onChange={e => setAuditInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAudit()}
                  className="modal-input"
                  style={{ marginBottom: 12 }}
                />
                {auditError && (
                  <p style={{ fontSize: 13, color: "#dc2626", marginBottom: 12 }}>{auditError}</p>
                )}
                <button className="btn btn-primary" onClick={handleAudit} disabled={!auditInput.trim() || auditLoading}>
                  {auditLoading ? <><Clock size={14} /> Scanning…</> : <><Search size={14} /> Check status</>}
                </button>
              </div>

              {auditResult && (() => {
                const cfg = AUDIT_STATUS[auditResult.status];
                return (
                  <div className="card glass card-pad-lg reveal in">
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: auditResult.status !== "not_found" ? 20 : 0 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: cfg.dot, boxShadow: `0 0 8px ${cfg.dot}`, flexShrink: 0, marginTop: 5 }} />
                      <div>
                        <p style={{ fontSize: 15, fontWeight: 600, color: cfg.color, marginBottom: 4 }}>{cfg.label}</p>
                        {auditResult.status !== "not_found" && (
                          <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0, lineHeight: 1.5 }}>
                            {auditResult.amountHuman} {auditResult.token} · ephemeral: <span style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{auditResult.ephemeralAddress.slice(0, 8)}…{auditResult.ephemeralAddress.slice(-6)}</span>
                          </p>
                        )}
                      </div>
                    </div>
                    {auditResult.status === "complete" && (
                      <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}>
                        <a href="/create" className="btn btn-glass btn-sm" style={{ fontSize: 12, gap: 5 }}>
                          <ArrowRightIcon size={12} /> New payment
                        </a>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Privacy explainer — compact */}
              <div className="card glass" style={{ padding: "16px 20px" }}>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                      <Eye size={13} style={{ color: "var(--vp-sky)" }} />
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-4)" }}>Reveals</span>
                    </div>
                    {["Status (pending/claimed/delivered)", "Amount & token", "Ephemeral hop address"].map(s => (
                      <p key={s} style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 4px", lineHeight: 1.4 }}>· {s}</p>
                    ))}
                  </div>
                  <div style={{ flex: 1, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                      <EyeOff size={13} style={{ color: "#059669" }} />
                      <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-4)" }}>Never reveals</span>
                    </div>
                    {["Sender's wallet", "Recipient's wallet", "On-chain link between parties"].map(s => (
                      <p key={s} style={{ fontSize: 12, color: "var(--ink-2)", margin: "0 0 4px", lineHeight: 1.4 }}>· {s}</p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .modal-overlay { position:fixed;inset:0;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:24px;z-index:1000; }
        .modal-input { width:100%;background:var(--glass-bg);border:0.5px solid var(--glass-border);border-radius:12px;padding:12px 14px;color:var(--ink);font-size:16px;font-family:var(--font-sans);outline:none;transition:border-color .15s;box-sizing:border-box; }
        .modal-input:focus { border-color:rgba(0,179,255,.4); }
        .modal-input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
        .modal-input[type=number] { -moz-appearance:textfield; }
      `}</style>
    </AppShell>
  );
}
