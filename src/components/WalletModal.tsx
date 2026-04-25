"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useWalletContext } from "@/components/WalletContext";
import { Wallet, X, ExternalLink, Loader } from "lucide-react";
import type { Wallet as WalletStandard } from "@wallet-standard/core";
import { getCompatibleWallets, getPhantomFallback } from "@/lib/wallet";

// ─── Modal — rendered via portal into document.body ──────────────────────────
// Using a portal is critical: the nav bar has backdrop-filter which creates an
// isolated stacking context. Any position:fixed child is trapped inside it and
// can't cover the full screen. Portaling to document.body escapes this entirely.

interface WalletModalProps {
  onClose: () => void;
}

function WalletModal({ onClose }: WalletModalProps) {
  const { connect, connecting } = useWalletContext();
  const [wallets, setWallets] = useState<WalletStandard[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  // Detect wallets fresh when the modal opens
  useEffect(() => {
    const detected = getCompatibleWallets();
    if (detected.length > 0) {
      setWallets(detected);
    } else {
      const phantom = getPhantomFallback();
      setWallets(phantom ? [phantom] : []);
    }
  }, []);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const handleSelect = async (w: WalletStandard) => {
    setError("");
    setStatus("Waiting for wallet approval…");
    try {
      await connect(w);
      onClose();
    } catch (e) {
      setStatus("");
      setError(e instanceof Error ? e.message : "Connection failed. Try again.");
    }
  };

  const modal = (
    <div
      onClick={onClose}
      style={{
        // Full-screen fixed overlay — rendered at document.body level via portal,
        // so no parent stacking context can clip or trap it.
        position: "fixed",
        inset: 0,
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        // Heavy blur + dark overlay so the background is visually obscured
        background: "rgba(4, 8, 20, 0.75)",
        backdropFilter: "blur(20px) saturate(120%)",
        WebkitBackdropFilter: "blur(20px) saturate(120%)",
      }}
    >
      {/* Modal card — stop propagation so clicking inside doesn't close */}
      <div
        className="glass"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 420,
          borderRadius: "var(--radius-xl)",
          padding: 32,
          position: "relative",
          // Ensure the card itself is fully opaque against the blurred bg
          background: "var(--glass-bg-strong)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 600, margin: "0 0 6px", color: "var(--ink)", letterSpacing: "-0.02em" }}>
              Connect wallet
            </h2>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: 0 }}>
              Choose a wallet to connect to VeilPay
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 34, height: 34, borderRadius: "50%", flexShrink: 0,
              display: "grid", placeItems: "center",
              background: "var(--glass-bg-soft)",
              border: "0.5px solid var(--hairline)",
              color: "var(--ink-3)",
              marginTop: 2,
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Status indicator */}
        {status && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "10px 14px", marginBottom: 14, borderRadius: "var(--radius-sm)",
            background: "rgba(0,179,255,0.08)",
            border: "0.5px solid rgba(0,179,255,0.25)",
          }}>
            <Loader size={14} style={{ color: "var(--vp-sky-deep)", animation: "spin 1s linear infinite", flexShrink: 0 }} />
            <p style={{ fontSize: 13, color: "var(--vp-sky-deep)", margin: 0 }}>{status}</p>
          </div>
        )}

        {/* Error indicator */}
        {error && (
          <div style={{
            padding: "10px 14px", marginBottom: 14, borderRadius: "var(--radius-sm)",
            background: "rgba(220,38,38,0.08)",
            border: "0.5px solid rgba(220,38,38,0.25)",
          }}>
            <p style={{ fontSize: 13, color: "#dc2626", margin: 0 }}>{error}</p>
          </div>
        )}

        {/* Wallet options */}
        {wallets.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {wallets.map((w) => (
              <button
                key={w.name}
                onClick={() => handleSelect(w)}
                disabled={connecting}
                style={{
                  display: "flex", alignItems: "center", gap: 16,
                  padding: "16px 18px",
                  borderRadius: "var(--radius-md)",
                  background: "var(--glass-bg-soft)",
                  border: "0.5px solid var(--hairline-strong)",
                  textAlign: "left",
                  cursor: connecting ? "not-allowed" : "pointer",
                  transition: "background 0.15s, border-color 0.15s",
                  opacity: connecting ? 0.65 : 1,
                  width: "100%",
                }}
                onMouseEnter={(e) => {
                  if (!connecting) {
                    (e.currentTarget).style.background = "var(--glass-bg)";
                    (e.currentTarget).style.borderColor = "rgba(0,179,255,0.35)";
                  }
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget).style.background = "var(--glass-bg-soft)";
                  (e.currentTarget).style.borderColor = "var(--hairline-strong)";
                }}
              >
                {/* Icon */}
                {w.icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={w.icon as string}
                    alt={w.name}
                    style={{ width: 44, height: 44, borderRadius: 14, flexShrink: 0, objectFit: "cover" }}
                  />
                ) : (
                  <div style={{
                    width: 44, height: 44, borderRadius: 14, flexShrink: 0,
                    background: "linear-gradient(135deg, var(--vp-sky-2), var(--vp-sky-deep))",
                    display: "grid", placeItems: "center",
                  }}>
                    <Wallet size={22} style={{ color: "white" }} />
                  </div>
                )}

                {/* Info */}
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, margin: "0 0 2px", color: "var(--ink)", letterSpacing: "-0.01em" }}>{w.name}</p>
                  <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>Click to connect</p>
                </div>

                {/* Detected dot */}
                <div style={{
                  width: 9, height: 9, borderRadius: "50%",
                  background: "#10b981",
                  boxShadow: "0 0 8px rgba(16,185,129,0.8)",
                  flexShrink: 0,
                }} />
              </button>
            ))}
          </div>
        ) : (
          /* No wallet found */
          <div style={{ textAlign: "center", padding: "28px 0" }}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%",
              background: "var(--glass-bg-soft)", border: "0.5px solid var(--hairline)",
              display: "grid", placeItems: "center", margin: "0 auto 18px",
              color: "var(--ink-3)",
            }}>
              <Wallet size={26} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 500, color: "var(--ink)", margin: "0 0 8px" }}>
              No wallet detected
            </p>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", margin: "0 0 22px", lineHeight: 1.6, maxWidth: 280, marginInline: "auto" }}>
              Install Phantom to use VeilPay — it&apos;s the recommended wallet for Solana.
            </p>
            <a
              href="https://phantom.app/download"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-sm"
              style={{ display: "inline-flex" }}
            >
              <ExternalLink size={14} />
              Install Phantom
            </a>
          </div>
        )}

        {/* Footer note */}
        <p style={{
          fontSize: 12, color: "var(--ink-4)", margin: "22px 0 0",
          textAlign: "center", lineHeight: 1.6,
        }}>
          VeilPay never holds your private keys.
          All signing happens in your wallet.
        </p>
      </div>
    </div>
  );

  // Portal to document.body so backdrop-filter stacking contexts can't trap the modal
  return createPortal(modal, document.body);
}

// ─── ConnectWalletButton ──────────────────────────────────────────────────────

interface ConnectWalletButtonProps {
  label?: string;
  variant?: "primary" | "glass" | "ghost";
  size?: "sm" | "md";
}

export function ConnectWalletButton({
  label = "Connect Wallet",
  variant = "glass",
  size = "md",
}: ConnectWalletButtonProps) {
  const { connected, account, disconnect } = useWalletContext();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Portals need the DOM to be available; guard against SSR
  useEffect(() => { setMounted(true); }, []);

  if (connected && account) {
    const addr = account.address as string;
    const short = addr.slice(0, 4) + "…" + addr.slice(-4);
    return (
      <button className="wallet-pill" onClick={disconnect} title="Click to disconnect">
        <span className="wallet-avatar" />
        <div className="wallet-meta">
          <span className="wallet-balance" style={{ fontSize: 12 }}>Connected</span>
          <span className="wallet-addr mono">{short}</span>
        </div>
      </button>
    );
  }

  const cls = [
    "btn",
    variant === "primary" ? "btn-primary" : variant === "ghost" ? "btn-ghost" : "btn-glass",
    size === "sm" ? "btn-sm" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <button className={cls} onClick={() => setOpen(true)}>
        <Wallet size={size === "sm" ? 14 : 16} />
        {label}
      </button>
      {/* Only render portal after client mount and when modal is open */}
      {mounted && open && <WalletModal onClose={() => setOpen(false)} />}
    </>
  );
}
