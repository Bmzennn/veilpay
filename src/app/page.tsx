"use client";

import { useEffect, useState, useCallback } from "react";
import { BackgroundStage } from "@/components/BackgroundStage";
import { VPLogo } from "@/components/AppShell";
import { Sun, Moon, Shield, Link2, EyeOff, Zap, Key, ArrowRight, Menu, X } from "lucide-react";

// ─── Custom VeilPay SVG icons ─────────────────────────────────────────────────

function VPShieldEyeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2.5L16.5 5.5V10c0 3.8-2.8 6.6-6.5 7.5C3.3 16.6.5 13.8.5 10V5.5L10 2.5z" />
      <path d="M7 10c0 0 1.3-2.2 3-2.2S13 10 13 10s-1.3 2.2-3 2.2S7 10 7 10z" />
      <circle cx="10" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function VPMerchantQRIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="6" height="6" rx="1.2" />
      <rect x="3.5" y="3.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="12" y="2" width="6" height="6" rx="1.2" />
      <rect x="13.5" y="3.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="2" y="12" width="6" height="6" rx="1.2" />
      <rect x="3.5" y="13.5" width="3" height="3" rx="0.5" fill="currentColor" stroke="none" />
      <rect x="12.5" y="14" width="5" height="4" rx="0.8" />
      <path d="M13.5 14v-1.6a1.5 1.5 0 0 1 3 0V14" strokeWidth="1.2" />
      <circle cx="15" cy="16" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── Theme floater ───────────────────────────────────────────────────────────

function ThemeFloater() {
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const stored = localStorage.getItem("vp-theme") as "light" | "dark" | null;
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const init = stored ?? preferred;
    setTheme(init);
    document.documentElement.dataset.theme = init;
  }, []);
  const toggle = useCallback(() => {
    setTheme((p) => {
      const n = p === "light" ? "dark" : "light";
      localStorage.setItem("vp-theme", n);
      document.documentElement.dataset.theme = n;
      return n;
    });
  }, []);
  return (
    <button className="btn btn-glass btn-sm theme-floater" onClick={toggle} aria-label="Toggle theme">
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      <span style={{ fontSize: 12 }}>{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("scroll", close, { once: true });
    return () => window.removeEventListener("scroll", close);
  }, [menuOpen]);

  const links = [
    { label: "Features", href: "#features" },
    { label: "Audit",    href: "/audit" },
    { label: "Docs",     href: "/docs" },
  ];

  return (
    <nav className="nav">
      <div className="nav-inner glass">
        <VPLogo />

        {/* Desktop links */}
        <div className="nav-links">
          {links.map((l) => (
            <a key={l.label} className="nav-link" href={l.href}>{l.label}</a>
          ))}
        </div>

        <div className="nav-actions">
          <a className="btn btn-ghost btn-sm nav-docs-btn" href="/docs">Open docs</a>
          <a className="btn btn-primary btn-sm" href="/create">
            Get started <ArrowRight size={14} />
          </a>
          {/* Hamburger — mobile only */}
          <button
            className="nav-burger btn btn-glass btn-sm"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="nav-mobile glass">
          {links.map((l) => (
            <a
              key={l.label}
              className="nav-mobile-link"
              href={l.href}
              onClick={() => setMenuOpen(false)}
            >
              {l.label}
            </a>
          ))}
          <div style={{ padding: "8px 8px 4px", borderTop: "0.5px solid var(--hairline)", marginTop: 4 }}>
            <a className="btn btn-primary btn-sm" href="/create" style={{ width: "100%", justifyContent: "center" }}>
              Get started <ArrowRight size={14} />
            </a>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Shielded Pool Hero Animation ────────────────────────────────────────────

function ShieldedPoolHero() {
  return (
    <div className="pool-frame">
      <svg className="pool-svg" viewBox="0 0 560 560" preserveAspectRatio="xMidYMid meet">
        <defs>
          <radialGradient id="poolGlow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--vp-sky-2)" stopOpacity="0.35" />
            <stop offset="1" stopColor="var(--vp-sky-2)" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="poolGlow2" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="var(--vp-violet)" stopOpacity="0.2" />
            <stop offset="1" stopColor="var(--vp-violet)" stopOpacity="0" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        {/* Pool aura */}
        <ellipse cx="280" cy="280" rx="200" ry="200" fill="url(#poolGlow)" />
        <ellipse cx="280" cy="280" rx="240" ry="240" fill="url(#poolGlow2)" />

        {/* Commitment lattice — shielded pool */}
        {Array.from({ length: 11 * 11 }).map((_, i) => {
          const col = i % 11, row = Math.floor(i / 11);
          const x = 136 + col * 28, y = 136 + row * 28;
          const distFromCenter = Math.sqrt((col - 5) ** 2 + (row - 5) ** 2);
          if (distFromCenter > 5.8) return null;
          const delay = ((i * 0.11) % 4).toFixed(2);
          return (
            <g key={i}>
              <rect x={x} y={y} width="16" height="10" rx="2.5"
                fill="rgba(0,179,255,0.04)" stroke="rgba(125,200,255,0.3)" strokeWidth="0.5" />
              <rect x={x} y={y} width="16" height="10" rx="2.5" fill="rgba(77,208,255,0.6)" opacity="0">
                <animate attributeName="opacity" values="0;0.75;0" dur="4.5s"
                  begin={`${delay}s`} repeatCount="indefinite" />
              </rect>
            </g>
          );
        })}

        {/* Anonymity set pulse ring */}
        <circle cx="280" cy="280" r="170" fill="none" stroke="rgba(0,179,255,0.12)" strokeWidth="1">
          <animate attributeName="r" values="160;175;160" dur="6s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.5;0.8;0.5" dur="6s" repeatCount="indefinite" />
        </circle>
        <circle cx="280" cy="280" r="195" fill="none" stroke="rgba(107,124,255,0.08)" strokeWidth="0.5">
          <animate attributeName="r" values="185;200;185" dur="8s" repeatCount="indefinite" />
        </circle>

        {/* Deposit packet — sender → pool */}
        <circle r="4" fill="var(--vp-sky-2)" filter="url(#glow)">
          <animateMotion dur="3s" repeatCount="indefinite"
            path="M 80 200 C 140 160, 200 200, 260 270" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle r="3" fill="rgba(77,208,255,0.5)">
          <animateMotion dur="3s" begin="1.5s" repeatCount="indefinite"
            path="M 80 200 C 140 160, 200 200, 260 270" />
          <animate attributeName="opacity" values="0;0.7;0.7;0" keyTimes="0;0.1;0.85;1" dur="3s" begin="1.5s" repeatCount="indefinite" />
        </circle>

        {/* Withdraw packet — pool → recipient (different path) */}
        <circle r="4" fill="var(--vp-sky)" filter="url(#glow)">
          <animateMotion dur="3s" begin="1.8s" repeatCount="indefinite"
            path="M 300 290 C 360 310, 420 340, 480 370" />
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.1;0.85;1" dur="3s" begin="1.8s" repeatCount="indefinite" />
        </circle>
      </svg>

      {/* Sender node */}
      <div className="pool-node sender">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M20 12V22H4V12"/><path d="M22 7H2v5h20V7z"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/>
        </svg>
        <span className="pool-node-label">Sender</span>
        <span className="pool-node-meta">Public</span>
      </div>

      {/* Recipient node */}
      <div className="pool-node recipient">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
        <span className="pool-node-label">Recipient</span>
        <span className="pool-node-meta">Fresh addr</span>
      </div>

      {/* Receipt badge */}
      <div className="pool-receipt glass" style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)" }}>
        <Shield size={12} style={{ color: "var(--vp-sky-deep)" }} />
        <span>Commitment</span>
        <span style={{ color: "var(--ink-3)" }}>0x4f9c…b21e</span>
      </div>

      {/* ZK badge */}
      <div className="pool-zk glass" style={{ fontSize: "10.5px", fontFamily: "var(--font-mono)" }}>
        <Shield size={12} style={{ color: "var(--vp-sky-deep)" }} />
        <span>Groth16 verified</span>
      </div>

      {/* Caption */}
      <div style={{ position: "absolute", bottom: 64, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 16, zIndex: 4, color: "var(--ink-3)", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: "10px" }}>
        <span><span className="badge-dot" style={{ display: "inline-block", width: 5, height: 5, borderRadius: "50%", background: "var(--vp-sky)", marginRight: 6, boxShadow: "0 0 6px var(--vp-sky)", animation: "blink 1.4s ease-in-out infinite" }} />Shielded pool · {" "}</span>
        <span>1,284 commitments</span>
      </div>
    </div>
  );
}

// ─── Features ────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: <Link2 size={20} />,
    title: "Private payment links",
    body: "Generate a shareable URL anyone can claim — no wallet address required.",
  },
  {
    icon: <EyeOff size={20} />,
    title: "Confidential transfers",
    body: "Send to a recipient with the amount hidden on-chain via Arcium MPC.",
  },
  {
    icon: <Zap size={20} />,
    title: "x402 payments",
    body: "Pay for API access privately — the server never learns who paid.",
  },
  {
    icon: <Key size={20} />,
    title: "Viewing keys",
    body: "Authorised auditors selectively inspect activity. Privacy stays intact.",
  },
];

// ─── Landing ─────────────────────────────────────────────────────────────────

export default function LandingPage() {
  // Scroll reveal
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }),
      { threshold: 0.1 }
    );
    els.forEach((el) => io.observe(el));
    const t = setTimeout(() => {
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => el.classList.add("in"));
    }, 1000);
    return () => { io.disconnect(); clearTimeout(t); };
  }, []);

  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <BackgroundStage fixed />
      <div className="page">
        <Nav />

        {/* ── Hero ── */}
        <section className="hero">
          <div className="container">
            <div style={{ textAlign: "center", marginBottom: 48 }}>
              <span className="badge" style={{ marginBottom: 20, display: "inline-flex" }}>
                <span className="badge-dot" /> Built on Umbra Protocol · Solana Mainnet
              </span>
              <h1 className="h1">
                Private payments,<br /><em>zero traces.</em>
              </h1>
              <p className="lead" style={{ marginTop: 20, maxWidth: 520, margin: "20px auto 0" }}>
                Funds enter a shielded pool as encrypted commitments and leave from a fresh, unlinkable address.
              </p>
            </div>

            {/* ── Two persona cards ── */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, maxWidth: 760, margin: "0 auto 32px" }}>
              {/* Send card */}
              <a href="/create" style={{ textDecoration: "none" }}>
                <div className="glass reveal in" style={{
                  padding: "32px 28px", borderRadius: 24,
                  border: "0.5px solid rgba(0,179,255,.25)",
                  background: "linear-gradient(135deg, rgba(0,179,255,.07) 0%, var(--glass-bg) 70%)",
                  cursor: "pointer", transition: "border-color .2s, transform .2s",
                  height: "100%",
                }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(0,179,255,.12)", border: "0.5px solid rgba(0,179,255,.3)", display: "grid", placeItems: "center", marginBottom: 20 }}>
                    <VPShieldEyeIcon size={22} />
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 10, color: "var(--ink)" }}>Send privately</h2>
                  <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.55, marginBottom: 24 }}>
                    Payment links, gift cards, direct confidential transfers — sender and recipient never linked on-chain.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--vp-sky)" }}>
                    Get started <ArrowRight size={14} />
                  </div>
                </div>
              </a>

              {/* Accept card */}
              <a href="/merchant" style={{ textDecoration: "none" }}>
                <div className="glass reveal in" style={{
                  padding: "32px 28px", borderRadius: 24,
                  border: "0.5px solid rgba(107,124,255,.25)",
                  background: "linear-gradient(135deg, rgba(107,124,255,.07) 0%, var(--glass-bg) 70%)",
                  cursor: "pointer", transition: "border-color .2s, transform .2s",
                  height: "100%",
                }}>
                  <div style={{ width: 44, height: 44, borderRadius: 14, background: "rgba(107,124,255,.12)", border: "0.5px solid rgba(107,124,255,.3)", display: "grid", placeItems: "center", marginBottom: 20, color: "var(--vp-violet)" }}>
                    <VPMerchantQRIcon size={22} />
                  </div>
                  <h2 style={{ fontSize: 20, fontWeight: 700, letterSpacing: "-0.03em", marginBottom: 10, color: "var(--ink)" }}>Accept payments</h2>
                  <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.55, marginBottom: 24 }}>
                    Private Solana Pay — generate QR codes for checkout. Customers pay without revealing their wallet.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--vp-violet)" }}>
                    Set up merchant <ArrowRight size={14} />
                  </div>
                </div>
              </a>
            </div>

          </div>
        </section>

        {/* ── Features ── */}
        <section id="features" style={{ paddingTop: 40 }}>
          <div className="container">
            <div className="section-head reveal">
              <div>
                <span className="eyebrow">Primitives</span>
                <h2 className="h2">Four ways to <em>move privately.</em></h2>
              </div>
              <p className="lead">
                One shielded pool, four products — drop them into real flows without exposing
                sender, recipient, or amount.
              </p>
            </div>
            <div className="features">
              {FEATURES.map((f, i) => (
                <div key={i} className="feature glass reveal">
                  <div className="feature-icon">{f.icon}</div>
                  <h3 className="h3">{f.title}</h3>
                  <p>{f.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── CTA ── */}
        <section style={{ paddingBottom: 64, paddingTop: 48 }}>
          <div className="container">
            <div className="cta-card glass reveal">
              <div>
                <h2 className="h2" style={{ marginBottom: 8 }}>Send your first <em>private</em> payment.</h2>
                <p className="lead" style={{ marginTop: 0 }}>
                  Open the app and generate a link in under a minute.
                </p>
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                <a className="btn btn-primary" href="/create">Open the app <ArrowRight size={16} /></a>
                <a className="btn btn-glass" href="/docs">Read the docs</a>
              </div>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer>
          <div className="container">
            <div className="footer-inner">
              <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <VPLogo size={32} />
                <span className="footer-tag" style={{ marginLeft: 8 }}>Private payments, zero traces.</span>
              </div>
              <div className="footer-links">
                <a href="/create">App</a>
                <a href="/docs">Docs</a>
                <a href="/audit">Audit</a>
                <span style={{ opacity: 0.5 }}>Built on Umbra Protocol</span>
              </div>
              <div style={{ display: "flex", gap: 10, color: "var(--ink-3)" }}>
                <a href="#" aria-label="GitHub" style={{ opacity: 0.5, fontSize: 13, color: "var(--ink-3)" }}>GH</a>
              </div>
            </div>
          </div>
        </footer>
      </div>
      <ThemeFloater />
    </div>
  );
}
