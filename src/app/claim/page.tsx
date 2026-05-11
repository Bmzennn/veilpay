"use client";

import { useEffect, useLayoutEffect, useState, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { ConnectWalletButton } from "@/components/WalletModal";
import { useWalletContext } from "@/components/WalletContext";
import { scanForUtxo, claimPaymentLink, parseClaimHash, preloadClaimAssets } from "@/lib/umbra";
import { NETWORK } from "@/lib/constants";
import type { Wallet, WalletAccount } from "@wallet-standard/core";
import type { ClaimStep, Token } from "@/types";
import { Shield, AlertTriangle, UserCheck, Check, ExternalLink, ArrowRight, MessageSquare } from "lucide-react";

// ─── Custom VeilPay icons ─────────────────────────────────────────────────────

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

function VPShieldCheckIcon({ size = 48 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M24 4L40 12v12c0 10-7 18-16 20C8 42 2 34 2 26V12L24 4z" stroke="rgba(52,211,153,0.9)" strokeWidth="2" fill="rgba(52,211,153,0.12)" />
      <path d="M16 24l6 6 10-12" stroke="rgba(52,211,153,1)" strokeWidth="2.5" />
    </svg>
  );
}

function makeSignMessage(wallet: Wallet, account: WalletAccount) {
  return async (message: Uint8Array): Promise<Uint8Array> => {
    const feature = wallet.features["solana:signMessage"] as {
      signMessage: (...inputs: readonly { account: WalletAccount; message: Uint8Array }[]) => Promise<readonly { signature: Uint8Array }[]>;
    };
    const results = await feature.signMessage({ account, message });
    return results[0].signature;
  };
}

const clusterQuery = NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`;

export default function ClaimPage() {
  const { connected, address, wallet, account } = useWalletContext();

  const [claimSecret, setClaimSecret] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);
  const [lockedTo, setLockedTo] = useState<string | null>(null);
  const [memo, setMemo] = useState<string | null>(null);

  // Gift card mode — set when ?type=gift is in the URL
  const [isGift, setIsGift] = useState(false);
  const [giftFrom, setGiftFrom] = useState<string | null>(null);
  const [giftTo, setGiftTo] = useState<string | null>(null);
  const [giftUnwrapped, setGiftUnwrapped] = useState(false);

  const [step, setStep] = useState<ClaimStep>("scanning");
  const [statusMsg, setStatusMsg] = useState("Scanning pool…");
  const [amount, setAmount] = useState("—");
  const [token, setToken] = useState<Token>("USDC");
  const [txSig, setTxSig] = useState("");
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useLayoutEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    preloadClaimAssets();
    const raw = window.location.hash.replace("#", "");
    if (raw && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (!raw) { setError("No claim key found in this link."); setStep("preview"); return; }
    const params = new URLSearchParams(window.location.search);
    const expMs = params.get("exp");
    if (expMs && Date.now() > Number(expMs)) { setError("This payment link has expired."); setStep("preview"); return; }
    setLinkId(params.get("lid"));

    if (params.get("type") === "gift") {
      // Gift cards: ?giftfrom / ?giftto are display names only, never wallet locks
      setIsGift(true);
      setGiftFrom(params.get("giftfrom") ?? params.get("from")); // legacy compat
      setGiftTo(params.get("giftto") ?? null);
    } else {
      // Regular links: ?to is a wallet address lock
      const to = params.get("to");
      if (to) setLockedTo(to);
    }
    const { claimSecret: secret, token: parsedToken, memo: parsedMemo } = parseClaimHash(raw);
    setClaimSecret(secret);
    setToken(parsedToken);
    if (parsedMemo) setMemo(parsedMemo);
  }, []);

  const [isResuming, setIsResuming] = useState(false);
  const [isStuckSweep, setIsStuckSweep] = useState(false);

  useEffect(() => {
    if (!claimSecret) return;
    let cancelled = false;
    (async () => {
      try {
        setStep("scanning");
        setStatusMsg("Scanning shielded pool…");
        const result = await scanForUtxo(claimSecret, token, { maxAttempts: 15, retryDelayMs: 4000 });
        if (cancelled) return;
        
        if (!result.hasUtxo && !result.hasEncryptedBalance && !(result as any).hasPublicBalance) {
          setError("No unclaimed payment found for this link.");
          setStep("preview");
          return;
        }

        if (result.hasEncryptedBalance) {
          setIsResuming(true);
        } else if ((result as any).hasPublicBalance) {
          setIsStuckSweep(true);
        }

        setAmount(result.amountHuman);
        setToken(result.token);
        setStep("preview");
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to scan pool");
        setStep("preview");
      }
    })();
    return () => { cancelled = true; };
  }, [claimSecret, token]);

  const walletMismatch = lockedTo !== null && connected && address !== undefined && address !== lockedTo;

  const handleClaim = async () => {
    if (!claimSecret || !address || walletMismatch) return;
    if (!wallet || !account) { setError("Wallet not connected"); return; }
    setError(null);
    setStep("claiming");
    try {
      const result = await claimPaymentLink({
        claimSecret, token, linkId,
        recipientAddress: address,
        onStatusChange: setStatusMsg,
        lockedTo: lockedTo ?? undefined,
        signMessage: makeSignMessage(wallet, account),
      });
      setTxSig(result.signature);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Claim failed");
      setStep("preview");
    }
  };

  return (
    <AppShell active="">
      <section className="app-head">
        <div className="container" style={{ maxWidth: 720, textAlign: "center" }}>
          <span className="eyebrow" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            {isGift ? <><VPGiftCardIcon size={13} /> Gift Card</> : "Claim a private payment"}
          </span>
          <h1 className="h2" style={{ textAlign: "center" }}>
            {isGift ? "You've received a gift." : <>Someone sent you funds <em>privately.</em></>}
          </h1>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ maxWidth: 540 }}>

          {/* ── Gift card envelope (shown before user unwraps) ── */}
          {isGift && !giftUnwrapped && step !== "done" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                borderRadius: 24, overflow: "hidden",
                background: "linear-gradient(135deg, #0a1428 0%, #0d1f3a 50%, #071020 100%)",
                border: "0.5px solid rgba(0,179,255,.25)",
                boxShadow: "0 20px 60px -12px rgba(0,0,0,.6), 0 0 0 1px rgba(0,179,255,.08)",
                position: "relative", marginBottom: 12,
              }}>
                <div style={{ position: "absolute", top: -30, right: -30, width: 140, height: 140, borderRadius: "50%", background: "radial-gradient(circle, rgba(0,179,255,.12), transparent 70%)", pointerEvents: "none" }} />
                <div style={{ position: "relative", padding: "28px 28px 24px", textAlign: "center" }}>
                  <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, animation: "float 2.5s ease-in-out infinite", color: "rgba(0,179,255,0.8)" }}>
                    <VPGiftCardIcon size={52} />
                  </div>
                  {giftTo && (
                    <p style={{ fontSize: 14, color: "rgba(255,255,255,.5)", marginBottom: 6 }}>
                      For <span style={{ color: "rgba(255,255,255,.85)", fontWeight: 600 }}>{giftTo}</span>
                    </p>
                  )}
                  {memo && (
                    <p style={{ fontSize: 15, color: "rgba(255,255,255,.75)", fontStyle: "italic", lineHeight: 1.5, maxWidth: 320, margin: "0 auto 12px" }}>
                      "{memo}"
                    </p>
                  )}
                  {giftFrom && (
                    <p style={{ fontSize: 12, color: "rgba(255,255,255,.35)", marginTop: 8 }}>— {giftFrom}</p>
                  )}
                </div>
              </div>

              {step !== "scanning" && (
                <button
                  className="btn btn-primary"
                  onClick={() => setGiftUnwrapped(true)}
                  style={{ width: "100%", justifyContent: "center", fontSize: 15, padding: "13px" }}
                >
                  <VPGiftCardIcon size={16} /> Unwrap Gift
                </button>
              )}
              {step === "scanning" && (
                <p style={{ textAlign: "center", color: "var(--ink-4)", fontSize: 13 }}>
                  Scanning shielded pool for your gift…
                </p>
              )}
            </div>
          )}

          {/* ── Claimed gift success ── */}
          {isGift && step === "done" && (
            <div style={{ marginBottom: 20 }}>
              <div style={{
                borderRadius: 24, overflow: "hidden",
                background: "linear-gradient(135deg, rgba(52,211,153,.12) 0%, #0a1428 60%)",
                border: "0.5px solid rgba(52,211,153,.3)",
                boxShadow: "0 20px 60px -12px rgba(0,0,0,.5)",
                padding: "32px 28px", textAlign: "center",
              }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <VPShieldCheckIcon size={52} />
                </div>
                <p style={{ fontWeight: 700, fontSize: 26, letterSpacing: "-0.03em", marginBottom: 6, color: "#fff" }}>
                  Gift claimed!
                </p>
                {memo && (
                  <p style={{ fontSize: 14, color: "rgba(255,255,255,.6)", fontStyle: "italic", marginBottom: 4 }}>"{memo}"</p>
                )}
                {giftFrom && (
                  <p style={{ fontSize: 12, color: "rgba(255,255,255,.35)" }}>— {giftFrom}</p>
                )}
              </div>
            </div>
          )}

          {/* ── Show claim UI only after unwrapping (or not a gift) ── */}
          {(!isGift || giftUnwrapped || step === "done") && (<>

          {/* ── Scanning ── */}
          {step === "scanning" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 100, height: 100, objectFit: "contain" }} />
              </div>
              <p style={{ fontWeight: 600, fontSize: 22, marginBottom: 8, letterSpacing: "-0.02em" }}>Scanning shielded pool</p>
              <p style={{ color: "var(--ink-3)", fontSize: 15, marginBottom: 28 }}>{statusMsg}</p>
              <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--vp-sky)", opacity: 0.7, display: "inline-block", animation: `blink 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </div>
            </div>
          )}

          {/* ── Preview ── */}
          {step === "preview" && (
            <div className="card glass card-pad-lg reveal in">
              <div className="claim-stamp">
                <Shield size={13} />
                {error ? "Link status" : "Sealed · ZK proof required"}
              </div>

              {error ? (
                <div style={{ display: "flex", gap: 12, padding: "16px", borderRadius: "var(--radius-sm)", background: "rgba(220,38,38,0.08)", border: "0.5px solid rgba(220,38,38,0.2)", marginBottom: 24 }}>
                  <AlertTriangle size={16} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 14, color: "#dc2626", margin: 0, lineHeight: 1.5 }}>{error}</p>
                </div>
              ) : (
                <>
                  {/* Amount */}
                  <div className="claim-amount">
                    <span>{amount}</span>
                    <span style={{ color: "var(--ink-3)", fontWeight: 400, fontSize: 28 }}>{token}</span>
                  </div>

                  <div style={{ padding: "16px 0", borderTop: "1px solid var(--hairline)", marginBottom: 20 }}>
                    <div className="field-label" style={{ marginBottom: 6 }}>Status</div>
                    <p style={{ fontSize: 14, color: "var(--ink-2)" }}>
                      {isStuckSweep ? "Withdrawn to gateway · Ready for final delivery" : isResuming ? "Claimed into private vault · Ready to withdraw" : "Waiting in VeilPay's shielded pool"}
                    </p>
                  </div>

                  {lockedTo && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(0,179,255,0.06)", border: "0.5px solid rgba(0,179,255,0.2)", marginBottom: 16 }}>
                      <UserCheck size={13} style={{ color: "var(--vp-sky-deep)", flexShrink: 0 }} />
                      <p style={{ fontSize: 12, color: "var(--ink-2)", margin: 0, fontFamily: "var(--font-mono)" }}>
                        Locked to {lockedTo.slice(0, 4)}…{lockedTo.slice(-4)}
                      </p>
                    </div>
                  )}

                  {walletMismatch && (
                    <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "rgba(245,158,11,0.08)", border: "0.5px solid rgba(245,158,11,0.25)", marginBottom: 16 }}>
                      <AlertTriangle size={14} style={{ color: "#d97706", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12.5, color: "#d97706", margin: 0, lineHeight: 1.5 }}>
                        This link is locked to <span style={{ fontFamily: "var(--font-mono)" }}>{lockedTo!.slice(0, 4)}…{lockedTo!.slice(-4)}</span>. Connect that wallet to claim.
                      </p>
                    </div>
                  )}
                </>
              )}

              {!error && (
                <>
                  {connected ? (
                    <button
                      className="btn btn-primary"
                      style={{ width: "100%", justifyContent: "center", marginBottom: 12 }}
                      disabled={walletMismatch}
                      onClick={handleClaim}
                    >
                      <Shield size={16} /> {isStuckSweep ? "Deliver Funds" : isResuming ? "Sweep Funds" : "Claim"}
                    </button>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>
                      <ConnectWalletButton
                        label={lockedTo ? `Connect ${lockedTo.slice(0, 4)}…${lockedTo.slice(-4)} to Claim` : "Connect Wallet to Claim"}
                        variant="primary"
                      />
                    </div>
                  )}
                </>
              )}

              {/* Memo from sender — only shown if present, otherwise nothing */}
              {memo && (
                <div style={{ display: "flex", gap: 10, padding: "12px 14px", borderRadius: "var(--radius-sm)", background: "var(--glass-bg-soft)", border: "0.5px solid var(--hairline)", marginTop: 4 }}>
                  <MessageSquare size={13} style={{ color: "var(--ink-3)", flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 13, color: "var(--ink-2)", margin: 0, lineHeight: 1.5, fontStyle: "italic" }}>&ldquo;{memo}&rdquo;</p>
                </div>
              )}
            </div>
          )}

          {/* ── Claiming ── */}
          {step === "claiming" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 100, height: 100, objectFit: "contain" }} />
              </div>
              <p style={{ fontWeight: 600, fontSize: 22, marginBottom: 8, letterSpacing: "-0.02em" }}>Withdrawing from pool</p>
              <p style={{ color: "var(--ink-3)", fontSize: 15, marginBottom: 6 }}>{statusMsg}</p>
              <div className="claim-progress-bar" style={{ margin: "20px 0 12px" }}><span /></div>
              <div className="claim-progress-steps">
                {["generating proof", "verifying on-chain", "sweeping to your wallet"].map((s) => (
                  <span key={s}>· {s}</span>
                ))}
              </div>
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="card glass card-pad-lg success-card reveal in" style={{ textAlign: "center" }}>
              <div className="success-mark" style={{ marginInline: "auto" }}><Check size={26} /></div>
              <h2 className="card-title" style={{ fontSize: 24, marginTop: 14, textAlign: "center" }}>
                <em style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontWeight: 400 }}>{amount} {token}</em> claimed.
              </h2>
              <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 22 }}>
                Funds delivered to your wallet. Nobody can link you to the sender.
              </p>
              <div className="divider" />
              <div style={{ display: "flex", gap: 10, marginTop: 22, justifyContent: "center", flexWrap: "wrap" }}>
                <a href="/dashboard" className="btn btn-primary"><ArrowRight size={14} /> Open dashboard</a>
                {txSig && (
                  <a href={`https://solscan.io/tx/${txSig}${clusterQuery}`} target="_blank" rel="noopener noreferrer" className="btn btn-glass btn-sm">
                    <ExternalLink size={13} /> Solscan
                  </a>
                )}
              </div>
            </div>
          )}

          </>)}

        </div>
      </section>

      <style>{`
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      `}</style>
    </AppShell>
  );
}
