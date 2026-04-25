"use client";

import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { auditLinkStatus } from "@/lib/umbra";
import type { LinkAuditResult } from "@/lib/umbra";
import { Key, Search, AlertTriangle, ArrowRight, Clock, EyeOff, Eye, Layers } from "lucide-react";

const STATUS_CONFIG = {
  pending: {
    label: "Awaiting claim",
    description: "Funds are in the shielded pool, locked to the ephemeral address. No one has claimed yet.",
    color: "#d97706",
    dot: "rgba(245,158,11,0.8)",
  },
  in_transit: {
    label: "Claimed — withdrawal pending",
    description: "The ZK proof was accepted. Funds moved into the ephemeral encrypted balance and are being swept to the recipient.",
    color: "var(--vp-sky-deep)",
    dot: "var(--vp-sky)",
  },
  complete: {
    label: "Delivered",
    description: "Funds were successfully swept from the ephemeral wallet to the recipient's address.",
    color: "#059669",
    dot: "rgba(16,185,129,0.8)",
  },
  not_found: {
    label: "Not found",
    description: "No payment detected for this key. The link may have expired, already been claimed and swept, or the key is incorrect.",
    color: "#dc2626",
    dot: "rgba(239,68,68,0.8)",
  },
} as const;

export default function AuditPage() {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LinkAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleAudit = async () => {
    const secret = input.trim().replace(/^#/, "");
    if (!secret) return;
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const r = await auditLinkStatus(secret);
      setResult(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    } finally {
      setLoading(false);
    }
  };

  const statusCfg = result ? STATUS_CONFIG[result.status] : null;

  return (
    <AppShell active="audit">
      <section className="app-head">
        <div className="container">
          <span className="eyebrow">Payment status</span>
          <h1 className="h2">Link <em>receipt checker.</em></h1>
          <p className="lead">
            Check whether a payment link has been claimed and delivered.
            This is a receipt — not a compliance viewing key.
          </p>
        </div>
      </section>

      <section className="app-section">
        <div className="container" style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Input card */}
          <div className="card glass card-pad-lg reveal in">
            <div className="audit-key-row">
              <div className="audit-key-icon"><Key size={20} /></div>
              <div style={{ flex: 1 }}>
                <div className="field-label" style={{ marginBottom: 8 }}>Claim secret</div>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: "0 0 12px", lineHeight: 1.5 }}>
                  Paste the claim secret from the payment link — the part after{" "}
                  <code style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, padding: "1px 5px", borderRadius: 4, background: "var(--glass-bg-strong)" }}>#</code>.
                  Both the sender and recipient have this — it is shared by design.
                </p>
                <input
                  type="text"
                  placeholder="e.g. 3mFc…:USDC"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAudit()}
                  className="input mono"
                />
              </div>
            </div>

            {error && (
              <div style={{ display: "flex", gap: 10, padding: "10px 14px", borderRadius: "var(--radius-sm)", background: "rgba(220,38,38,0.08)", border: "0.5px solid rgba(220,38,38,0.2)", margin: "16px 0 0" }}>
                <AlertTriangle size={14} style={{ color: "#dc2626", flexShrink: 0, marginTop: 1 }} />
                <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{error}</p>
              </div>
            )}

            <div style={{ marginTop: 16 }}>
              <button className="btn btn-primary" onClick={handleAudit} disabled={!input.trim() || loading}>
                {loading ? <><Clock size={16} /> Scanning…</> : <><Search size={16} /> Check status</>}
              </button>
            </div>
          </div>

          {/* Result */}
          {result && statusCfg && (
            <>
              <div className="card glass card-pad-lg reveal in">
                <div className="audit-key-row" style={{ marginBottom: result.status !== "not_found" ? 20 : 0 }}>
                  <div style={{ width: 12, height: 12, borderRadius: "50%", background: statusCfg.dot, boxShadow: `0 0 8px ${statusCfg.dot}`, flexShrink: 0, marginTop: 4 }} />
                  <div>
                    <p style={{ fontSize: 16, fontWeight: 500, color: statusCfg.color, margin: "0 0 4px" }}>{statusCfg.label}</p>
                    <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0, lineHeight: 1.55 }}>{statusCfg.description}</p>
                  </div>
                </div>

                {result.status !== "not_found" && (
                  <>
                    <div className="divider" />
                    <div className="audit-key-meta">
                      <div>
                        <div className="field-label">Amount</div>
                        <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{result.amountHuman} {result.token}</div>
                      </div>
                      <div>
                        <div className="field-label">Token</div>
                        <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>{result.token}</div>
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <div className="field-label">Ephemeral address (anonymizing hop)</div>
                        <div style={{ fontSize: 12, fontFamily: "var(--font-mono)", marginTop: 4, color: "var(--ink-2)", wordBreak: "break-all" }}>
                          {result.ephemeralAddress}
                        </div>
                        <p style={{ fontSize: 11.5, color: "var(--ink-4)", margin: "6px 0 0", lineHeight: 1.5 }}>
                          This address is the ZK hop between sender and recipient. It is visible on-chain but is not associated with either party&apos;s identity.
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {result.status === "complete" && (
                <div className="card glass reveal in" style={{ padding: "16px 20px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                  <p style={{ fontSize: 14, color: "var(--ink-2)", margin: 0 }}>Payment delivered. Funds reached the recipient&apos;s wallet.</p>
                  <a href="/create" className="btn btn-glass btn-sm"><ArrowRight size={13} /> New payment</a>
                </div>
              )}
            </>
          )}

          {/* Privacy model — always visible */}
          <div className="card glass card-pad-lg reveal in">
            <h3 className="card-title" style={{ marginBottom: 20 }}>What this audit reveals — and what it doesn&apos;t</h3>

            {/* Visible */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Eye size={14} style={{ color: "var(--vp-sky-deep)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)" }}>What the claim secret reveals</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22 }}>
                {[
                  "Payment status: pending, claimed, or delivered",
                  "Amount and token",
                  "The ephemeral address used as the anonymizing hop",
                ].map((item) => (
                  <div key={item} style={{ display: "flex", alignItems: "start", gap: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--ink-4)", flexShrink: 0, marginTop: 7 }} />
                    <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0 }}>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="divider" />

            {/* Hidden */}
            <div style={{ marginTop: 20, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <EyeOff size={14} style={{ color: "#059669", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)" }}>What it cannot reveal</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingLeft: 22 }}>
                {[
                  "The sender's wallet address",
                  "The recipient's wallet address",
                  "Any on-chain link between sender and recipient",
                ].map((item) => (
                  <div key={item} style={{ display: "flex", alignItems: "start", gap: 8 }}>
                    <div style={{ width: 4, height: 4, borderRadius: "50%", background: "#059669", flexShrink: 0, marginTop: 7 }} />
                    <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0 }}>{item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="divider" />

            {/* ZK explanation */}
            <div style={{ marginTop: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Layers size={14} style={{ color: "var(--vp-violet)", flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ink-3)" }}>What the ZK proof does</span>
              </div>
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: "0 0 10px", lineHeight: 1.6, paddingLeft: 22 }}>
                The Groth16 proof used during the claim step proves{" "}
                <em>&ldquo;I know the secret key for a valid UTXO in this pool&rdquo;</em>{" "}
                without revealing which UTXO. A blockchain observer sees a deposit enter the pool and a separate claim exit it — but cannot cryptographically prove they are the same payment.
              </p>
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", margin: 0, lineHeight: 1.6, paddingLeft: 22 }}>
                The anonymity set is every unclaimed UTXO in the pool at the time of claim. The larger and older the pool, the stronger the guarantee.
              </p>
            </div>
          </div>

        </div>
      </section>
    </AppShell>
  );
}
