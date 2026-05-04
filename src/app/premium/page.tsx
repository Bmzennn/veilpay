"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { useWalletContext } from "@/components/WalletContext";
import { getPublicBalanceToReceiverClaimableUtxoCreatorFunction } from "@umbra-privacy/sdk";
import { getCreateReceiverClaimableUtxoFromPublicBalanceProver } from "@umbra-privacy/web-zk-prover";
import { createBrowserSigner, makeZkProverDeps, makeClient } from "@/lib/umbra";
import { TOKEN_CONFIG } from "@/lib/constants";
import { getSolBalance } from "@/lib/solana";
import type { Address } from "@solana/kit";
import { Check, Zap, Shield, Lock, Unlock, Activity, AlertTriangle, ArrowRight } from "lucide-react";

interface PremiumResponse {
  success: boolean;
  data: { message: string; secretData: string; paymentReceipt: { depositTx: string; amountPaid: number; token: string } };
  error?: string;
}

const PLANS = [
  {
    name: "Free",
    price: "0",
    unit: "",
    tag: "For personal payments and trying VeilPay.",
    cta: "Continue free",
    primary: false,
    feats: [
      "Up to 10 private payments / month",
      "Standard anonymity set (1k+ commitments)",
      "Private payment links",
      "Single device",
    ],
  },
  {
    name: "Pro",
    price: "12",
    unit: "/mo",
    tag: "For freelancers, indie devs, and creators.",
    cta: "Start Pro",
    primary: true,
    flag: "Most popular",
    feats: [
      "Unlimited private sends",
      "Priority anonymity sets (10k+)",
      "x402 API payments included",
      "Custom payment-link branding",
      "3 viewing keys",
      "Email support",
    ],
  },
  {
    name: "Team",
    price: "49",
    unit: "/seat / mo",
    tag: "For payrolls, treasuries, and DAOs.",
    cta: "Talk to sales",
    primary: false,
    feats: [
      "Everything in Pro",
      "Unlimited viewing keys + audit roles",
      "Multi-sig shielded vaults",
      "Per-seat spend policies",
      "SLA + dedicated support",
      "On-prem prover (optional)",
    ],
  },
];

// ─── x402 live demo ───────────────────────────────────────────────────────────

function X402Demo() {
  const { connected, wallet, account } = useWalletContext();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [premiumData, setPremiumData] = useState<PremiumResponse["data"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const unlock = async () => {
    if (!connected || !wallet || !account) { setError("Please connect your wallet first."); return; }
    setLoading(true);
    setError(null);
    setStatus("Checking balance…");
    try {
      const balance = await getSolBalance(account.address);
      const minRequired = 0.12; 
      if (balance < minRequired) {
        throw new Error(`Insufficient SOL. You have ${balance.toFixed(3)} SOL but need at least ${minRequired.toFixed(3)} SOL.`);
      }

      setStatus("Initializing payment pipeline…");
      const initialRes = await fetch("/api/premium-data");
      if (initialRes.status !== 402) {
        const data = await initialRes.json();
        if (data.success) { setPremiumData(data.data); setStatus("Already unlocked!"); setLoading(false); return; }
        throw new Error("Unexpected response from API");
      }
      const { invoice } = await initialRes.json();
      const signer = createBrowserSigner(wallet, account);
      const client = await makeClient(signer as any, { skipPreflight: true });
      setStatus("Generating ZK Proof for payment (15-30s)…");
      const prover = getCreateReceiverClaimableUtxoFromPublicBalanceProver(makeZkProverDeps());
      const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction({ client }, { zkProver: prover });
      const decimals = TOKEN_CONFIG.SOL.decimals;
      const amountRaw = BigInt(Math.round(invoice.amount * 10 ** decimals));
      const invoiceIdMatch = (invoice.invoiceId as string).match(/.{1,2}/g);
      if (!invoiceIdMatch) throw new Error("Invalid invoice ID format");
      const invoiceIdBytes = new Uint8Array(invoiceIdMatch.map((byte: string) => parseInt(byte, 16)));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await createUtxo({ destinationAddress: invoice.destination as Address, mint: TOKEN_CONFIG.SOL.mint as Address, amount: amountRaw as any }, { optionalData: invoiceIdBytes as any });
      setStatus("Payment confirmed. Waiting 10s for on-chain propagation…");
      await new Promise((r) => setTimeout(r, 10000));
      setStatus("Verifying payment with API…");
      const authPayload = `x402 ${result.createProofAccountSignature}:${result.createUtxoSignature}:${invoice.invoiceId}`;
      const finalRes = await fetch("/api/premium-data", { headers: { "X-402-Payment": authPayload } });
      const finalData = await finalRes.json();
      if (finalData.success) { setPremiumData(finalData.data); setStatus("Payment verified. Access granted!"); }
      else throw new Error(finalData.error || "Verification failed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to unlock");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card glass card-pad-lg reveal in" style={{ position: "relative", overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h3 className="card-title">Live x402 demo</h3>
          <p className="card-sub" style={{ marginBottom: 0 }}>Pay 0.1 SOL privately and unlock this content. The API never learns who paid.</p>
        </div>
        <span className="badge" style={{ fontSize: 11 }}><span className="badge-dot" /> x402 V1 · Shielded</span>
      </div>

      {!premiumData ? (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", flexDirection: "column", gap: 16 }}>
            <div style={{ width: 60, height: 60, borderRadius: "50%", background: "var(--glass-bg-strong)", border: "0.5px solid var(--glass-border)", display: "grid", placeItems: "center", color: "var(--vp-sky-deep)" }}>
              <Lock size={26} />
            </div>
            <p style={{ fontSize: 15, fontWeight: 500, margin: 0 }}>Premium data locked</p>
            <p style={{ fontSize: 13, color: "var(--ink-3)", margin: 0, textAlign: "center", maxWidth: 320 }}>
              Access exclusive on-chain intelligence via a single 0.1 SOL private payment.
            </p>
          </div>
          <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center" }}
            onClick={unlock} disabled={!connected || loading}>
            <Zap size={16} /> {loading ? "Processing…" : "Unlock for 0.1 SOL"}
          </button>
          {!connected && <p style={{ textAlign: "center", fontSize: 12, color: "var(--ink-3)", marginTop: 10 }}>Connect wallet to pay</p>}
          {error && (
            <div style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(220,38,38,0.08)", border: "0.5px solid rgba(220,38,38,0.2)", marginTop: 12 }}>
              <AlertTriangle size={14} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 12.5, color: "#dc2626", margin: 0 }}>{error}</p>
            </div>
          )}
          {status && (
            <div style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(0,179,255,0.06)", border: "0.5px solid rgba(0,179,255,0.2)", marginTop: 12 }}>
              <Activity size={14} style={{ color: "var(--vp-sky-deep)", flexShrink: 0, marginTop: 1, animation: "blink 1.4s ease-in-out infinite" }} />
              <p style={{ fontSize: 12.5, color: "var(--vp-sky-deep)", margin: 0 }}>{status}</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(16,185,129,0.12)", border: "0.5px solid rgba(16,185,129,0.25)", display: "grid", placeItems: "center", color: "#059669" }}>
              <Unlock size={18} />
            </div>
            <div>
              <p style={{ fontSize: 15, fontWeight: 500, margin: 0, color: "#059669" }}>Access granted</p>
              <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0 }}>Payment verified on-chain</p>
            </div>
          </div>
          <div style={{ padding: "18px 20px", background: "var(--glass-bg-soft)", border: "0.5px solid var(--hairline)", borderRadius: "var(--radius-md)", marginBottom: 16 }}>
            <p style={{ fontSize: 15, fontWeight: 500, fontStyle: "italic", color: "var(--ink-2)", margin: "0 0 12px", lineHeight: 1.6 }}>
              &quot;{premiumData.secretData}&quot;
            </p>
            <div className="receipt-row" style={{ paddingTop: 12, borderTop: "1px solid var(--hairline)" }}>
              <span className="label">Deposit tx</span>
              <span className="value" style={{ fontSize: 11 }}>{premiumData.paymentReceipt.depositTx.slice(0, 20)}…</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(0,179,255,0.06)", border: "0.5px solid rgba(0,179,255,0.2)" }}>
            <Shield size={13} style={{ color: "var(--vp-sky-deep)", flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 12, color: "var(--ink-3)", margin: 0, lineHeight: 1.5 }}>
              This data was unlocked using the x402 Protocol. Your payment remains private in VeilPay&apos;s shielded pool.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PremiumPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <AppShell active="premium">
      <section className="app-head" style={{ paddingBottom: 8 }}>
        <div className="container" style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
          <span className="eyebrow" style={{ display: "inline-flex" }}>Pricing</span>
          <h1 className="h2" style={{ textAlign: "center" }}>
            Privacy stays free. <em>Pay for the polish.</em>
          </h1>
          <p className="lead" style={{ margin: "0 auto", textAlign: "center" }}>
            The shielded pool is the same pool for everyone. Paid plans add scale, branding, and audit tooling.
          </p>
          <div style={{ display: "inline-flex", marginTop: 24 }}>
            <div className="seg">
              <button className={!annual ? "is-active" : ""} onClick={() => setAnnual(false)}>Monthly</button>
              <button className={annual ? "is-active" : ""} onClick={() => setAnnual(true)}>
                Annual <span style={{ opacity: 0.85, fontSize: 11, marginLeft: 6 }}>−20%</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="app-section">
        <div className="container">
          {/* Pricing cards */}
          <div className="pricing">
            {PLANS.map((p) => (
              <div key={p.name} className={"card glass plan reveal in" + (p.primary ? " featured" : "")}>
                {p.flag && <span className="plan-flag">{p.flag}</span>}
                <div>
                  <div className="plan-name">{p.name}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 8 }}>
                    <span className="plan-price">
                      ${p.price === "0" ? "0" : (annual ? Math.round(parseInt(p.price, 10) * 0.8) : p.price)}
                    </span>
                    <small className="plan-price" style={{ fontSize: 14, fontWeight: 400, color: "var(--ink-3)" }}>{p.unit}</small>
                  </div>
                  <div className="plan-tag">{p.tag}</div>
                </div>
                <ul className="plan-feats">
                  {p.feats.map((f, i) => (
                    <li key={i}><Check size={14} /> <span>{f}</span></li>
                  ))}
                </ul>
                <button className={p.primary ? "btn btn-primary" : "btn btn-glass"} style={{ justifyContent: "center" }}>
                  {p.cta} <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>

          {/* Compare table */}
          <div className="card glass reveal in" style={{ marginTop: 32, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "20px 28px" }}>
              <h3 className="card-title" style={{ fontSize: 17, margin: 0 }}>Feature breakdown</h3>
              <p className="card-sub" style={{ margin: "4px 0 0" }}>The fine print, side by side.</p>
            </div>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{ width: "40%" }}>Feature</th>
                  <th style={{ textAlign: "center" }}>Free</th>
                  <th style={{ textAlign: "center" }}>Pro</th>
                  <th style={{ textAlign: "center" }}>Team</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["Private payments / month", "10", "Unlimited", "Unlimited"],
                  ["Anonymity-set tier", "Standard", "Priority", "Priority + dedicated"],
                  ["Viewing keys", "1", "3", "Unlimited"],
                  ["x402 API payments", "—", "✓", "✓"],
                  ["Custom-branded links", "—", "✓", "✓"],
                  ["Multi-sig vaults", "—", "—", "✓"],
                  ["Support", "Community", "Email", "Dedicated"],
                ].map((row, i) => (
                  <tr key={i}>
                    <td>{row[0]}</td>
                    {row.slice(1).map((c, j) => (
                      <td key={j} style={{ textAlign: "center", color: c === "—" ? "var(--ink-4)" : c === "✓" ? "var(--vp-sky-deep)" : "var(--ink)" }}>{c}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* x402 live demo */}
          <div style={{ marginTop: 32 }}>
            <div style={{ marginBottom: 20 }}>
              <span className="eyebrow">Live demo</span>
              <h2 className="h2" style={{ fontSize: 28, marginBottom: 4 }}>x402 Protocol in action.</h2>
              <p className="lead" style={{ fontSize: 15 }}>
                Pay for API access with zero on-chain link between you and the content.
              </p>
            </div>
            <X402Demo />
          </div>
        </div>
      </section>
    </AppShell>
  );
}
