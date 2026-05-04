"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppShell } from "@/components/AppShell";
import { ConnectWalletButton } from "@/components/WalletModal";
import { useWalletContext } from "@/components/WalletContext";
import { createPaymentLink, preloadCreateAssets } from "@/lib/umbra";
import { TOKEN_CONFIG, NETWORK } from "@/lib/constants";
import type { Token } from "@/types";
import { Gift, ChevronDown, Copy, Check, ExternalLink, QrCode } from "lucide-react";

type GiftStep = "input" | "creating" | "done";

const TOKEN_LOGOS: Record<Token, string> = {
  SOL: "/tokens/sol.png", USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  UMBRA: "/tokens/umbra.png", CASH: "/tokens/cash.png",
};

const USDC_PRESETS = [1, 5, 10, 25, 50, 100];
const clusterQuery = NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`;

// ─── Token picker (reused portal pattern) ─────────────────────────────────────
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GiftPage() {
  const { connected, wallet, account } = useWalletContext();

  const [step, setStep] = useState<GiftStep>("input");
  const [token, setToken] = useState<Token>("USDC");
  const [preset, setPreset] = useState<number | null>(10); // selected preset
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

  useEffect(() => { preloadCreateAssets(); }, []);

  // Effective amount: preset takes priority unless user typed a custom value
  const effectiveAmount = customAmount
    ? customAmount
    : preset !== null
    ? String(preset)
    : "";

  const handlePreset = (p: number) => {
    setPreset(p);
    setCustomAmount("");
  };

  const handleCustomChange = (v: string) => {
    setCustomAmount(v);
    setPreset(null);
  };

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

      // Inject gift params into the query string
      const base = window.location.origin;
      const urlObj = new URL(url.startsWith("http") ? url : base + url);
      urlObj.searchParams.set("type", "gift");
      // Use giftfrom/giftto — avoids collision with ?to= which the claim page
      // treats as a wallet address lock on regular (non-gift) payment links.
      if (fromName.trim()) urlObj.searchParams.set("giftfrom", fromName.trim());
      if (toName.trim()) urlObj.searchParams.set("giftto", toName.trim());
      const giftUrl = urlObj.pathname + urlObj.search + urlObj.hash;
      const fullGiftUrl = base + giftUrl;

      // Store deposit tx for Solscan link
      const txMatch = url.match(/lid=([^&]+)/);
      setResultTx(txMatch?.[1] ?? "");

      // Generate QR
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(fullGiftUrl, {
        width: 280, margin: 2, color: { dark: "#0a1428", light: "#ffffff" },
      });

      setResultUrl(fullGiftUrl);
      setQrDataUrl(qr);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      setStep("input");
    }
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(resultUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const amountNum = parseFloat(effectiveAmount || "0");
  const canCreate = connected && amountNum > 0;

  return (
    <AppShell active="gift">
      <section className="app-head">
        <div className="container" style={{ maxWidth: 560, textAlign: "center" }}>
          <span className="eyebrow" style={{ display: "inline-flex", gap: 8 }}>
            <Gift size={13} /> Private Gift Card
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

                {/* Denomination presets — only for USDC */}
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

                {/* Custom amount */}
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
                      outline: "none", fontFamily: "var(--font-sans)",
                      boxSizing: "border-box",
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

              {/* CTA */}
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
                  <Gift size={16} />
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
              {/* Animated gift icon */}
              <div style={{ fontSize: 48, marginBottom: 16, animation: "float 2s ease-in-out infinite" }}>🎁</div>
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
                {/* Decorative blobs */}
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
                    <span style={{ fontSize: 32 }}>🎁</span>
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
                          "{message}"
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

              {/* Actions card */}
              <div className="card glass card-pad-lg reveal in">
                <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 4 }}>Share this gift card</p>
                <p style={{ color: "var(--ink-3)", fontSize: 13, marginBottom: 20 }}>
                  Send the link to the recipient. They claim it into their own wallet — no address required.
                </p>

                {/* Link */}
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

                {/* QR */}
                {qrDataUrl && (
                  <div style={{ textAlign: "center", marginBottom: 16 }}>
                    <div style={{
                      display: "inline-block", padding: 12,
                      background: "#ffffff", borderRadius: 16,
                      boxShadow: "0 4px 20px rgba(0,0,0,.25)",
                    }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={qrDataUrl} alt="Gift card QR" style={{ width: 200, height: 200, display: "block" }} />
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
