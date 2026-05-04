"use client";

import { useEffect, useState, use } from "react";
import { AppShell } from "@/components/AppShell";
import { ConnectWalletButton } from "@/components/WalletModal";
import { useWalletContext } from "@/components/WalletContext";
import { merchantPay, preloadCreateAssets } from "@/lib/umbra";
import { TOKEN_CONFIG, NETWORK } from "@/lib/constants";
import type { Token } from "@/types";
import { Store, Shield, CheckCircle, AlertTriangle, ExternalLink, Lock } from "lucide-react";

const clusterQuery = NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`;

interface PaymentRequest {
  id: string;
  merchant_addr: string;
  label: string | null;
  amount: string;
  token: Token;
  paid: boolean;
}

type PayStep = "loading" | "preview" | "paying" | "done" | "error" | "already_paid";

const TOKEN_LOGOS: Record<Token, string> = {
  SOL: "/tokens/sol.png", USDC: "/tokens/usdc.png", USDT: "/tokens/usdt.png",
  UMBRA: "/tokens/umbra.png", CASH: "/tokens/cash.png",
};

export default function PayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { connected, wallet, account } = useWalletContext();

  const [step, setStep] = useState<PayStep>("loading");
  const [request, setRequest] = useState<PaymentRequest | null>(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [depositSig, setDepositSig] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Load the payment request
  useEffect(() => {
    preloadCreateAssets();
    fetch(`/api/merchant-pay?id=${encodeURIComponent(id)}`)
      .then(res => res.json())
      .then(({ request: req, error: err }) => {
        if (err || !req) { setError("Payment request not found."); setStep("error"); return; }
        if (req.paid) { setRequest(req); setStep("already_paid"); return; }
        setRequest(req);
        setStep("preview");
      })
      .catch(() => { setError("Failed to load payment request."); setStep("error"); });
  }, [id]);

  const handlePay = async () => {
    if (!wallet || !account || !request) return;
    setError(null);
    setStep("paying");

    try {
      const result = await merchantPay({
        payerWallet: wallet,
        payerAccount: account,
        merchantAddress: request.merchant_addr,
        token: request.token,
        amountHuman: request.amount,
        onStatusChange: setStatusMsg,
      });

      // Mark as paid in DB (fire-and-forget — merchant's polling will pick it up)
      fetch(`/api/merchant-pay?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deposit_sig: result.createUtxoSignature }),
      }).catch(() => {});

      setDepositSig(result.createUtxoSignature);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payment failed");
      setStep("preview");
    }
  };

  const tokenCfg = request ? TOKEN_CONFIG[request.token] : null;
  const displayAmount = request && tokenCfg
    ? `${parseFloat(request.amount).toFixed(tokenCfg.decimals <= 6 ? 2 : 4)} ${request.token}`
    : "—";

  return (
    <AppShell active="">
      <section className="app-head">
        <div className="container" style={{ maxWidth: 540, textAlign: "center" }}>
          <span className="eyebrow" style={{ display: "inline-flex", gap: 8 }}>
            <Shield size={13} /> Private Payment
          </span>
          <h1 className="h2" style={{ textAlign: "center" }}>Pay <em>privately.</em></h1>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ maxWidth: 480 }}>

          {/* ── Loading ── */}
          {step === "loading" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <p style={{ color: "var(--ink-3)", fontSize: 14 }}>Loading payment request…</p>
            </div>
          )}

          {/* ── Error ── */}
          {step === "error" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <AlertTriangle size={32} style={{ color: "#ef4444", margin: "0 auto 12px" }} />
              <p style={{ fontWeight: 600, fontSize: 16, marginBottom: 8, color: "#ef4444" }}>Request not found</p>
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>{error}</p>
            </div>
          )}

          {/* ── Already paid ── */}
          {step === "already_paid" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <CheckCircle size={32} style={{ color: "#34d399", margin: "0 auto 12px" }} />
              <p style={{ fontWeight: 600, fontSize: 18, marginBottom: 8 }}>Already paid</p>
              <p style={{ color: "var(--ink-3)", fontSize: 13 }}>This payment request has already been fulfilled.</p>
            </div>
          )}

          {/* ── Preview ── */}
          {(step === "preview" || step === "paying") && request && (
            <div className="card glass card-pad-lg reveal in">
              {/* Merchant info */}
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24, paddingBottom: 20, borderBottom: "0.5px solid var(--hairline)" }}>
                <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--glass-bg-strong)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  <Store size={20} style={{ color: "var(--vp-sky)" }} />
                </div>
                <div>
                  <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>
                    {request.label || "Merchant"}
                  </p>
                  <p style={{ fontSize: 11, color: "var(--ink-4)", fontFamily: "var(--font-mono)" }}>
                    {request.merchant_addr.slice(0, 8)}…{request.merchant_addr.slice(-6)}
                  </p>
                </div>
              </div>

              {/* Amount */}
              <div style={{ textAlign: "center", marginBottom: 24 }}>
                <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ink-4)", marginBottom: 8 }}>
                  Amount due
                </p>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 6 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={TOKEN_LOGOS[request.token]} alt={request.token}
                    style={{ width: 32, height: 32, borderRadius: "50%" }} />
                  <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.04em" }}>
                    {displayAmount}
                  </span>
                </div>
              </div>

              {/* Privacy badge */}
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                background: "rgba(0,179,255,0.06)", borderRadius: 12,
                border: "0.5px solid rgba(0,179,255,0.2)", marginBottom: 24,
              }}>
                <Lock size={14} style={{ color: "var(--vp-sky)", flexShrink: 0 }} />
                <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.4 }}>
                  Your wallet address is never linked to this payment on-chain. A ZK proof shields the connection.
                </p>
              </div>

              {/* Paying status */}
              {step === "paying" && (
                <div style={{ textAlign: "center", marginBottom: 16 }}>
                  <p style={{ fontSize: 14, color: "var(--vp-sky)", fontWeight: 500, marginBottom: 4 }}>
                    {statusMsg || "Preparing…"}
                  </p>
                  <p style={{ fontSize: 12, color: "var(--ink-4)" }}>
                    ZK proof generation takes 15–30 seconds. Do not close this page.
                  </p>
                </div>
              )}

              {error && step === "preview" && (
                <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 14 }}>{error}</p>
              )}

              {/* CTA */}
              {!connected ? (
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 14 }}>
                    Connect your wallet to pay privately.
                  </p>
                  <ConnectWalletButton label="Connect Wallet to Pay" variant="primary" />
                </div>
              ) : (
                <button
                  className="btn btn-primary"
                  onClick={handlePay}
                  disabled={step === "paying"}
                  style={{ width: "100%", justifyContent: "center", fontSize: 15 }}
                >
                  {step === "paying" ? "Processing…" : `Pay ${displayAmount} Privately`}
                </button>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {step === "done" && (
            <div className="card glass card-pad-lg reveal in" style={{ textAlign: "center" }}>
              <CheckCircle size={44} style={{ color: "#34d399", margin: "0 auto 16px" }} />
              <p style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.03em", marginBottom: 8 }}>
                Payment sent!
              </p>
              <p style={{ color: "var(--ink-3)", fontSize: 14, marginBottom: 24, maxWidth: 320, margin: "0 auto 24px" }}>
                <strong style={{ color: "var(--ink-2)" }}>{displayAmount}</strong> deposited privately.
                Your wallet is not linked to the merchant on-chain.
              </p>

              <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
                {depositSig && (
                  <a
                    href={`https://solscan.io/tx/${depositSig}${clusterQuery}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn btn-glass btn-sm"
                    style={{ fontSize: 12 }}
                  >
                    <ExternalLink size={12} /> View on Solscan
                  </a>
                )}
                <a href="/create" className="btn btn-glass btn-sm" style={{ fontSize: 12 }}>
                  Send a private link
                </a>
              </div>
            </div>
          )}

        </div>
      </section>
    </AppShell>
  );
}
