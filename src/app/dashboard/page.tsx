"use client";

import { useCallback, useEffect, useState } from "react";
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
  clearZkCache, getRecentTreeIndices, ensureAssociatedTokenAccount, type U32,
} from "@/lib/umbra";
import { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver } from "@umbra-privacy/web-zk-prover";
import { UMBRA_RELAYER_URL, TOKEN_CONFIG } from "@/lib/constants";
import type { Token } from "@/types";
import type { Address } from "@solana/kit";
import {
  RefreshCw, Trash2, ArrowDownToLine, Inbox,
  Check, AlertTriangle, ArrowUp, ArrowDown, Activity, Plus,
} from "lucide-react";

type BalanceState = "shared" | "not_shared" | "none";
interface TokenBalance { token: Token; balanceRaw: bigint; state: BalanceState; withdrawing: boolean; }

function formatAmount(raw: bigint, decimals: number): string {
  const n = Number(raw) / 10 ** decimals;
  return decimals >= 6 ? n.toFixed(2) : n.toFixed(4);
}

const ALL_TOKENS = Object.keys(TOKEN_CONFIG) as Token[];
const TOKEN_LOGOS: Record<Token, string> = {
  SOL: "/tokens/sol.png", USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  BONK: "/tokens/bonk.png", JUP: "/tokens/jup.png", WIF: "/tokens/wif.png",
};

// Minimal sparkline SVG
function Sparkline({ points }: { points: number[] }) {
  const w = 600, h = 100;
  const max = Math.max(...points), min = Math.min(...points);
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map((v) => h - ((v - min) / (max - min || 1)) * (h - 12) - 6);
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: 88, display: "block" }}>
      <defs>
        <linearGradient id="sf" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--vp-sky)" stopOpacity="0.3" />
          <stop offset="1" stopColor="var(--vp-sky)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sf)" />
      <path d={d} fill="none" stroke="var(--vp-sky)" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ─── Token price fetcher ──────────────────────────────────────────────────────
// Uses CoinGecko IDs (not mint addresses) so devnet and mainnet both work.
// Stablecoins are hardcoded at $1 — they don't need an API call.

const COINGECKO_IDS: Partial<Record<Token, string>> = {
  SOL:  "solana",
  BONK: "bonk",
  JUP:  "jupiter-exchange-solana",
  WIF:  "dogwifcoin",
};
const STABLE_USD: Partial<Record<Token, number>> = {
  USDC: 1.00,
  USDT: 1.00,
};

async function fetchTokenPrices(tokens: Token[]): Promise<Record<Token, number>> {
  const prices: Partial<Record<Token, number>> = {};

  // Stablecoins: hardcode $1 — no API call needed, works on any network
  for (const token of tokens) {
    if (STABLE_USD[token] !== undefined) prices[token] = STABLE_USD[token]!;
  }

  // Non-stablecoins: fetch from CoinGecko using stable coin IDs (network-agnostic)
  const toFetch = tokens.filter((t) => COINGECKO_IDS[t]);
  if (toFetch.length === 0) return { ...Object.fromEntries(tokens.map((t) => [t, 0])), ...prices } as Record<Token, number>;

  const ids = toFetch.map((t) => COINGECKO_IDS[t]!).join(",");
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
      { signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
    const json = await res.json() as Record<string, { usd: number }>;
    for (const token of toFetch) {
      const id = COINGECKO_IDS[token]!;
      prices[token] = json[id]?.usd ?? 0;
    }
  } catch {
    for (const token of toFetch) prices[token] = 0;
  }

  return { ...Object.fromEntries(tokens.map((t) => [t, 0])), ...prices } as Record<Token, number>;
}

export default function DashboardPage() {
  const { wallet, account, connected } = useWalletContext();
  const [balances, setBalances] = useState<TokenBalance[]>(
    ALL_TOKENS.map((t) => ({ token: t, balanceRaw: 0n, state: "none", withdrawing: false }))
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

  const refresh = useCallback(async () => {
    if (!connected || !wallet || !account) return;
    setGlobalLoading(true);
    setStatus("Scanning balances…");
    setError("");
    try {
      const signer = createBrowserSigner(wallet, account);
      const client = await makeClient(signer as Parameters<typeof makeClient>[0]);
      const querier = getEncryptedBalanceQuerierFunction({ client });
      const mints = ALL_TOKENS.map((t) => TOKEN_CONFIG[t].mint as Address);
      const balMap = await querier(mints);
      setBalances(ALL_TOKENS.map((token) => {
        const mint = TOKEN_CONFIG[token].mint as Address;
        const res = balMap.get(mint);
        if (!res) return { token, balanceRaw: 0n, state: "none" as BalanceState, withdrawing: false };
        return {
          token,
          balanceRaw: res.state === "shared" ? BigInt(res.balance.toString()) : 0n,
          state: (res.state === "shared" || res.state === "mxe" ? res.state : "none") as BalanceState,
          withdrawing: false,
        };
      }));
      const scanner = getClaimableUtxoScannerFunction({ client });
      const treeIndices = await getRecentTreeIndices();
      let utxos: { amount: bigint | { toString(): string } }[] = [];
      for (const idx of treeIndices) {
        const r = await scanner(idx as U32, 0n as U32);
        utxos = utxos.concat(r.publicReceived);
      }
      setPendingUtxoCount(utxos.length);
      setPendingUtxoSol(utxos.reduce((s, u) => s + BigInt(u.amount.toString()), 0n));

      // Fetch live USD prices for tokens that have a balance
      const tokensWithBalance = ALL_TOKENS.filter((t) => {
        const mint = TOKEN_CONFIG[t].mint as Address;
        const r = balMap.get(mint);
        return r?.state === "shared" && BigInt(r.balance.toString()) > 0n;
      });
      if (tokensWithBalance.length > 0) {
        fetchTokenPrices(tokensWithBalance).then(setTokenPrices);
      }

      setStatus("");
    } catch (e) {
      setError(`Refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGlobalLoading(false);
    }
  }, [wallet, account, connected]);

  useEffect(() => { if (connected) refresh(); }, [connected, refresh]);

  const withdraw = async (token: Token) => {
    if (!connected || !wallet || !account) return;
    setError("");
    setBalances((prev) => prev.map((b) => b.token === token ? { ...b, withdrawing: true } : b));
    setStatus(`Preparing ${token} token account…`);
    try {
      const signer = createBrowserSigner(wallet, account);
      const client = await makeClient(signer as Parameters<typeof makeClient>[0], { skipPreflight: true });
      await ensureAssociatedTokenAccount(wallet, account, TOKEN_CONFIG[token].mint);
      setStatus(`Withdrawing ${token} to your public wallet…`);
      const querier = getEncryptedBalanceQuerierFunction({ client });
      const mint = TOKEN_CONFIG[token].mint as Address;
      const withdrawFn = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
      const MAX_ATTEMPTS = 3;
      let lastErr: unknown = null;
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          setStatus(`Transaction didn't land, retrying (${attempt}/${MAX_ATTEMPTS})…`);
          await new Promise((r) => setTimeout(r, 1500));
        }
        try {
          const freshBalMap = await querier([mint]);
          const freshBal = freshBalMap.get(mint);
          if (!freshBal || freshBal.state !== "shared" || BigInt(freshBal.balance.toString()) === 0n) {
            throw new Error(`No ${token} balance available to withdraw.`);
          }
          const freshAmount = BigInt(freshBal.balance.toString());
          await withdrawFn(account.address as Address, mint, freshAmount as unknown as Parameters<typeof withdrawFn>[2]);
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
          const isRetryable = msg.includes("timeout") || msg.includes("timed out") || msg.includes("block height") || msg.includes("blockhash") || msg.includes("expired");
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
      let utxos: Parameters<ReturnType<typeof getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction>>[0] = [];
      for (const idx of treeIndices) {
        const r = await scanner(idx as U32, 0n as U32);
        utxos = utxos.concat(r.publicReceived as typeof utxos);
      }
      if (utxos.length === 0) { setStatus("No pending payments found."); return; }
      const relayer = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER_URL });
      const claimProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(makeZkProverDeps());
      const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
        { client },
        { fetchBatchMerkleProof: client.fetchBatchMerkleProof!, zkProver: claimProver, relayer }
      );
      const BATCH = 5;
      for (let i = 0; i < utxos.length; i += BATCH) {
        const batch = utxos.slice(i, i + BATCH);
        setStatus(`Processing batch ${Math.floor(i / BATCH) + 1} of ${Math.ceil(utxos.length / BATCH)}…`);
        try {
          const result = await claim(batch);
          for (const [, b] of result.batches) {
            const final = await pollClaimUntilTerminal((rid) => relayer.pollClaimStatus(rid), b.requestId);
            if (final.status === "failed") {
              const burnt = final.failureReason?.includes("0x6d64") || final.failureReason?.includes("NullifierAlreadyBurnt");
              if (!burnt) throw new Error(`Claim failed: ${final.failureReason}`);
            }
          }
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (!msg.includes("0x6d64") && !msg.includes("NullifierAlreadyBurnt")) throw e;
        }
      }
      setStatus("Claimed. Refreshing balances…");
      await new Promise((r) => setTimeout(r, 8000));
      await refresh();
      setStatus("Done — balances updated.");
    } catch (e) {
      setError(`Claim failed: ${e instanceof Error ? e.message : String(e)}`);
      setStatus("");
    } finally {
      setClaimLoading(false);
    }
  };

  const withdrawableBalances = balances.filter((b) => b.balanceRaw > 0n && b.state === "shared");
  const hasAnyBalance = withdrawableBalances.length > 0 || pendingUtxoCount > 0;
  const SPARK = [20, 24, 22, 30, 28, 35, 33, 42, 40, 48, 52, 49, 58, 62, 60, 68];

  // Compute total USD value from balances × live prices
  const totalUsd = balances.reduce((sum, b) => {
    if (b.balanceRaw === 0n) return sum;
    const human = Number(b.balanceRaw) / 10 ** TOKEN_CONFIG[b.token].decimals;
    return sum + human * (tokenPrices[b.token] ?? 0);
  }, 0);
  const hasPrices = Object.values(tokenPrices).some((p) => p > 0);
  const usdDisplay = !hasAnyBalance
    ? "$0"
    : !hasPrices
    ? "$—"
    : `$${totalUsd < 0.01 ? totalUsd.toFixed(4) : totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <AppShell active="dashboard">
      <section className="app-head">
        <div className="container" style={{ display: "flex", justifyContent: "space-between", alignItems: "end", gap: 24, flexWrap: "wrap" }}>
          <div>
            <span className="eyebrow">Dashboard</span>
            <h1 className="h2">Your <em>shielded</em> account.</h1>
            <p className="lead">Everything happens client-side. Nothing here is visible on-chain.</p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <a href="/create" className="btn btn-primary"><Plus size={14} /> Send</a>
            <button
              className="btn btn-glass btn-sm"
              onClick={() => clearZkCache().then(() => setStatus("ZK cache cleared."))}
              title="Clear ZK cache"
            >
              <Trash2 size={13} />
            </button>
            <button
              className="btn btn-glass btn-sm"
              onClick={refresh}
              disabled={globalLoading}
              title="Refresh"
            >
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
              <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 100, height: 100, objectFit: "contain", opacity: 0.45 }} />
              <p style={{ color: "var(--ink-3)", margin: 0 }}>Connect your wallet to view your encrypted balance.</p>
              <ConnectWalletButton variant="primary" />
            </div>
          ) : (
            <>
              {/* Pending UTXOs banner */}
              {pendingUtxoCount > 0 && (
                <div className="card glass" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "16px 20px", flexWrap: "wrap" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div className="feature-icon" style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.12)", border: "0.5px solid rgba(245,158,11,0.25)", color: "#d97706" }}>
                      <Inbox size={16} />
                    </div>
                    <div>
                      <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{pendingUtxoCount} pending payment{pendingUtxoCount > 1 ? "s" : ""}</p>
                      <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>
                        {(Number(pendingUtxoSol) / 1e9).toFixed(4)} SOL waiting to enter encrypted balance
                      </p>
                    </div>
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={claimPending} disabled={claimLoading}>
                    {claimLoading ? "Claiming…" : "Claim"}
                  </button>
                </div>
              )}

              {/* Balance overview */}
              <div className="dash-top">
                <div className="card glass card-pad-lg dash-balance reveal in">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                    <div>
                      <div className="stat-label">Encrypted balance</div>
                      <div className="stat-value" style={{ fontSize: 48, marginTop: 4 }}>
                        <em>{usdDisplay}</em>
                      </div>
                      <div className="stat-delta up"><ArrowUp size={11} /> Shielded</div>
                    </div>
                    <div className="dash-tokens">
                      {balances.filter((b) => b.balanceRaw > 0n).slice(0, 3).map((b) => (
                        <div key={b.token} className="dash-token">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={TOKEN_LOGOS[b.token]} alt={b.token} style={{ width: 16, height: 16, borderRadius: "50%" }} />
                          <span><strong>{formatAmount(b.balanceRaw, TOKEN_CONFIG[b.token].decimals)}</strong> {b.token}</span>
                        </div>
                      ))}
                      {!hasAnyBalance && <p style={{ fontSize: 12, color: "var(--ink-4)" }}>No encrypted balance</p>}
                    </div>
                  </div>
                  <div style={{ marginTop: 22, marginInline: -12 }}>
                    <Sparkline points={SPARK} />
                  </div>
                  <div className="dash-balance-foot">
                    <span>30D</span><span>21D</span><span>14D</span><span>7D</span><span>NOW</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="card glass stat reveal in">
                    <div className="stat-label">Active tokens</div>
                    <div className="stat-value"><em>{balances.filter((b) => b.balanceRaw > 0n).length}</em></div>
                    <div className="stat-delta">in encrypted balance</div>
                  </div>
                  <div className="card glass stat reveal in">
                    <div className="stat-label">Pending UTXOs</div>
                    <div className="stat-value"><em>{pendingUtxoCount}</em></div>
                    <div className="stat-delta">{(Number(pendingUtxoSol) / 1e9).toFixed(4)} SOL outstanding</div>
                  </div>
                </div>
              </div>

              {/* Token balances */}
              <div className="card glass reveal in" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "18px 24px", borderBottom: "1px solid var(--hairline)", display: "flex", alignItems: "center", gap: 8 }}>
                  <Activity size={14} style={{ color: "var(--ink-3)" }} />
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)" }}>Token Balances</span>
                </div>
                {balances.map((b) => {
                  const cfg = TOKEN_CONFIG[b.token];
                  const isWithdrawable = b.state === "shared" && b.balanceRaw > 0n;
                  const display = b.balanceRaw > 0n ? formatAmount(b.balanceRaw, cfg.decimals) : "—";
                  return (
                    <div key={b.token} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 24px", borderBottom: "1px solid var(--hairline)" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={TOKEN_LOGOS[b.token]} alt={b.token} style={{ width: 32, height: 32, borderRadius: "50%", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>{b.token}</p>
                        <p style={{ fontSize: 11, color: "var(--ink-3)", margin: 0 }}>{cfg.name}</p>
                      </div>
                      <div style={{ textAlign: "right", marginRight: 16 }}>
                        <p style={{ fontSize: 14, fontFamily: "var(--font-mono)", fontWeight: 500, margin: 0, color: b.balanceRaw > 0n ? "var(--ink)" : "var(--ink-4)" }}>{display}</p>
                        {b.balanceRaw > 0n && b.state !== "shared" && <p style={{ fontSize: 10, color: "#d97706", margin: 0 }}>pending</p>}
                        {isWithdrawable && <p style={{ fontSize: 10, color: "#059669", margin: 0 }}>ready</p>}
                      </div>
                      <button
                        className="btn btn-glass btn-sm"
                        disabled={!isWithdrawable || b.withdrawing}
                        onClick={() => withdraw(b.token)}
                        style={{ flexShrink: 0 }}
                      >
                        {b.withdrawing ? "…" : <><ArrowDownToLine size={13} /> Withdraw</>}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Status / error */}
              {(status || error) && (
                <div style={{ display: "flex", alignItems: "start", gap: 12, padding: "12px 16px", borderRadius: "var(--radius-md)", border: "0.5px solid", ...(error ? { background: "rgba(220,38,38,0.06)", borderColor: "rgba(220,38,38,0.2)", color: "#dc2626" } : { background: "rgba(0,179,255,0.06)", borderColor: "rgba(0,179,255,0.2)", color: "var(--vp-sky-deep)" }) }}>
                  {error ? <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> : <Check size={16} style={{ flexShrink: 0, marginTop: 1 }} />}
                  <p style={{ fontSize: 12.5, margin: 0 }}>{error || status}</p>
                </div>
              )}
            </>
          )}
        </div>
      </section>
    </AppShell>
  );
}
