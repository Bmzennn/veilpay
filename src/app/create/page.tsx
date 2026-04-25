"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { PublicKey } from "@solana/web3.js";
import { AppShell } from "@/components/AppShell";
import { ConnectWalletButton } from "@/components/WalletModal";
import { useWalletContext } from "@/components/WalletContext";
import {
  createPaymentLink, confidentialTransfer, validateAmount, preloadCreateAssets,
} from "@/lib/umbra";
import { TOKEN_CONFIG, NETWORK } from "@/lib/constants";
import type { Token, LinkStep, PaymentLinkMeta, PaymentMode, TransferType, ConfidentialStep } from "@/types";
import {
  Shield, Lock, Globe, UserCheck, Send, ArrowRight, Check, Copy,
  AlertTriangle, ExternalLink, Eye, EyeOff, ChevronDown, Plus, Timer, QrCode,
} from "lucide-react";

function isValidSolanaAddress(addr: string): boolean {
  try { new PublicKey(addr); return true; } catch { return false; }
}

const clusterQuery = NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`;

const TOKEN_LOGOS: Record<Token, string> = {
  SOL: "/tokens/sol.png", USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  BONK: "/tokens/bonk.png", JUP: "/tokens/jup.png", WIF: "/tokens/wif.png",
};

// ─── Token selector ───────────────────────────────────────────────────────────
// Dropdown is portaled to document.body to escape any parent backdrop-filter
// stacking context (same root cause as WalletModal clipping inside the nav).

function TokenPicker({ value, onChange }: { value: Token; onChange: (t: Token) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const tokens = Object.keys(TOKEN_CONFIG) as Token[];

  useEffect(() => { setMounted(true); }, []);

  const openMenu = () => {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      const insideBtn = btnRef.current?.contains(target) ?? false;
      const insideDropdown = dropdownRef.current?.contains(target) ?? false;
      if (!insideBtn && !insideDropdown) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("scroll", handler, { capture: true });
    return () => window.removeEventListener("scroll", handler, { capture: true });
  }, [open]);

  const dropdown = (
    <div
      ref={dropdownRef}
      className="glass"
      style={{
        position: "fixed",
        top: pos.top,
        right: pos.right,
        zIndex: 99999,
        padding: 6,
        minWidth: 200,
        borderRadius: 14,
      }}
    >
      {tokens.map((t) => (
        <button
          key={t}
          onClick={() => { onChange(t); setOpen(false); }}
          style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "9px 12px", width: "100%", borderRadius: 10, fontSize: 13,
            background: t === value ? "var(--glass-bg-strong)" : "transparent",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TOKEN_LOGOS[t]} alt={t} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ fontWeight: 500 }}>{t}</span>
          <span style={{ color: "var(--ink-3)", fontSize: 12 }}>{TOKEN_CONFIG[t].name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button ref={btnRef} className="token-pill" onClick={open ? () => setOpen(false) : openMenu}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TOKEN_LOGOS[value]} alt={value} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} />
        <span>{value}</span>
        <ChevronDown size={14} />
      </button>
      {mounted && open && createPortal(dropdown, document.body)}
    </>
  );
}

// ─── Mode selector ────────────────────────────────────────────────────────────

interface ModeSelectorProps {
  value: TransferType;
  onChange: (m: TransferType) => void;
}

function ModeSelector({ value, onChange }: ModeSelectorProps) {
  const options: {
    id: TransferType;
    icon: React.ReactNode;
    title: string;
    desc: string;
    accent: string;
    accentRgb: string;
  }[] = [
    {
      id: "link",
      icon: <Globe size={18} />,
      title: "Private Link",
      desc: "Anyone with the link can claim to a fresh wallet. Sender stays anonymous.",
      accent: "var(--vp-sky-deep)",
      accentRgb: "0,128,255",
    },
    {
      id: "confidential",
      icon: <Shield size={18} />,
      title: "Direct Send",
      desc: "Send straight to a VeilPay address. Amount is hidden on-chain.",
      accent: "var(--vp-violet)",
      accentRgb: "107,124,255",
    },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 20 }}>
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              padding: "18px 18px 16px",
              borderRadius: "var(--radius-md)",
              border: active
                ? `1px solid rgba(${o.accentRgb},0.4)`
                : "0.5px solid var(--hairline-strong)",
              background: active
                ? `rgba(${o.accentRgb},0.07)`
                : "var(--glass-bg-soft)",
              textAlign: "left",
              transition: "background 0.18s, border-color 0.18s",
              display: "flex",
              flexDirection: "column",
              gap: 10,
              cursor: "pointer",
            }}
          >
            <div style={{
              width: 34, height: 34, borderRadius: 10, display: "grid", placeItems: "center",
              background: active ? `rgba(${o.accentRgb},0.15)` : "var(--glass-bg-strong)",
              color: active ? o.accent : "var(--ink-3)",
              transition: "background 0.18s, color 0.18s",
              border: "0.5px solid var(--hairline)",
            }}>
              {o.icon}
            </div>
            <div>
              <p style={{ margin: "0 0 3px", fontWeight: 600, fontSize: 14, color: "var(--ink)", letterSpacing: "-0.01em" }}>
                {o.title}
              </p>
              <p style={{ margin: 0, fontSize: 12, color: "var(--ink-3)", lineHeight: 1.5 }}>
                {o.desc}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Link display with blur/reveal ───────────────────────────────────────────

function SecureLink({ link }: { link: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [warn, setWarn] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const src = Function.prototype.toString.call(navigator.clipboard.writeText);
      if (!src.includes("native code")) setWarn(true);
    } catch {}
  }, []);

  const reBlur = useCallback(() => {
    setRevealed(false);
    setSecondsLeft(0);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (countRef.current) clearInterval(countRef.current);
  }, []);

  useEffect(() => {
    const onBlur = () => { if (revealed) reBlur(); };
    window.addEventListener("blur", onBlur);
    return () => window.removeEventListener("blur", onBlur);
  }, [revealed, reBlur]);

  const reveal = () => {
    if (revealed) { reBlur(); return; }
    setRevealed(true);
    setSecondsLeft(15);
    countRef.current = setInterval(() => setSecondsLeft((s) => { if (s <= 1) { reBlur(); return 0; } return s - 1; }), 1000);
    timerRef.current = setTimeout(reBlur, 15000);
  };

  const copy = async () => {
    if (warn) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleQr = async () => {
    if (showQr) { setShowQr(false); return; }
    if (!qrDataUrl) {
      // Dynamic import — QR generated entirely client-side, secret never leaves browser.
      const QRCode = (await import("qrcode")).default;
      const url = await QRCode.toDataURL(link, {
        width: 220, margin: 2,
        // VP sky blue dots on dark navy — matches the UI in both light and dark mode
        color: { dark: "#00b3ff", light: "#06111f" },
      });
      setQrDataUrl(url);
    }
    setShowQr(true);
  };

  return (
    <div className="card glass card-pad-lg success-card">
      <div className="success-mark"><Check size={24} /></div>
      <h2 className="card-title" style={{ fontSize: 22, marginTop: 14 }}>Your private link is ready.</h2>
      <p className="card-sub">Share with the recipient. Only the holder can claim.</p>

      {warn && (
        <div style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(245,158,11,0.1)", border: "0.5px solid rgba(245,158,11,0.3)", marginBottom: 16 }}>
          <AlertTriangle size={14} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
          <p style={{ fontSize: 12, color: "#d97706", margin: 0 }}>Clipboard extension detected. Use the Share button instead.</p>
        </div>
      )}

      {/* Full link — blurred until revealed so shoulder-surfers can't read the key */}
      <div style={{
        padding: "14px 16px",
        borderRadius: "var(--radius-sm)",
        background: revealed ? "rgba(0,179,255,0.05)" : "var(--glass-bg-strong)",
        border: `0.5px solid ${revealed ? "rgba(0,179,255,0.3)" : "var(--hairline-strong)"}`,
        marginBottom: 10,
        transition: "background 0.3s, border-color 0.3s",
      }}>
        <div style={{
          fontFamily: "var(--font-mono)", fontSize: 12,
          color: "var(--ink-2)", lineHeight: 1.7,
          wordBreak: "break-all",
          filter: revealed ? "none" : "blur(5px)",
          userSelect: revealed ? "auto" : "none",
          transition: "filter 0.3s",
        }}>
          {link}
        </div>
      </div>

      {/* Reveal / Copy row */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button className="btn btn-glass btn-sm" onClick={reveal} style={{ flex: 1, justifyContent: "center" }}>
          {revealed
            ? <><EyeOff size={13} /> {secondsLeft > 0 ? <><Timer size={11} />{secondsLeft}s</> : "Hide link"}</>
            : <><Eye size={13} /> Reveal link</>}
        </button>
        <button className="btn btn-glass btn-sm" onClick={copy} disabled={warn} style={{ flex: 1, justifyContent: "center" }}>
          {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
        </button>
      </div>

      {/* Action buttons */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {navigator?.share && (
          <button className="btn btn-glass btn-sm" onClick={() => navigator.share({ title: "VeilPay payment", url: link })}>
            <ExternalLink size={13} /> Share
          </button>
        )}
        <button className={`btn btn-sm ${showQr ? "btn-primary" : "btn-glass"}`} onClick={toggleQr}>
          <QrCode size={13} /> QR Code
        </button>
        <a className="btn btn-glass btn-sm" href="https://solscan.io/" target="_blank" rel="noopener noreferrer">
          <ExternalLink size={13} /> Solscan
        </a>
      </div>

      {/* QR code — VP sky blue on dark navy, on-brand */}
      {showQr && qrDataUrl && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center",
          padding: "20px 20px 14px",
          borderRadius: "var(--radius-md)",
          background: "#06111f",
          border: "0.5px solid rgba(0,179,255,0.25)",
          boxShadow: "0 0 0 1px rgba(0,179,255,0.08), 0 8px 24px -8px rgba(0,128,255,0.25)",
          marginTop: 14,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Claim link QR code" style={{ width: 180, height: 180, display: "block" }} />
          <p style={{ fontSize: 11, color: "rgba(0,179,255,0.6)", margin: "10px 0 0", fontFamily: "var(--font-mono)", letterSpacing: "0.04em" }}>
            SCAN TO CLAIM
          </p>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "var(--glass-bg-soft)", border: "0.5px solid var(--hairline)" }}>
        <Shield size={12} style={{ color: "var(--vp-sky-deep)", flexShrink: 0 }} />
        <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: 0 }}>No link to sender&apos;s identity is revealed when this link is audited.</p>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CreatePage() {
  const { connected, wallet, account } = useWalletContext();
  useEffect(() => { preloadCreateAssets(); }, []);

  const [transferType, setTransferType] = useState<TransferType>("link");

  // Link state
  const [amount, setAmount] = useState("");
  const [token, setToken] = useState<Token>("SOL");
  const [mode, setMode] = useState<PaymentMode>("general");
  const [recipientAddress, setRecipientAddress] = useState("");
  const [memo, setMemo] = useState("");
  const [expires, setExpires] = useState("7");
  const [step, setStep] = useState<LinkStep>("input");
  const [statusMsg, setStatusMsg] = useState("");
  const [generatedUrl, setGeneratedUrl] = useState("");
  const [meta, setMeta] = useState<PaymentLinkMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Confidential state
  const [confStep, setConfStep] = useState<ConfidentialStep>("input");
  const [confRecipient, setConfRecipient] = useState("");
  const [confAmount, setConfAmount] = useState("");
  const [confToken, setConfToken] = useState<Token>("SOL");
  const [confStatusMsg, setConfStatusMsg] = useState("");
  const [confTxSig, setConfTxSig] = useState("");
  const [confError, setConfError] = useState<string | null>(null);

  const amountError = amount ? validateAmount(amount, token) : null;
  const recipientError = mode === "locked" && recipientAddress && !isValidSolanaAddress(recipientAddress) ? "Invalid Solana address." : null;
  const canCreate = connected && !amountError && parseFloat(amount) > 0 && (mode === "general" || (recipientAddress.length > 0 && !recipientError));

  const confAmountError = confAmount ? validateAmount(confAmount, confToken) : null;
  const confRecipientError = confRecipient && !isValidSolanaAddress(confRecipient) ? "Invalid Solana address." : null;
  const canSendConf = connected && !confAmountError && parseFloat(confAmount) > 0 && confRecipient.length > 0 && !confRecipientError;

  const isProcessing = step === "funding" || step === "registering" || step === "creating";

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
          if (msg.includes("Registering") || msg.includes("Setting up")) setStep("registering");
          if (msg.includes("Depositing") || msg.includes("Shielding") || msg.includes("shielded")) setStep("creating");
        },
        recipientAddress: mode === "locked" ? recipientAddress : undefined,
        memo: memo.trim() || undefined,
      });
      setGeneratedUrl(result.url);
      setMeta(result.meta);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setStep("input");
    }
  };

  const handleConfSend = async () => {
    if (!wallet || !account) return;
    setConfError(null);
    setConfStep("sending");
    try {
      const result = await confidentialTransfer({
        senderWallet: wallet,
        senderAccount: account,
        recipientAddress: confRecipient,
        amountHuman: confAmount,
        token: confToken,
        onStatusChange: setConfStatusMsg,
      });
      setConfTxSig(result.signature);
      setConfStep("done");
    } catch (err) {
      setConfError(err instanceof Error ? err.message : "Transfer failed");
      setConfStep("input");
    }
  };

  const PROCESSING_LABEL: Record<string, string> = {
    funding: "Preparing privacy channel",
    registering: "Setting up ephemeral key",
    creating: "Shielding your funds",
  };

  return (
    <AppShell active="create">
      <section className="app-head">
        <div className="container" style={{ maxWidth: 600, textAlign: "center" }}>
          <span className="eyebrow" style={{ display: "inline-flex" }}>Send</span>
          <h1 className="h2" style={{ textAlign: "center" }}>Move money <em>privately.</em></h1>
          <p className="lead" style={{ textAlign: "center", margin: "0 auto" }}>
            Choose a mode and set the amount.
          </p>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ maxWidth: 560 }}>

          {/* ── Mode selector (only when not mid-flow) ── */}
          {step === "input" && confStep === "input" && (
            <ModeSelector value={transferType} onChange={(m) => {
              setTransferType(m);
              setError(null);
              setConfError(null);
            }} />
          )}

          {/* ── Form card ── */}
          <div className="card glass card-pad-lg reveal in">

            {/* ── LINK FLOW ── */}
            {transferType === "link" && (
              <>
                {step === "done" && meta ? (
                  <div>
                    <SecureLink link={generatedUrl} />
                    <button
                      className="btn btn-glass"
                      style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
                      onClick={() => { setStep("input"); setAmount(""); setGeneratedUrl(""); setMeta(null); }}
                    >
                      <Plus size={14} /> Create another
                    </button>
                  </div>
                ) : isProcessing ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 100, height: 100, objectFit: "contain", margin: "0 auto 20px", display: "block" }} />
                    <p style={{ fontWeight: 600, fontSize: 22, marginBottom: 8, letterSpacing: "-0.02em" }}>{PROCESSING_LABEL[step]}</p>
                    <p style={{ color: "var(--ink-3)", fontSize: 13 }}>{statusMsg}</p>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 20 }}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--vp-sky)", opacity: 0.6, animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Link sub-mode */}
                    <div style={{ marginBottom: 20 }}>
                      <div className="field-label" style={{ marginBottom: 8 }}>Claim type</div>
                      <div className="seg" style={{ alignSelf: "start" }}>
                        <button className={mode === "general" ? "is-active" : ""} onClick={() => setMode("general")}>
                          <Globe size={13} /> General
                        </button>
                        <button className={mode === "locked" ? "is-active" : ""} onClick={() => setMode("locked")}>
                          <UserCheck size={13} /> Wallet-locked
                        </button>
                      </div>
                      <p style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8, marginBottom: 0 }}>
                        {mode === "general"
                          ? "Anyone with the link can claim. Both sender and recipient stay private."
                          : "Only the specified wallet can claim. Sender stays private."}
                      </p>
                    </div>

                    {/* Amount */}
                    <div className="field" style={{ marginBottom: 4 }}>
                      <div className="field-label">Amount</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <input
                          className="input input-amount"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder="0.00"
                          inputMode="decimal"
                        />
                        <TokenPicker value={token} onChange={setToken} />
                      </div>
                      {amountError && amount && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>{amountError}</p>}
                    </div>

                    <div className="divider" />

                    {/* Recipient lock */}
                    {mode === "locked" && (
                      <div className="field" style={{ marginBottom: 18 }}>
                        <span className="field-label">Recipient address</span>
                        <input
                          className="input mono"
                          value={recipientAddress}
                          onChange={(e) => setRecipientAddress(e.target.value.trim())}
                          placeholder="Solana wallet address…"
                        />
                        {recipientError && <p style={{ fontSize: 12, color: "#dc2626" }}>{recipientError}</p>}
                      </div>
                    )}

                    {/* Expiry */}
                    <div className="field" style={{ marginBottom: 20 }}>
                      <span className="field-label">Expires in</span>
                      <div className="seg" style={{ alignSelf: "start" }}>
                        {["1", "7", "30"].map((d) => (
                          <button key={d} className={expires === d ? "is-active" : ""} onClick={() => setExpires(d)}>{d}d</button>
                        ))}
                      </div>
                      <span style={{ fontSize: 12, color: "var(--ink-3)" }}>Unclaimed funds return to your balance after expiry.</span>
                    </div>

                    {/* Optional memo — encoded in URL hash, never stored server-side */}
                    <div className="field" style={{ marginBottom: 20 }}>
                      <span className="field-label">Message to recipient <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>(optional)</span></span>
                      <input
                        className="input"
                        value={memo}
                        onChange={(e) => setMemo(e.target.value.slice(0, 200))}
                        placeholder="e.g. Invoice #42, coffee money, thanks!"
                        maxLength={200}
                      />
                      <span style={{ fontSize: 11.5, color: "var(--ink-4)" }}>
                        Encoded in the link — only the recipient sees it. Never stored on any server.
                      </span>
                    </div>

                    {error && (
                      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(220,38,38,0.08)", border: "0.5px solid rgba(220,38,38,0.2)", marginBottom: 16 }}>
                        <AlertTriangle size={14} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
                        <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{error}</p>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      {connected ? (
                        <button className="btn btn-primary" onClick={handleCreate} disabled={!canCreate} style={{ width: "100%", justifyContent: "center" }}>
                          <Lock size={16} /> Create private link
                        </button>
                      ) : (
                        <div style={{ width: "100%" }}>
                          <ConnectWalletButton label="Connect Wallet to Create" variant="primary" />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}

            {/* ── CONFIDENTIAL FLOW ── */}
            {transferType === "confidential" && (
              <>
                {confStep === "done" ? (
                  <div style={{ textAlign: "center" }}>
                    <div className="success-mark" style={{ marginInline: "auto" }}><Check size={24} /></div>
                    <h2 className="card-title" style={{ fontSize: 22, marginTop: 14, textAlign: "center" }}>Sent confidentially.</h2>
                    <p className="card-sub" style={{ textAlign: "center" }}>The recipient holds an encrypted note. They withdraw from their Dashboard.</p>
                    <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 8 }}>
                      <a
                        href={`https://solscan.io/tx/${confTxSig}${clusterQuery}`}
                        target="_blank" rel="noopener noreferrer"
                        className="btn btn-glass btn-sm"
                      >
                        <ExternalLink size={13} /> View on Solscan
                      </a>
                      <a href="/dashboard" className="btn btn-primary btn-sm">
                        <ArrowRight size={13} /> Dashboard
                      </a>
                    </div>
                    <button className="btn btn-ghost btn-sm" style={{ marginTop: 8, width: "100%", justifyContent: "center" }} onClick={() => { setConfStep("input"); setConfRecipient(""); setConfAmount(""); setConfTxSig(""); }}>
                      Send another
                    </button>
                  </div>
                ) : confStep === "sending" ? (
                  <div style={{ textAlign: "center", padding: "40px 0" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 100, height: 100, objectFit: "contain", margin: "0 auto 20px", display: "block" }} />
                    <p style={{ fontWeight: 600, fontSize: 22, marginBottom: 8, letterSpacing: "-0.02em" }}>Encrypting transfer</p>
                    <p style={{ color: "var(--ink-3)", fontSize: 15 }}>{confStatusMsg || "Processing via Arcium MPC…"}</p>
                    <div style={{ display: "flex", gap: 6, justifyContent: "center", marginTop: 20 }}>
                      {[0, 1, 2].map((i) => (
                        <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--vp-violet)", opacity: 0.6, animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "rgba(107,124,255,0.06)", border: "0.5px solid rgba(107,124,255,0.2)", marginBottom: 20 }}>
                      <p style={{ fontSize: 12.5, color: "var(--ink-2)", margin: 0, lineHeight: 1.6 }}>
                        <strong>Confidential transfer</strong> — amount is hidden on-chain. Funds land in the recipient&apos;s encrypted VeilPay balance.{" "}
                        They must have connected to VeilPay at least once to receive.
                      </p>
                    </div>

                    <div className="field" style={{ marginBottom: 18 }}>
                      <span className="field-label">Recipient VeilPay address</span>
                      <input
                        className="input mono"
                        value={confRecipient}
                        onChange={(e) => setConfRecipient(e.target.value.trim())}
                        placeholder="Solana address…"
                      />
                      {confRecipientError && <p style={{ fontSize: 12, color: "#dc2626" }}>{confRecipientError}</p>}
                    </div>

                    <div className="field" style={{ marginBottom: 4 }}>
                      <div className="field-label">Amount</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                        <input
                          className="input input-amount"
                          value={confAmount}
                          onChange={(e) => setConfAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder="0.00"
                          inputMode="decimal"
                        />
                        <TokenPicker value={confToken} onChange={setConfToken} />
                      </div>
                      {confAmountError && confAmount && <p style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>{confAmountError}</p>}
                    </div>

                    <div className="divider" />

                    {confError && (
                      <div style={{ display: "flex", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(220,38,38,0.08)", border: "0.5px solid rgba(220,38,38,0.2)", marginBottom: 16 }}>
                        <AlertTriangle size={14} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
                        <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{confError}</p>
                      </div>
                    )}

                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      {connected ? (
                        <button className="btn btn-primary" onClick={handleConfSend} disabled={!canSendConf} style={{ width: "100%", justifyContent: "center" }}>
                          <Send size={16} /> Send confidentially
                        </button>
                      ) : (
                        <div style={{ width: "100%" }}>
                          <ConnectWalletButton label="Connect Wallet to Send" variant="primary" />
                        </div>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </section>
    </AppShell>
  );
}
