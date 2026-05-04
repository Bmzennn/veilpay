"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/AppShell";
import { ConnectWalletButton } from "@/components/WalletModal";
import { useWalletContext } from "@/components/WalletContext";
import {
  checkUmbraRegistration, registerWithUmbra, preloadCreateAssets,
} from "@/lib/umbra";
import { TOKEN_CONFIG } from "@/lib/constants";
import type { Token } from "@/types";
import { Store, QrCode, CheckCircle, AlertTriangle, RefreshCw, Copy, Check, X, ChevronDown } from "lucide-react";

type SetupState = "checking" | "needs_registration" | "registering" | "ready" | "error";
type RequestState = "idle" | "creating" | "waiting" | "paid";

interface ActiveRequest {
  id: string;
  amount: string;
  token: Token;
  label: string;
  qrDataUrl: string;
  payUrl: string;
}

const ACTIVE_REQUEST_KEY = "vp-merchant-active-request";

const TOKEN_LOGOS: Record<Token, string> = {
  SOL: "/tokens/sol.png", USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  UMBRA: "/tokens/umbra.png", CASH: "/tokens/cash.png",
};

async function buildQr(url: string): Promise<string> {
  const QRCode = (await import("qrcode")).default;
  return QRCode.toDataURL(url, {
    width: 300, margin: 2,
    color: { dark: "#0a1428", light: "#ffffff" },
  });
}

export default function MerchantPage() {
  const { connected, wallet, account, address } = useWalletContext();

  // ── Setup flow ────────────────────────────────────────────────────────────
  const [setupState, setSetupState] = useState<SetupState>("checking");
  const [setupMsg, setSetupMsg] = useState("");

  useEffect(() => {
    if (!connected || !wallet || !account) { setSetupState("checking"); return; }
    preloadCreateAssets();
    setSetupState("checking");
    checkUmbraRegistration(wallet, account)
      .then(reg => setSetupState(reg ? "ready" : "needs_registration"))
      .catch(() => setSetupState("error"));
  }, [connected, wallet, account]);

  const handleRegister = async () => {
    if (!wallet || !account) return;
    setSetupState("registering");
    try {
      await registerWithUmbra(wallet, account, setSetupMsg);
      setSetupState("ready");
      setSetupMsg("");
    } catch (e) {
      setSetupMsg(e instanceof Error ? e.message : "Registration failed");
      setSetupState("error");
    }
  };

  // ── Request form state ────────────────────────────────────────────────────
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<Token>("USDC");
  const [label, setLabel] = useState("");
  const [reqState, setReqState] = useState<RequestState>("idle");
  const [activeReq, setActiveReq] = useState<ActiveRequest | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Restore active request from localStorage on mount ─────────────────────
  useEffect(() => {
    if (setupState !== "ready") return;
    const saved = localStorage.getItem(ACTIVE_REQUEST_KEY);
    if (!saved) return;
    try {
      const { id, amount: a, token: t, label: l } = JSON.parse(saved) as {
        id: string; amount: string; token: Token; label: string;
      };
      fetch(`/api/merchant-pay?id=${encodeURIComponent(id)}`)
        .then(r => r.json())
        .then(async ({ request }) => {
          if (!request) { localStorage.removeItem(ACTIVE_REQUEST_KEY); return; }
          if (request.paid) {
            localStorage.removeItem(ACTIVE_REQUEST_KEY);
            return;
          }
          const payUrl = `${window.location.origin}/pay/${id}`;
          const qrDataUrl = await buildQr(payUrl);
          setActiveReq({ id, amount: a, token: t, label: l, qrDataUrl, payUrl });
          setReqState("waiting");
          startPolling(id);
        })
        .catch(() => localStorage.removeItem(ACTIVE_REQUEST_KEY));
    } catch {
      localStorage.removeItem(ACTIVE_REQUEST_KEY);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setupState]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const startPolling = useCallback((id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/merchant-pay?id=${encodeURIComponent(id)}`);
        if (!res.ok) return;
        const { request } = await res.json();
        if (request?.paid) {
          setReqState("paid");
          stopPolling();
          localStorage.removeItem(ACTIVE_REQUEST_KEY);
        }
      } catch {}
    }, 3000);
  }, [stopPolling]);

  const handleGenerate = async () => {
    if (!address || !amount || parseFloat(amount) <= 0) return;
    setReqError(null);
    setReqState("creating");
    setActiveReq(null);
    try {
      const res = await fetch("/api/merchant-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ merchant_addr: address, amount, token, label: label || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create request");

      const payUrl = `${window.location.origin}/pay/${data.id}`;
      const qrDataUrl = await buildQr(payUrl);

      const req: ActiveRequest = { id: data.id, amount, token, label: label || "Payment", qrDataUrl, payUrl };
      localStorage.setItem(ACTIVE_REQUEST_KEY, JSON.stringify({ id: data.id, amount, token, label: label || "Payment" }));
      setActiveReq(req);
      setReqState("waiting");
      startPolling(data.id);
    } catch (e) {
      setReqError(e instanceof Error ? e.message : "Something went wrong");
      setReqState("idle");
    }
  };

  const handleCancel = () => {
    stopPolling();
    setActiveReq(null);
    setReqState("idle");
    setReqError(null);
    localStorage.removeItem(ACTIVE_REQUEST_KEY);
  };

  const copyLink = async () => {
    if (!activeReq) return;
    await navigator.clipboard.writeText(activeReq.payUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Custom token picker ───────────────────────────────────────────────────
  const [tokenOpen, setTokenOpen] = useState(false);
  const [tokenPos, setTokenPos] = useState({ top: 0, right: 0 });
  const [dropMounted, setDropMounted] = useState(false);
  const tokenBtnRef = useRef<HTMLButtonElement>(null);
  const tokenDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setDropMounted(true); }, []);

  const openTokenMenu = () => {
    if (tokenBtnRef.current) {
      const r = tokenBtnRef.current.getBoundingClientRect();
      setTokenPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setTokenOpen(true);
  };

  useEffect(() => {
    if (!tokenOpen) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!tokenBtnRef.current?.contains(t) && !tokenDropRef.current?.contains(t)) setTokenOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [tokenOpen]);

  const tokenDropdown = (
    <div ref={tokenDropRef} className="glass" style={{
      position: "fixed", top: tokenPos.top, right: tokenPos.right,
      zIndex: 99999, padding: 6, minWidth: 210, borderRadius: 14,
    }}>
      {(Object.keys(TOKEN_CONFIG) as Token[]).map(t => (
        <button key={t} onClick={() => { setToken(t); setTokenOpen(false); }} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", width: "100%", borderRadius: 10,
          background: t === token ? "var(--glass-bg-strong)" : "transparent",
          cursor: "pointer", border: "none",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TOKEN_LOGOS[t]} alt={t} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{t}</span>
          <span style={{ color: "var(--ink-3)", fontSize: 12, marginLeft: "auto" }}>{TOKEN_CONFIG[t].name}</span>
        </button>
      ))}
    </div>
  );

  const canGenerate = setupState === "ready" && connected && !!amount && parseFloat(amount) > 0 && reqState === "idle";

  return (
    <AppShell active="merchant">
      <section className="app-head">
        <div className="container" style={{ maxWidth: 560, textAlign: "center" }}>
          <span className="eyebrow" style={{ display: "inline-flex", gap: 8 }}>
            <Store size={13} /> Private Solana Pay
          </span>
          <h1 className="h2" style={{ textAlign: "center" }}>Accept payments <em>privately.</em></h1>
          <p className="lead" style={{ textAlign: "center", margin: "0 auto" }}>
            Customers pay via ZK proof — you receive, they stay anonymous on-chain.
          </p>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ maxWidth: 480 }}>

          {/* ── Not connected ── */}
          {!connected && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <Store size={32} style={{ color: "var(--vp-sky)", margin: "0 auto 16px" }} />
              <p style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Connect your merchant wallet</p>
              <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24 }}>
                Connect the wallet you want to receive payments into.
              </p>
              <ConnectWalletButton variant="primary" />
            </div>
          )}

          {/* ── Checking / registering ── */}
          {connected && (setupState === "checking" || setupState === "registering") && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <RefreshCw size={24} style={{ color: "var(--vp-sky)", animation: "spin 1s linear infinite", margin: "0 auto 14px" }} />
              <p style={{ color: "var(--ink-2)", fontSize: 14 }}>
                {setupState === "checking" ? "Checking Umbra registration…" : setupMsg || "Registering with Umbra…"}
              </p>
            </div>
          )}

          {/* ── Needs registration ── */}
          {connected && setupState === "needs_registration" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <AlertTriangle size={32} style={{ color: "#f59e0b", margin: "0 auto 14px" }} />
              <p style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>One-time setup required</p>
              <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24, maxWidth: 340, margin: "0 auto 24px" }}>
                To receive private payments your wallet must be registered with Umbra. This takes 2–4 wallet signatures and only happens once.
              </p>
              <button className="btn btn-primary" onClick={handleRegister}>
                Register with Umbra →
              </button>
            </div>
          )}

          {/* ── Error ── */}
          {connected && setupState === "error" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <AlertTriangle size={32} style={{ color: "#ef4444", margin: "0 auto 14px" }} />
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 8, color: "#ef4444" }}>Setup failed</p>
              <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 20 }}>{setupMsg || "Could not verify Umbra registration."}</p>
              <button className="btn btn-glass btn-sm" onClick={() => { setSetupState("checking"); setSetupMsg(""); }}>Retry</button>
            </div>
          )}

          {/* ── Ready ── */}
          {connected && setupState === "ready" && (
            <>
              {/* ── Form (idle) ── */}
              {reqState === "idle" && (
                <div className="card glass card-pad-lg reveal in">
                  <p style={{ fontWeight: 600, fontSize: 17, letterSpacing: "-0.02em", marginBottom: 24 }}>
                    New payment request
                  </p>

                  {/* Label */}
                  <div style={{ marginBottom: 18 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 7 }}>
                      Label <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, color: "var(--ink-4)", opacity: 0.7 }}>— optional</span>
                    </label>
                    <input
                      type="text"
                      className="modal-input"
                      placeholder="e.g.  Coffee · Table 4 · Invoice #12"
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                      maxLength={80}
                    />
                  </div>

                  {/* Amount + token */}
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 7 }}>
                      Amount & token
                    </label>
                    <div style={{
                      display: "flex", alignItems: "stretch",
                      border: "0.5px solid var(--glass-border)",
                      borderRadius: 14, overflow: "hidden",
                      background: "var(--glass-bg)",
                    }}>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={amount}
                        onChange={e => setAmount(e.target.value)}
                        min="0" step="any"
                        style={{
                          flex: 1, background: "transparent", border: "none", outline: "none",
                          padding: "13px 16px", fontSize: 22, fontWeight: 600,
                          color: "var(--ink)", letterSpacing: "-0.02em",
                          fontFamily: "var(--font-sans)", minWidth: 0,
                        }}
                      />
                      <div style={{ width: "0.5px", background: "var(--hairline)", flexShrink: 0, alignSelf: "stretch" }} />
                      {/* Custom token picker button */}
                      <button
                        ref={tokenBtnRef}
                        onClick={tokenOpen ? () => setTokenOpen(false) : openTokenMenu}
                        style={{
                          display: "flex", alignItems: "center", gap: 8,
                          padding: "0 14px", background: "transparent", border: "none",
                          cursor: "pointer", flexShrink: 0, outline: "none",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={TOKEN_LOGOS[token]} alt={token}
                          style={{ width: 24, height: 24, borderRadius: "50%", objectFit: "cover" }} />
                        <span style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{token}</span>
                        <ChevronDown size={13} style={{ color: "var(--ink-3)", transform: tokenOpen ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
                      </button>
                    </div>
                    {dropMounted && tokenOpen && createPortal(tokenDropdown, document.body)}
                  </div>

                  {reqError && (
                    <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 14 }}>{reqError}</p>
                  )}

                  <button
                    className="btn btn-primary"
                    onClick={handleGenerate}
                    disabled={!canGenerate}
                    style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "13px" }}
                  >
                    <QrCode size={16} /> Generate QR
                  </button>
                </div>
              )}

              {/* ── Creating spinner ── */}
              {reqState === "creating" && (
                <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
                  <RefreshCw size={24} style={{ color: "var(--vp-sky)", animation: "spin 1s linear infinite", margin: "0 auto 12px" }} />
                  <p style={{ color: "var(--ink-2)", fontSize: 14 }}>Creating payment request…</p>
                </div>
              )}

              {/* ── Active QR ── */}
              {reqState === "waiting" && activeReq && (
                <div className="card glass card-pad-lg reveal in">
                  <div style={{ textAlign: "center" }}>
                    {/* Status bar */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7, marginBottom: 16 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--vp-sky)", display: "inline-block", animation: "blink 1.4s ease-in-out infinite" }} />
                      <p style={{ fontSize: 12, color: "var(--vp-sky)", fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>
                        Waiting for payment
                      </p>
                    </div>

                    {/* Amount */}
                    <p style={{ fontWeight: 700, fontSize: 34, letterSpacing: "-0.04em", marginBottom: 2 }}>
                      {parseFloat(activeReq.amount).toFixed(["SOL"].includes(activeReq.token) ? 4 : 2)} {activeReq.token}
                    </p>
                    {activeReq.label && (
                      <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 20 }}>{activeReq.label}</p>
                    )}

                    {/* QR code */}
                    <div style={{
                      display: "inline-block", padding: 14,
                      background: "#ffffff", borderRadius: 20,
                      boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
                      marginBottom: 20,
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={activeReq.qrDataUrl} alt="Payment QR"
                        style={{ width: 256, height: 256, display: "block" }} />
                    </div>

                    <p style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 18 }}>
                      Customer scans to pay anonymously via ZK proof
                    </p>

                    {/* Actions */}
                    <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                      <button className="btn btn-glass btn-sm" onClick={copyLink} style={{ fontSize: 12, gap: 6 }}>
                        {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy link</>}
                      </button>
                      <button className="btn btn-glass btn-sm" onClick={handleCancel} style={{ fontSize: 12, gap: 6, color: "var(--ink-4)" }}>
                        <X size={12} /> Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Paid ── */}
              {reqState === "paid" && activeReq && (
                <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
                  <CheckCircle size={44} style={{ color: "#34d399", margin: "0 auto 14px" }} />
                  <p style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", marginBottom: 6 }}>Payment received!</p>
                  <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 6 }}>
                    <strong style={{ color: "var(--ink-2)" }}>
                      {parseFloat(activeReq.amount).toFixed(["SOL"].includes(activeReq.token) ? 4 : 2)} {activeReq.token}
                    </strong> is in your Umbra encrypted balance.
                  </p>
                  <p style={{ color: "var(--ink-4)", fontSize: 12, marginBottom: 28 }}>
                    Go to <a href="/dashboard" style={{ color: "var(--vp-sky)" }}>Dashboard</a> → Claim pending → Withdraw to collect funds.
                  </p>
                  <button className="btn btn-primary" onClick={handleCancel}>
                    New request
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0.3} }
        .modal-input { width:100%; background:var(--glass-bg); border:0.5px solid var(--glass-border); border-radius:12px; padding:12px 14px; color:var(--ink); font-size:14px; font-family:var(--font-sans); outline:none; transition:border-color .15s; }
        .modal-input:focus { border-color:rgba(0,179,255,.4); }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance:none; }
      `}</style>
    </AppShell>
  );
}
