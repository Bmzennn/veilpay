"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, FileText, Key, AlertTriangle, Clock, CheckCircle, ArrowRight, Search } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { LiquidButton } from "@/components/ui/LiquidButton";
import { auditLinkStatus } from "@/lib/umbra";
import type { LinkAuditResult } from "@/lib/umbra";

const STATUS_CONFIG = {
  pending: {
    icon: Clock,
    label: "Awaiting claim",
    description: "Funds are in Umbra's shielded pool, waiting to be claimed.",
    color: "#f59e0b",
    bgClass: "bg-amber-500/10 border-amber-500/20",
    textClass: "text-amber-600",
  },
  in_transit: {
    icon: ArrowRight,
    label: "Claimed — withdrawing",
    description: "Funds have been claimed into the ephemeral encrypted balance. Withdrawal in progress.",
    color: "#00b3ff",
    bgClass: "bg-[#00b3ff10] border-[#00b3ff20]",
    textClass: "text-[#00b3ff]",
  },
  complete: {
    icon: CheckCircle,
    label: "Fully withdrawn",
    description: "Funds were successfully withdrawn to the recipient's wallet.",
    color: "#10b981",
    bgClass: "bg-emerald-500/10 border-emerald-500/20",
    textClass: "text-emerald-600",
  },
  not_found: {
    icon: AlertTriangle,
    label: "Not found",
    description: "No payment activity detected for this claim secret. The link may have expired or the key is incorrect.",
    color: "#ef4444",
    bgClass: "bg-red-500/10 border-red-500/20",
    textClass: "text-red-600",
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
  const StatusIcon = statusCfg?.icon ?? Search;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16">
      <motion.div
        className="text-center mb-10"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center justify-center gap-2 mb-4">
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center bg-[#00b3ff15] border border-[#00b3ff25]">
            <Shield className="w-4 h-4 text-[#00b3ff]" />
          </div>
          <span className="text-xl font-semibold tracking-[-0.03em]">VeilPay</span>
        </div>
        <p className="text-black/40 text-sm">Link status · Selective disclosure</p>
      </motion.div>

      <GlassCard className="w-full max-w-md" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-2 mb-6">
          <FileText className="w-4 h-4 text-[#00b3ff]" />
          <span className="text-xs text-black/40 uppercase tracking-widest font-medium">
            Audit Payment Link
          </span>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-[11px] text-black/40 uppercase tracking-widest mb-2 font-medium">
              Claim Secret
            </label>
            <p className="text-[11px] text-black/30 mb-2 leading-relaxed">
              Paste the claim secret from your payment link URL (the part after <span className="font-mono">#</span>).
            </p>
            <div className="relative">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-black/20" />
              <input
                type="text"
                placeholder="e.g. 3mFc…:USDC"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAudit()}
                className="w-full bg-black/[0.04] border border-black/[0.08] rounded-xl
                           pl-9 pr-4 py-3 text-sm text-gray-900 placeholder:text-black/20
                           outline-none focus:border-black/20 transition-colors font-mono"
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <LiquidButton
            fullWidth
            loading={loading}
            disabled={!input.trim()}
            onClick={handleAudit}
          >
            <Search className="w-4 h-4" />
            Check Link Status
          </LiquidButton>
        </div>

        {/* Result */}
        <AnimatePresence>
          {result && statusCfg && (
            <motion.div
              className="mt-6 space-y-3"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {/* Status badge */}
              <div className={`flex items-start gap-3 p-4 rounded-2xl border ${statusCfg.bgClass}`}>
                <StatusIcon className={`w-5 h-5 shrink-0 mt-0.5 ${statusCfg.textClass}`} />
                <div>
                  <p className={`text-sm font-medium ${statusCfg.textClass}`}>
                    {statusCfg.label}
                  </p>
                  <p className="text-xs text-black/40 mt-0.5 leading-relaxed">
                    {statusCfg.description}
                  </p>
                </div>
              </div>

              {/* Details */}
              {result.status !== "not_found" && (
                <div className="bg-black/[0.03] border border-black/[0.07] rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-black/40">Amount</span>
                    <span className="font-medium text-gray-900">
                      {result.amountHuman} {result.token}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-black/40">Token</span>
                    <span className="font-medium text-gray-900">{result.token}</span>
                  </div>
                  <div className="pt-1.5 border-t border-black/[0.06]">
                    <p className="text-[10px] text-black/25 font-mono break-all leading-relaxed">
                      {result.ephemeralAddress}
                    </p>
                  </div>
                </div>
              )}

              {/* Privacy note */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-[#00b3ff08] border border-[#00b3ff15]">
                <Shield className="w-3.5 h-3.5 text-[#00b3ff] shrink-0" />
                <p className="text-[11px] text-[#00b3ffcc] leading-relaxed">
                  No link to sender&apos;s identity is revealed by this audit.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </div>
  );
}
