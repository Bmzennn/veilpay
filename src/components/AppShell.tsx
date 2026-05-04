"use client";

import { useEffect, useState, useCallback } from "react";
import { BackgroundStage } from "@/components/BackgroundStage";
import { ConnectWalletButton } from "@/components/WalletModal";
import { Sun, Moon, Menu, X } from "lucide-react";

// ─── Logo ────────────────────────────────────────────────────────────────────

export function VPLogo({ size = 52 }: { size?: number }) {
  return (
    <a href="/" className="nav-logo">
      <span
        className="logo-mark"
        style={{ width: size, height: size, borderRadius: Math.round(size * 0.26) }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo-nobg.png" alt="VeilPay" />
      </span>
      <span className="nav-logo-text">VeilPay</span>
    </a>
  );
}

// ─── Nav ─────────────────────────────────────────────────────────────────────

function AppNav({ active }: { active: string }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const items = [
    { id: "create",    label: "Send",      href: "/create" },
    { id: "merchant",  label: "Merchant",  href: "/merchant" },
    { id: "dashboard", label: "Dashboard", href: "/dashboard" },
    { id: "docs",      label: "Docs",      href: "/docs" },
  ];

  // Close mobile menu on route change / outside click
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    window.addEventListener("scroll", close, { once: true });
    return () => window.removeEventListener("scroll", close);
  }, [menuOpen]);

  return (
    <nav className="nav">
      <div className="nav-inner glass">
        <VPLogo />

        {/* Desktop links */}
        <div className="nav-links">
          {items.map((it) => (
            <a key={it.id} href={it.href} className={"nav-link" + (active === it.id ? " is-active" : "")}>
              {it.label}
            </a>
          ))}
        </div>

        <div className="nav-actions">
          <ConnectWalletButton size="sm" />
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
          {items.map((it) => (
            <a
              key={it.id}
              href={it.href}
              className={"nav-mobile-link" + (active === it.id ? " is-active" : "")}
              onClick={() => setMenuOpen(false)}
            >
              {it.label}
            </a>
          ))}
        </div>
      )}
    </nav>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function AppFooter() {
  return (
    <footer>
      <div className="container">
        <div className="footer-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <VPLogo size={30} />
            <span className="footer-tag" style={{ marginLeft: 8 }}>
              Private payments, zero traces.
            </span>
          </div>
          <div className="footer-links">
            <a href="/docs">Docs</a>
            <a href="/audit">Audit</a>
            <a href="https://github.com/umbra-protocol" target="_blank" rel="noopener noreferrer">
              Built on Umbra
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Theme floater ───────────────────────────────────────────────────────────

function ThemeFloater() {
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const stored = localStorage.getItem("vp-theme") as "light" | "dark" | null;
    const preferred = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const initial = stored ?? preferred;
    setTheme(initial);
    document.documentElement.dataset.theme = initial;
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem("vp-theme", next);
      document.documentElement.dataset.theme = next;
      return next;
    });
  }, []);

  return (
    <button className="btn btn-glass btn-sm theme-floater" onClick={toggle} aria-label="Toggle theme">
      {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      <span className="theme-floater-label">{theme === "dark" ? "Light" : "Dark"}</span>
    </button>
  );
}

// ─── Reveal on scroll ────────────────────────────────────────────────────────

function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".reveal");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) e.target.classList.add("in"); }),
      { threshold: 0, rootMargin: "0px 0px -8% 0px" }
    );
    els.forEach((el) => io.observe(el));
    const failsafe = setTimeout(() => {
      document.querySelectorAll(".reveal:not(.in)").forEach((el) => el.classList.add("in"));
    }, 1200);
    return () => { io.disconnect(); clearTimeout(failsafe); };
  });
}

// ─── Exported connect button (for use inside forms) ──────────────────────────

export { ConnectWalletButton as ConnectButton };

// ─── AppShell ────────────────────────────────────────────────────────────────

interface AppShellProps {
  active: string;
  children: React.ReactNode;
  animBg?: boolean;
}

export function AppShell({ active, children, animBg = true }: AppShellProps) {
  useReveal();
  return (
    <div style={{ position: "relative", minHeight: "100vh" }}>
      <BackgroundStage animOn={animBg} fixed />
      <div className="page">
        <AppNav active={active} />
        {children}
        <AppFooter />
      </div>
      <ThemeFloater />
    </div>
  );
}
