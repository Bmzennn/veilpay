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
    const to = params.get("to");
    if (to) setLockedTo(to);
    const { claimSecret: secret, token: parsedToken, memo: parsedMemo } = parseClaimHash(raw);
    setClaimSecret(secret);
    setToken(parsedToken);
    if (parsedMemo) setMemo(parsedMemo);
  }, []);

  useEffect(() => {
    if (!claimSecret) return;
    let cancelled = false;
    (async () => {
      try {
        setStep("scanning");
        setStatusMsg("Scanning shielded pool…");
        const result = await scanForUtxo(claimSecret, token, { maxAttempts: 15, retryDelayMs: 4000 });
        if (cancelled) return;
        if (!result.hasUtxo) { setError("No unclaimed payment found for this link."); setStep("preview"); return; }
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
    setError(null);
    setStep("claiming");
    try {
      const result = await claimPaymentLink({
        claimSecret, token, linkId,
        recipientAddress: address,
        onStatusChange: setStatusMsg,
        lockedTo: lockedTo ?? undefined,
        signMessage: lockedTo && wallet && account ? makeSignMessage(wallet, account) : undefined,
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
          <span className="eyebrow" style={{ display: "inline-flex" }}>Claim a private payment</span>
          <h1 className="h2" style={{ textAlign: "center" }}>
            Someone sent you funds <em>privately.</em>
          </h1>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ maxWidth: 540 }}>

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
                    <p style={{ fontSize: 14, color: "var(--ink-2)" }}>Waiting in VeilPay&apos;s shielded pool</p>
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
                      <Shield size={16} /> Claim
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
        </div>
      </section>
    </AppShell>
  );
}
