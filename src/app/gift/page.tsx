"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/AppShell";
import { ConnectWalletButton } from "@/components/WalletModal";
import { useWalletContext } from "@/components/WalletContext";
import {
  createPaymentLink, preloadCreateAssets,
  getStrandedEphemerals, recoverStrandedEphemeral, type StrandedEphemeral,
} from "@/lib/umbra";
import { TOKEN_CONFIG, NETWORK } from "@/lib/constants";
import type { Token } from "@/types";
import { ChevronDown, Copy, Check, ExternalLink, QrCode, AlertTriangle, Download } from "lucide-react";

type GiftStep = "input" | "creating" | "done";

const TOKEN_LOGOS: Record<Token, string> = {
  SOL: "/tokens/sol.png", USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  UMBRA: "/tokens/umbra.png", CASH: "/tokens/cash.png",
};

const USDC_PRESETS = [1, 5, 10, 25, 50, 100];
const clusterQuery = NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`;

// ─── Custom VeilPay gift card icon ────────────────────────────────────────────

function VPGiftCardIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1.5" y="4.5" width="15" height="10" rx="1.8" />
      <line x1="1.5" y1="8" x2="16.5" y2="8" />
      <path d="M13.5 2.5V1M13.5 2.5L15 2.5M13.5 2.5V4M13.5 2.5L12 2.5" strokeWidth="1.2" />
      <line x1="4" y1="11" x2="7.5" y2="11" />
      <line x1="4" y1="13" x2="10" y2="13" />
    </svg>
  );
}

// ─── Token picker (portal pattern) ───────────────────────────────────────────

function TokenPicker({ value, onChange }: { value: Token; onChange: (t: Token) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

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
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !dropRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const dropdown = (
    <div ref={dropRef} className="glass" style={{
      position: "fixed", top: pos.top, right: pos.right,
      zIndex: 99999, padding: 6, minWidth: 210, borderRadius: 14,
    }}>
      {(Object.keys(TOKEN_CONFIG) as Token[]).map(t => (
        <button key={t} onClick={() => { onChange(t); setOpen(false); }} style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "9px 12px", width: "100%", borderRadius: 10, border: "none",
          background: t === value ? "var(--glass-bg-strong)" : "transparent", cursor: "pointer",
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={TOKEN_LOGOS[t]} alt={t} style={{ width: 22, height: 22, borderRadius: "50%", objectFit: "cover" }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{t}</span>
          <span style={{ color: "var(--ink-3)", fontSize: 12, marginLeft: "auto" }}>{TOKEN_CONFIG[t].name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      <button ref={btnRef} onClick={open ? () => setOpen(false) : openMenu} style={{
        display: "inline-flex", alignItems: "center", gap: 7,
        padding: "8px 12px 8px 10px", borderRadius: 10,
        background: "var(--glass-bg-strong)", border: "0.5px solid var(--glass-border)",
        cursor: "pointer", outline: "none",
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={TOKEN_LOGOS[value]} alt={value} style={{ width: 20, height: 20, borderRadius: "50%", objectFit: "cover" }} />
        <span style={{ fontWeight: 600, fontSize: 13, color: "var(--ink)" }}>{value}</span>
        <ChevronDown size={12} style={{ color: "var(--ink-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform .15s" }} />
      </button>
      {mounted && open && createPortal(dropdown, document.body)}
    </>
  );
}

// ─── Canvas-based gift card generator ────────────────────────────────────────

interface GiftCardParams {
  amount: number;
  token: Token;
  fromName: string;
  toName: string;
  qrDataUrl: string;
}

async function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function downloadGiftCardFront(params: GiftCardParams) {
  const W = 1012, H = 638;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // Clip to card shape
  roundRect(ctx, 0, 0, W, H, 44);
  ctx.clip();

  // Background gradient
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, "#0a1428");
  bg.addColorStop(0.5, "#0d1f3a");
  bg.addColorStop(1, "#071020");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Sky orb (top-left)
  const orb1 = ctx.createRadialGradient(-60, -60, 0, -60, -60, 440);
  orb1.addColorStop(0, "rgba(0,179,255,0.50)");
  orb1.addColorStop(1, "rgba(0,179,255,0)");
  ctx.fillStyle = orb1;
  ctx.fillRect(0, 0, W, H);

  // Violet orb (bottom-right)
  const orb2 = ctx.createRadialGradient(W + 140, H + 120, 0, W + 140, H + 120, 520);
  orb2.addColorStop(0, "rgba(107,124,255,0.40)");
  orb2.addColorStop(1, "rgba(107,124,255,0)");
  ctx.fillStyle = orb2;
  ctx.fillRect(0, 0, W, H);

  // Logo centered
  const logo = await loadImage("/logo-nobg.png");
  if (logo) {
    const logoW = 320;
    const logoH = (logo.naturalHeight / logo.naturalWidth) * logoW;
    // Glow under logo
    const logoGlow = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 200);
    logoGlow.addColorStop(0, "rgba(0,179,255,0.18)");
    logoGlow.addColorStop(1, "rgba(0,179,255,0)");
    ctx.fillStyle = logoGlow;
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(logo, (W - logoW) / 2, (H - logoH) / 2, logoW, logoH);
  }

  // Amount — top right
  const amtStr = params.amount % 1 === 0 ? String(params.amount) : params.amount.toFixed(2);
  ctx.font = "bold 72px 'Geist', system-ui, sans-serif";
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "right";
  ctx.fillText(amtStr, W - 70, 110);
  ctx.font = "500 32px 'Geist', system-ui, sans-serif";
  ctx.fillStyle = "rgba(255,255,255,0.50)";
  ctx.fillText(params.token, W - 70, 154);

  // Bottom label (spaced-out monospace style)
  ctx.font = "500 16px 'Geist Mono', 'Geist', monospace";
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.textAlign = "center";
  ctx.fillText("P R I V A T E   P A Y M E N T   / /   Z E R O   T R A C E S", W / 2, H - 48);

  // Download
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "veilpay-gift-front.png"; a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

async function downloadGiftCardBack(params: GiftCardParams) {
  const W = 1012, H = 638;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  roundRect(ctx, 0, 0, W, H, 44);
  ctx.clip();

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const PL = 72;

  // Title
  ctx.fillStyle = "#000000";
  ctx.font = "bold 44px 'Geist', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("Claim your gift", PL, 130);

  // Instructions
  ctx.fillStyle = "#444444";
  ctx.font = "400 22px 'Geist', system-ui, sans-serif";
  ctx.fillText("1.  Open your camera or QR scanner.", PL, 190);
  ctx.fillText("2.  Scan the QR code on the right.", PL, 228);
  ctx.fillText("3.  Connect your wallet and confirm.", PL, 266);

  // From / To
  const fieldY = 360;
  ctx.fillStyle = "#aaaaaa";
  ctx.font = "700 13px 'Geist', system-ui, sans-serif";
  ctx.fillText("FROM", PL, fieldY - 6);
  ctx.fillText("TO", PL + 260, fieldY - 6);

  ctx.fillStyle = "#000000";
  ctx.font = "400 20px 'Geist', system-ui, sans-serif";
  ctx.fillText(params.fromName || "—", PL, fieldY + 28);
  ctx.fillText(params.toName || "—", PL + 260, fieldY + 28);

  ctx.strokeStyle = "#eeeeee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PL, fieldY + 42); ctx.lineTo(PL + 220, fieldY + 42);
  ctx.moveTo(PL + 260, fieldY + 42); ctx.lineTo(PL + 480, fieldY + 42);
  ctx.stroke();

  // QR code (right side — black box)
  const QR_SIZE = 270;
  const QR_X = W - QR_SIZE - PL - 20;
  const QR_Y = (H - QR_SIZE) / 2 - 30;

  roundRect(ctx, QR_X - 20, QR_Y - 20, QR_SIZE + 40, QR_SIZE + 40, 24);
  ctx.fillStyle = "#000000";
  ctx.fill();

  const qrImg = await loadImage(params.qrDataUrl);
  if (qrImg) {
    ctx.drawImage(qrImg, QR_X, QR_Y, QR_SIZE, QR_SIZE);
  }

  // "Scan to claim" label
  ctx.fillStyle = "#888888";
  ctx.font = "700 14px 'Geist Mono', 'Geist', monospace";
  ctx.textAlign = "center";
  ctx.fillText("SCAN TO CLAIM", QR_X + QR_SIZE / 2, QR_Y + QR_SIZE + 50);

  // Footer divider
  const footerY = H - 38;
  ctx.strokeStyle = "#eeeeee";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PL, footerY - 22); ctx.lineTo(W - PL, footerY - 22);
  ctx.stroke();

  ctx.fillStyle = "#888888";
  ctx.font = "400 13px 'Geist', system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("POWERED BY UMBRA ZK-SHIELDED POOL  //  SOLANA MAINNET", PL, footerY);

  ctx.fillStyle = "#000000";
  ctx.font = "bold 22px 'Geist', system-ui, sans-serif";
  ctx.textAlign = "right";
  ctx.fillText("VEILPAY.XYZ", W - PL, footerY);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "veilpay-gift-back.png"; a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GiftPage() {
  const { connected, wallet, account } = useWalletContext();

  // Stranded ephemeral recovery
  const [stranded, setStranded] = useState<StrandedEphemeral[]>([]);
  const [recoveringAddr, setRecoveringAddr] = useState<string | null>(null);
  const [recoveryStatus, setRecoveryStatus] = useState("");
  useEffect(() => { setStranded(getStrandedEphemerals()); }, []);

  const handleRecover = async (entry: StrandedEphemeral) => {
    setRecoveringAddr(entry.address);
    setRecoveryStatus("Starting…");
    try {
      const sig = await recoverStrandedEphemeral(entry, setRecoveryStatus);
      setRecoveryStatus(`Recovered! Solscan: https://solscan.io/tx/${sig}`);
      setStranded(getStrandedEphemerals());
    } catch (e) {
      setRecoveryStatus(e instanceof Error ? e.message : "Recovery failed");
    } finally {
      setRecoveringAddr(null);
    }
  };

  const [step, setStep] = useState<GiftStep>("input");
  const [token, setToken] = useState<Token>("USDC");
  const [preset, setPreset] = useState<number | null>(10);
  const [customAmount, setCustomAmount] = useState("");
  const [fromName, setFromName] = useState("");
  const [toName, setToName] = useState("");
  const [message, setMessage] = useState("");
  const [statusMsg, setStatusMsg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [resultTx, setResultTx] = useState("");
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");
  const [downloadingFront, setDownloadingFront] = useState(false);
  const [downloadingBack, setDownloadingBack] = useState(false);

  useEffect(() => { preloadCreateAssets(); }, []);

  const effectiveAmount = customAmount
    ? customAmount
    : preset !== null
    ? String(preset)
    : "";

  const handlePreset = (p: number) => { setPreset(p); setCustomAmount(""); };
  const handleCustomChange = (v: string) => { setCustomAmount(v); setPreset(null); };

  const handleCreate = async () => {
    if (!wallet || !account || !effectiveAmount || parseFloat(effectiveAmount) <= 0) return;
    setError(null);
    setStep("creating");

    const memo = message.trim().slice(0, 200) || undefined;

    try {
      const { url } = await createPaymentLink({
        senderWallet: wallet,
        senderAccount: account,
        amountHuman: effectiveAmount,
        token,
        memo,
        onStatusChange: setStatusMsg,
      });

      const base = window.location.origin;
      const urlObj = new URL(url.startsWith("http") ? url : base + url);
      urlObj.searchParams.set("type", "gift");
      if (fromName.trim()) urlObj.searchParams.set("giftfrom", fromName.trim());
      if (toName.trim()) urlObj.searchParams.set("giftto", toName.trim());
      const fullGiftUrl = base + urlObj.pathname + urlObj.search + urlObj.hash;

      const txMatch = url.match(/lid=([^&]+)/);
      setResultTx(txMatch?.[1] ?? "");

      // Generate QR (dark navy on sky-blue, on-brand)
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(fullGiftUrl, {
        width: 280, margin: 2, color: { dark: "#0a1428", light: "#ffffff" },
      });

      setResultUrl(fullGiftUrl);
      setQrDataUrl(qr);
      setStep("done");
      // Refresh stranded list on success (clear any previously saved from this wallet)
      setStranded(getStrandedEphemerals());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStep("input");
      setStranded(getStrandedEphemerals());
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(resultUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadFront = async () => {
    setDownloadingFront(true);
    try {
      await downloadGiftCardFront({ amount: amountNum, token, fromName, toName, qrDataUrl });
    } finally {
      setDownloadingFront(false);
    }
  };

  const handleDownloadBack = async () => {
    setDownloadingBack(true);
    try {
      await downloadGiftCardBack({ amount: amountNum, token, fromName, toName, qrDataUrl });
    } finally {
      setDownloadingBack(false);
    }
  };

  const amountNum = parseFloat(effectiveAmount || "0");
  const canCreate = connected && amountNum > 0;

  return (
    <AppShell active="gift">

      {/* ── Stranded ephemeral recovery banner ── */}
      {stranded.length > 0 && (
        <div style={{ background: "rgba(245,158,11,0.10)", borderBottom: "0.5px solid rgba(245,158,11,0.30)", padding: "12px 24px" }}>
          <div className="container" style={{ maxWidth: 560 }}>
            {stranded.map((entry) => (
              <div key={entry.address} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <AlertTriangle size={15} style={{ color: "#f59e0b", flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: "var(--ink-2)", flex: 1 }}>
                  A previous gift card creation failed — <strong style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{entry.address.slice(0,8)}…</strong> still holds SOL.
                </span>
                {recoveringAddr === entry.address ? (
                  <span style={{ fontSize: 12, color: "var(--ink-3)" }}>{recoveryStatus}</span>
                ) : (
                  <button
                    className="btn btn-glass btn-sm"
                    style={{ fontSize: 12, color: "#f59e0b", borderColor: "rgba(245,158,11,0.35)" }}
                    onClick={() => handleRecover(entry)}
                  >
                    Recover SOL →
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <section className="app-head">
        <div className="container" style={{ maxWidth: 560, textAlign: "center" }}>
          <span className="eyebrow" style={{ display: "inline-flex", gap: 8 }}>
            <VPGiftCardIcon size={13} /> Private Gift Card
          </span>
          <h1 className="h2" style={{ textAlign: "center" }}>Send a gift, <em>privately.</em></h1>
          <p className="lead" style={{ textAlign: "center", margin: "0 auto" }}>
            Recipient claims into their own wallet. No addresses exchanged — no on-chain link.
          </p>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ maxWidth: 520 }}>

          {/* ── Input ── */}
          {step === "input" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Amount card */}
              <div className="card glass card-pad-lg reveal in">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
                  <p style={{ fontWeight: 600, fontSize: 16, letterSpacing: "-0.02em" }}>Amount</p>
                  <TokenPicker value={token} onChange={(t) => { setToken(t); setPreset(null); setCustomAmount(""); }} />
                </div>

                {token === "USDC" && (
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 14 }}>
                    {USDC_PRESETS.map(p => (
                      <button
                        key={p}
                        onClick={() => handlePreset(p)}
                        style={{
                          padding: "11px 8px", borderRadius: 12, fontSize: 15, fontWeight: 700,
                          letterSpacing: "-0.02em", cursor: "pointer",
                          border: preset === p ? "1.5px solid rgba(0,179,255,.6)" : "0.5px solid var(--glass-border)",
                          background: preset === p ? "rgba(0,179,255,.10)" : "var(--glass-bg)",
                          color: preset === p ? "var(--vp-sky-2)" : "var(--ink)",
                          transition: "all .12s",
                        }}
                      >
                        ${p}
                      </button>
                    ))}
                  </div>
                )}

                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    placeholder={token === "USDC" ? "Custom amount…" : "Amount…"}
                    value={customAmount}
                    onChange={e => handleCustomChange(e.target.value)}
                    min="0" step="any"
                    style={{
                      width: "100%", background: "var(--glass-bg)",
                      border: customAmount ? "0.5px solid rgba(0,179,255,.4)" : "0.5px solid var(--glass-border)",
                      borderRadius: 12, padding: "11px 60px 11px 14px",
                      fontSize: 16, fontWeight: 500, color: "var(--ink)",
                      outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box",
                    }}
                  />
                  <span style={{
                    position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
                    fontSize: 12, fontWeight: 600, color: "var(--ink-4)",
                  }}>{token}</span>
                </div>
              </div>

              {/* Personalise card */}
              <div className="card glass card-pad-lg reveal in">
                <p style={{ fontWeight: 600, fontSize: 15, letterSpacing: "-0.02em", marginBottom: 16 }}>
                  Personalise <span style={{ fontWeight: 400, fontSize: 13, color: "var(--ink-4)" }}>— optional</span>
                </p>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 6 }}>From</label>
                    <input
                      type="text" placeholder="Your name"
                      value={fromName} onChange={e => setFromName(e.target.value)}
                      maxLength={40}
                      style={{
                        width: "100%", background: "var(--glass-bg)", border: "0.5px solid var(--glass-border)",
                        borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--ink)",
                        outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 6 }}>To</label>
                    <input
                      type="text" placeholder="Their name"
                      value={toName} onChange={e => setToName(e.target.value)}
                      maxLength={40}
                      style={{
                        width: "100%", background: "var(--glass-bg)", border: "0.5px solid var(--glass-border)",
                        borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--ink)",
                        outline: "none", fontFamily: "var(--font-sans)", boxSizing: "border-box",
                      }}
                    />
                  </div>
                </div>

                <label style={{ display: "block", fontSize: 11, fontWeight: 600, letterSpacing: "0.07em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 6 }}>Message</label>
                <textarea
                  placeholder="Write a message…"
                  value={message} onChange={e => setMessage(e.target.value)}
                  maxLength={200} rows={3}
                  style={{
                    width: "100%", background: "var(--glass-bg)", border: "0.5px solid var(--glass-border)",
                    borderRadius: 10, padding: "10px 12px", fontSize: 13, color: "var(--ink)",
                    outline: "none", fontFamily: "var(--font-sans)", resize: "none",
                    boxSizing: "border-box", lineHeight: 1.5,
                  }}
                />
                <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 4, textAlign: "right" }}>
                  {message.length}/200
                </p>
              </div>

              {error && (
                <p style={{ color: "#ef4444", fontSize: 13, padding: "0 4px" }}>{error}</p>
              )}

              {!connected ? (
                <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
                  <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 16 }}>Connect your wallet to send a gift card.</p>
                  <ConnectWalletButton variant="primary" />
                </div>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handleCreate}
                  disabled={!canCreate}
                  style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "14px" }}
                >
                  <VPGiftCardIcon size={16} />
                  {amountNum > 0
                    ? `Create ${amountNum} ${token} Gift Card`
                    : "Create Gift Card"}
                </button>
              )}
            </div>
          )}

          {/* ── Creating ── */}
          {step === "creating" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(217,119,6,.12)", border: "0.5px solid rgba(217,119,6,.3)", display: "grid", placeItems: "center", margin: "0 auto 18px", color: "#d97706", animation: "float 2s ease-in-out infinite" }}>
                <VPGiftCardIcon size={26} />
              </div>
              <p style={{ fontWeight: 600, fontSize: 18, letterSpacing: "-0.02em", marginBottom: 8 }}>
                Creating gift card…
              </p>
              <p style={{ color: "var(--vp-sky)", fontSize: 14, fontWeight: 500, marginBottom: 4 }}>
                {statusMsg || "Preparing…"}
              </p>
              <p style={{ color: "var(--ink-4)", fontSize: 12 }}>
                ZK proof generation takes 15–30 seconds. Do not close this page.
              </p>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

              {/* Gift card preview */}
              <div style={{
                borderRadius: 24, overflow: "hidden",
                background: "linear-gradient(135deg, #0a1428 0%, #0d1f3a 50%, #071020 100%)",
                border: "0.5px solid rgba(0,179,255,.25)",
                boxShadow: "0 20px 60px -12px rgba(0,0,0,.6), 0 0 0 1px rgba(0,179,255,.1)",
                position: "relative",
              }}>
                <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,179,255,.15), transparent 70%)", pointerEvents: "none" }} />
                <div style={{ position: "absolute", bottom: -30, left: -30, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(107,124,255,.12), transparent 70%)", pointerEvents: "none" }} />

                <div style={{ position: "relative", padding: "28px 28px 24px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
                    <div>
                      <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.15em", textTransform: "uppercase", color: "rgba(0,179,255,.7)", marginBottom: 4 }}>
                        VeilPay Gift Card
                      </p>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={TOKEN_LOGOS[token]} alt={token} style={{ width: 28, height: 28, borderRadius: "50%" }} />
                        <p style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-0.04em", color: "#fff", lineHeight: 1 }}>
                          {amountNum % 1 === 0 ? amountNum : amountNum.toFixed(2)} <span style={{ fontSize: 18, fontWeight: 600, opacity: 0.7 }}>{token}</span>
                        </p>
                      </div>
                    </div>
                    <div style={{ color: "rgba(0,179,255,.6)" }}><VPGiftCardIcon size={28} /></div>
                  </div>

                  {(toName || fromName || message) && (
                    <div style={{ borderTop: "0.5px solid rgba(255,255,255,.08)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 6 }}>
                      {toName && (
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)" }}>
                          <span style={{ color: "rgba(255,255,255,.35)", marginRight: 6 }}>To</span>
                          <span style={{ color: "rgba(255,255,255,.85)", fontWeight: 500 }}>{toName}</span>
                        </p>
                      )}
                      {message && (
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,.6)", fontStyle: "italic", lineHeight: 1.4 }}>
                          &ldquo;{message}&rdquo;
                        </p>
                      )}
                      {fromName && (
                        <p style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 2 }}>
                          — {fromName}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Download card */}
              <div className="card glass card-pad-lg reveal in">
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Download gift card</p>
                <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 16 }}>
                  Save as PNG to print or send digitally. Front is the branded card; back has the QR code to claim.
                </p>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="btn btn-glass"
                    onClick={handleDownloadFront}
                    disabled={downloadingFront}
                    style={{ flex: 1, justifyContent: "center", fontSize: 13 }}
                  >
                    <Download size={13} />
                    {downloadingFront ? "Generating…" : "Front"}
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={handleDownloadBack}
                    disabled={downloadingBack || !qrDataUrl}
                    style={{ flex: 1, justifyContent: "center", fontSize: 13 }}
                  >
                    <QrCode size={13} />
                    {downloadingBack ? "Generating…" : "Back (with QR)"}
                  </button>
                </div>
              </div>

              {/* Share card */}
              <div className="card glass card-pad-lg reveal in">
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Or share the link</p>
                <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 16 }}>
                  Send directly — recipient scans or taps to claim into their own wallet.
                </p>

                <div style={{
                  display: "flex", alignItems: "center", gap: 8,
                  background: "var(--glass-bg)", border: "0.5px solid var(--glass-border)",
                  borderRadius: 10, padding: "10px 12px", marginBottom: 16,
                }}>
                  <p style={{ flex: 1, fontSize: 12, color: "var(--ink-3)", fontFamily: "var(--font-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {resultUrl}
                  </p>
                  <button
                    className="btn btn-glass btn-sm"
                    onClick={copyLink}
                    style={{ fontSize: 12, flexShrink: 0, gap: 5 }}
                  >
                    {copied ? <><Check size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
                  </button>
                </div>

                {/* QR preview */}
                {qrDataUrl && (
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{
                      display: "inline-block", padding: 12,
                      background: "#ffffff", borderRadius: 16,
                      boxShadow: "0 4px 20px rgba(0,0,0,.25)",
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="Gift card QR" style={{ width: 180, height: 180, display: "block" }} />
                    </div>
                    <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 8 }}>
                      <QrCode size={10} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                      Recipient scans to claim
                    </p>
                  </div>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                  {resultTx && (
                    <a
                      href={`https://solscan.io/tx/${resultTx}${clusterQuery}`}
                      target="_blank" rel="noopener noreferrer"
                      className="btn btn-glass btn-sm"
                      style={{ fontSize: 12, gap: 5 }}
                    >
                      <ExternalLink size={12} /> Solscan
                    </a>
                  )}
                  <button
                    className="btn btn-glass btn-sm"
                    onClick={() => { setStep("input"); setResultUrl(""); setResultTx(""); setQrDataUrl(""); setCustomAmount(""); setPreset(10); setFromName(""); setToName(""); setMessage(""); setError(null); }}
                    style={{ fontSize: 12 }}
                  >
                    New gift card
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
      `}</style>
    </AppShell>
  );
}
