"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { BackgroundStage } from "@/components/BackgroundStage";
import {
  Copy, Check, ChevronRight, Sun, Moon,
  ExternalLink, Search, ArrowRight, AlertTriangle,
} from "lucide-react";

// ─── Primitives ───────────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  const go = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setOk(true); setTimeout(() => setOk(false), 2000);
  }, [text]);
  return (
    <button onClick={go} className="dc-copy" title="Copy">
      {ok ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}

function Code({ code, lang = "bash" }: { code: string; lang?: string }) {
  return (
    <div className="dc-code">
      <div className="dc-code-bar">
        <div className="dc-dots"><span /><span /><span /></div>
        <span className="dc-lang">{lang}</span>
        <CopyBtn text={code} />
      </div>
      <pre className="dc-pre"><code>{code}</code></pre>
    </div>
  );
}

function IC({ c }: { c: string }) {
  return <code className="dc-ic">{c}</code>;
}

function Note({ children }: { children: React.ReactNode }) {
  return <div className="dc-callout dc-info"><span>ℹ</span><p>{children}</p></div>;
}
function Warn({ children }: { children: React.ReactNode }) {
  return <div className="dc-callout dc-warn"><AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} /><p>{children}</p></div>;
}

function SH({ id, tag, children }: { id: string; tag?: string; children: React.ReactNode }) {
  return (
    <div id={id} className="dc-section-head">
      {tag && <span className="dc-tag">{tag}</span>}
      <h2 className="dc-sh">{children}</h2>
    </div>
  );
}
function H3({ id, children }: { id?: string; children: React.ReactNode }) {
  return <h3 id={id} className="dc-h3">{children}</h3>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="dc-p">{children}</p>;
}
function UL({ items }: { items: React.ReactNode[] }) {
  return <ul className="dc-ul">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>;
}
function Steps({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <ol className="dc-steps">
      {items.map(([title, body], i) => (
        <li key={i}>
          <span className="dc-step-num">{i + 1}</span>
          <span className="dc-step-body"><strong>{title}</strong>{body ? <> — {body}</> : null}</span>
        </li>
      ))}
    </ol>
  );
}
function Table({ head, rows }: { head: string[]; rows: (string | React.ReactNode)[][] }) {
  return (
    <div className="dc-table-wrap">
      <table className="dc-table">
        <thead>
          <tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Badge({ label, color = "sky" }: { label: string; color?: "sky" | "green" | "amber" | "red" }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    sky:   { bg: "rgba(0,179,255,0.1)",   text: "var(--vp-sky-deep)", border: "rgba(0,179,255,0.25)" },
    green: { bg: "rgba(5,150,105,0.1)",   text: "#059669",            border: "rgba(5,150,105,0.25)" },
    amber: { bg: "rgba(245,158,11,0.1)",  text: "#d97706",            border: "rgba(245,158,11,0.25)" },
    red:   { bg: "rgba(220,38,38,0.08)",  text: "#dc2626",            border: "rgba(220,38,38,0.2)" },
  };
  const c = colors[color];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", padding: "2px 8px", borderRadius: 999, background: c.bg, color: c.text, border: `0.5px solid ${c.border}` }}>
      {label}
    </span>
  );
}

// ─── Nav structure ────────────────────────────────────────────────────────────

const NAV = [
  { group: "Get Started", items: [
    { id: "intro",      label: "Introduction" },
    { id: "quickstart", label: "Quickstart" },
    { id: "tokens",     label: "Supported Tokens" },
  ]},
  { group: "Concepts", items: [
    { id: "how-umbra",  label: "How Umbra Works" },
    { id: "utxos",      label: "UTXOs & the Mixer" },
    { id: "enc-bal",    label: "Encrypted Balances" },
  ]},
  { group: "Features", items: [
    { id: "links",      label: "Private Payment Links" },
    { id: "conf",       label: "Confidential Transfers" },
    { id: "shield",     label: "Shield & Unshield" },
    { id: "x402",       label: "x402 Payments" },
  ]},
  { group: "SDK & Integrations", items: [
    { id: "sdk",        label: "@veilpay/x402-sdk" },
    { id: "skill",      label: "VeilPay Agent Skill" },
  ]},
  { group: "Security", items: [
    { id: "security",   label: "Security Model" },
    { id: "privacy",    label: "Privacy Guarantees" },
  ]},
];
const ALL_IDS = NAV.flatMap(g => g.items);

// ─── Search index ────────────────────────────────────────────────────────────

const SEARCH_INDEX = NAV.flatMap(({ group, items }) =>
  items.map(({ id, label }) => ({ id, label, group }))
);

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DocsPage() {
  const [active, setActive] = useState("intro");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem("vp-theme") as "light" | "dark" | null;
    const pref = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const init = stored ?? pref;
    setTheme(init);
    document.documentElement.dataset.theme = init;
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(p => {
      const n = p === "light" ? "dark" : "light";
      localStorage.setItem("vp-theme", n);
      document.documentElement.dataset.theme = n;
      return n;
    });
  }, []);

  // Scroll-spy via IntersectionObserver
  useEffect(() => {
    const els = ALL_IDS.map(s => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      entries => { entries.forEach(e => { if (e.isIntersecting) setActive(e.target.id); }); },
      { rootMargin: "-15% 0px -65% 0px" }
    );
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  const go = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (el) { el.scrollIntoView({ behavior: "smooth", block: "start" }); setActive(id); }
  }, []);

  const searchResults = searchQuery.trim().length > 0
    ? SEARCH_INDEX.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.group.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SEARCH_INDEX;

  // Close search on outside click
  useEffect(() => {
    if (!searchOpen) return;
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchQuery("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [searchOpen]);

  // ⌘K / Ctrl+K opens search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 50);
      }
      if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  return (
    // Outer shell: no stacking context (no z-index), just positions the fixed background
    <div style={{ minHeight: "100vh", position: "relative", background: "var(--bg)" }}>
      <BackgroundStage animOn={false} fixed />

      {/* Content wrapper: z-index:1 lifts everything above the fixed background */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", minHeight: "100vh" }}>

      {/* ── Top bar ── */}
      <header className="dc-topbar glass">
        <div className="dc-topbar-inner">
          {/* Left: logo + breadcrumb */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
            <a href="/" style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 22, height: 22 }} />
              <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.02em" }}>VeilPay</span>
            </a>
            <ChevronRight size={12} style={{ color: "var(--ink-4)" }} />
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>Docs</span>
          </div>

          {/* Center: search */}
          <div ref={searchRef} style={{ flex: 1, maxWidth: 380, position: "relative" }}>
            <div
              className="dc-search"
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
            >
              <Search size={13} style={{ color: "var(--ink-4)", flexShrink: 0 }} />
              {searchOpen
                ? <input
                    ref={searchInputRef}
                    className="dc-search-input"
                    placeholder="Search documentation…"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    onClick={e => e.stopPropagation()}
                    autoFocus
                  />
                : <span style={{ fontSize: 13, color: "var(--ink-4)", flex: 1 }}>Search documentation…</span>
              }
              <kbd className="dc-kbd">⌘K</kbd>
            </div>

            {/* Search dropdown */}
            {searchOpen && (
              <div className="dc-search-drop glass">
                {searchResults.length === 0 ? (
                  <p style={{ fontSize: 12.5, color: "var(--ink-4)", padding: "12px 14px", margin: 0 }}>No results for &ldquo;{searchQuery}&rdquo;</p>
                ) : (
                  searchResults.map(item => (
                    <button
                      key={item.id}
                      className="dc-search-result"
                      onClick={() => { go(item.id); setSearchOpen(false); setSearchQuery(""); }}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, color: "var(--ink)" }}>{item.label}</span>
                      <span style={{ fontSize: 11, color: "var(--ink-4)", marginLeft: "auto" }}>{item.group}</span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Right: links + theme */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <a href="https://github.com/Bmzennn/veilpay" target="_blank" rel="noopener noreferrer" className="dc-topbar-link">
              GitHub <ExternalLink size={10} />
            </a>
            <a href="/create" className="btn btn-primary" style={{ fontSize: 12.5, padding: "7px 16px", gap: 6 }}>
              Get Started <ArrowRight size={12} />
            </a>
            <button className="dc-theme-btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        </div>
      </header>

      {/* ── 3-column body ── */}
      <div className="dc-body">

        {/* Left sidebar */}
        <aside className="dc-sidebar-l">
          <div className="dc-sidebar-l-inner">
            {NAV.map(({ group, items }) => (
              <div key={group} className="dc-nav-group">
                <p className="dc-nav-group-label">{group}</p>
                {items.map(({ id, label }) => (
                  <button
                    key={id}
                    className={`dc-nav-item${active === id ? " is-active" : ""}`}
                    onClick={() => go(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>

        {/* Main content */}
        <main className="dc-main">

          {/* ── Introduction ── */}
          <SH id="intro" tag="Get Started">Introduction</SH>
          <P><strong>VeilPay</strong> is a private payments application built on the <a href="https://umbraprivacy.com" target="_blank" rel="noopener noreferrer" className="dc-link">Umbra Protocol</a> on Solana. It lets anyone send and receive tokens with zero on-chain link between sender and recipient — using Groth16 ZK proofs and Arcium MPC encryption.</P>
          <P>VeilPay exposes four primitives over a single shielded pool:</P>
          <UL items={[
            <><strong>Private Payment Links</strong> — shareable URLs that encode an ephemeral claim key. Both sender and recipient remain fully anonymous on-chain.</>,
            <><strong>Confidential Transfers</strong> — direct encrypted deposits to a known recipient&apos;s Umbra balance. The amount is hidden; addresses are known.</>,
            <><strong>Shield &amp; Unshield</strong> — move tokens between your own public wallet and your private encrypted balance at any time.</>,
            <><strong>x402 Payments</strong> — HTTP 402 pay-per-request flows using Umbra stealth deposits. The server receives payment without learning who paid.</>,
          ]} />
          <Note>Set <IC c="NEXT_PUBLIC_NETWORK=mainnet" /> to target mainnet. Default is devnet. On devnet, only SOL transfers work natively.</Note>

          {/* ── Quickstart ── */}
          <SH id="quickstart" tag="Get Started">Quickstart</SH>
          <P>Get VeilPay running locally in under five minutes.</P>

          <H3>Prerequisites</H3>
          <UL items={["Node.js 18+ and npm", "A Phantom or Solflare wallet browser extension", "A Supabase project (free tier works)", "A Solana RPC endpoint (Helius, QuickNode, or the public devnet)"]} />

          <H3>Clone and install</H3>
          <Code lang="bash" code={`git clone https://github.com/your-org/veilpay
cd veilpay/app
npm install`} />

          <H3>Configure environment</H3>
          <P>Copy the example env file and fill in your values:</P>
          <Code lang="bash" code={`cp .env.example .env.local`} />
          <Code lang="bash" code={`# .env.local
NEXT_PUBLIC_NETWORK=devnet
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_RPC_WS_URL=wss://api.devnet.solana.com

# Umbra services (auto-selected by NEXT_PUBLIC_NETWORK if omitted)
NEXT_PUBLIC_UMBRA_RELAYER_URL=https://relayer.api-devnet.umbraprivacy.com
NEXT_PUBLIC_UMBRA_INDEXER_URL=/api/indexer-proxy   # proxied — do not change

# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # server-side only

# Link expiry
NEXT_PUBLIC_LINK_EXPIRY_DAYS=7`} />

          <H3>Create the Supabase table</H3>
          <Code lang="sql" code={`create table links (
  id           text primary key,
  amount       text not null,
  token        text not null,
  amount_raw   text not null,
  decimals     int  not null,
  created_at   timestamptz not null,
  expires_at   timestamptz not null,
  claimed      boolean not null default false,
  locked_to    text,
  claimed_by   text,
  claimed_at   timestamptz
);
alter table links enable row level security;
create policy "Public read" on links for select using (true);`} />

          <H3>Start the dev server</H3>
          <Code lang="bash" code={`npm run dev
# → http://localhost:3000`} />
          <Note>The first time you create a link the browser downloads ~100 MB of ZK circuit files (<IC c=".zkey" /> + <IC c=".wasm" />). They are cached in the browser's Cache Storage under <IC c="veilpay-zk-v2" /> and never re-downloaded.</Note>

          {/* ── Supported Tokens ── */}
          <SH id="tokens" tag="Get Started">Supported Tokens</SH>
          <P>VeilPay supports SOL and five SPL tokens. All SPL tokens use their mainnet mint addresses — devnet SOL-only.</P>
          <Table
            head={["Symbol", "Name", "Decimals", "Mainnet Mint", "Status"]}
            rows={[
              ["SOL",  "Solana",      "9", "So1111…1112", <Badge label="Devnet + Mainnet" color="green" />],
              ["USDC", "USD Coin",    "6", "EPjFWd…Dt1v", <Badge label="Mainnet only" color="amber" />],
              ["USDT", "Tether USD",  "6", "Es9vMF…NYB",  <Badge label="Mainnet only" color="amber" />],
              ["BONK", "Bonk",        "5", "DezXAZ…B263", <Badge label="Mainnet only" color="amber" />],
              ["JUP",  "Jupiter",     "6", "JUPyiw…vCN",  <Badge label="Mainnet only" color="amber" />],
              ["WIF",  "dogwifhat",   "6", "EKpQGS…cjm",  <Badge label="Mainnet only" color="amber" />],
            ]}
          />
          <Warn>Sending SPL tokens on devnet will always fail with "insufficient balance" — devnet nodes do not mirror mainnet token accounts. Test SPL flows on mainnet or a mainnet fork.</Warn>

          {/* ── How Umbra Works ── */}
          <SH id="how-umbra" tag="Concepts">How Umbra Works</SH>
          <P>Umbra is a privacy protocol on Solana that provides a shared <strong>shielded pool</strong>. Funds enter the pool as encrypted commitments and leave from unlinkable addresses. The privacy comes from four cryptographic layers:</P>

          <div className="dc-concept-grid">
            {[
              { label: "ZK Proofs", sub: "Groth16", desc: "Every UTXO claim requires a valid Groth16 proof that the claimant knows the secret randomness and owns the right key — without revealing either." },
              { label: "Poseidon Hashing", sub: "Commitment scheme", desc: "UTXOs are stored as Poseidon hashes of (amount, recipient_x25519, secret_randomness). Only the hash touches the chain." },
              { label: "Arcium MPC", sub: "Encrypted balances", desc: "The encrypted balance uses Arcium's multi-party computation network to hold token amounts in a ciphertext only you can read." },
              { label: "X25519 Keys", sub: "ECDH discovery", desc: "Each account has an X25519 keypair registered on-chain. Senders encrypt UTXO details to the recipient's public key so only they can scan and find it." },
            ].map(c => (
              <div key={c.label} className="dc-concept-card glass">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                  <strong style={{ fontSize: 13.5, fontWeight: 600 }}>{c.label}</strong>
                  <span style={{ fontSize: 10, color: "var(--vp-sky-deep)", background: "rgba(0,179,255,0.08)", border: "0.5px solid rgba(0,179,255,0.2)", padding: "2px 8px", borderRadius: 999, fontWeight: 600 }}>{c.sub}</span>
                </div>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0, lineHeight: 1.55 }}>{c.desc}</p>
              </div>
            ))}
          </div>

          <H3>The shielded pool as anonymity set</H3>
          <P>Privacy is proportional to the pool&apos;s anonymity set — the number of active UTXOs. When your UTXO leaves the pool alongside thousands of others, a passive observer cannot determine which withdrawal corresponds to which deposit. VeilPay uses a single shared pool for all tokens and all users, maximising this set.</P>

          <H3>Umbra program architecture</H3>
          <Steps items={[
            ["User registration",      "Each user registers two X25519 keys on-chain (user-account key + master-viewing key). A ZK proof binds the Ed25519 wallet key to the X25519 keys."],
            ["Deposit (UTXO creation)", "The sender calls the Umbra program to insert a commitment into the indexed Merkle tree. The UTXO is addressed to the recipient&apos;s X25519 public key."],
            ["UTXO scanning",           "The recipient's client decrypts incoming UTXOs using their X25519 private key via the indexer's ciphertext discovery mechanism."],
            ["Claim (nullifier spend)", "A ZK proof is generated proving knowledge of the UTXO's secret randomness. The nullifier is burned on-chain (double-spend prevention), and the balance enters the encrypted account."],
            ["Withdrawal",              "The encrypted balance is moved to the user's public ATA via an Arcium MPC decryption and on-chain token transfer."],
          ]} />

          {/* ── UTXOs ── */}
          <SH id="utxos" tag="Concepts">UTXOs &amp; the Mixer</SH>
          <P>A UTXO (<strong>Unspent Transaction Output</strong>) in Umbra is a cryptographic commitment representing the right to claim a specific amount of tokens — without publicly linking that right to who created it.</P>

          <H3>What a UTXO encodes</H3>
          <P>Each UTXO is the Poseidon hash of three private values:</P>
          <Code lang="text" code={`commitment = Poseidon(
  amount,             // token quantity (u64)
  recipient_x25519,   // recipient's curve25519 public key (32 bytes)
  secret_randomness   // 32 bytes of entropy known only to the depositor
)`} />
          <P>Only the <IC c="commitment" /> is stored on-chain. The inputs remain private and are transmitted to the recipient encrypted via ECDH over the recipient&apos;s X25519 key.</P>

          <H3>The indexed Merkle tree</H3>
          <P>Umbra stores commitments in an <strong>Indexed Merkle Tree</strong> — a binary Merkle tree where each leaf is a UTXO commitment. The tree root is stored on-chain and updated with each new deposit. The indexer tracks all leaves and provides Merkle proofs needed for ZK claims.</P>
          <UL items={[
            "Tree capacity: 2²⁰ leaves per tree (~1 million UTXOs). New trees are created as capacity is filled.",
            "Leaves are inserted sequentially — insertion order provides a privacy hint but not a direct link.",
            "The indexer exposes a read-only gRPC API for scanning UTXOs by X25519 key.",
          ]} />

          <H3>Nullifiers: preventing double-spends</H3>
          <P>When a UTXO is claimed, the ZK proof includes the <IC c="nullifier" /> — a deterministic hash derived from the UTXO&apos;s secret randomness and the claimant&apos;s key. The program burns the nullifier on-chain (writes it to a <IC c="NullifierAccount" /> PDA). Any attempt to re-claim the same UTXO produces the same nullifier and is rejected with error <IC c="0x6d64 NullifierAlreadyBurnt" />.</P>

          <H3>Ciphertext discovery (scanning)</H3>
          <P>Each UTXO&apos;s plaintext (amount + secret) is encrypted to the recipient&apos;s X25519 public key using ECDH + AES-256-GCM. The ciphertext is stored in the indexer alongside the commitment. The recipient fetches ciphertexts from the indexer and trial-decrypts them with their X25519 private key. A successful decryption reveals the amount and secret randomness needed to build the claim proof.</P>

          <H3>Receiver-claimable UTXOs vs. encrypted balance UTXOs</H3>
          <Table
            head={["Type", "Who can claim", "Requires ZK proof?", "Used in"]}
            rows={[
              ["Receiver-claimable",  "Anyone with the ephemeral private key", "Yes (Groth16)",    "Private payment links"],
              ["Encrypted balance",   "The registered account holder only",   "No (direct MPC)",  "Confidential transfers, shield"],
            ]}
          />

          {/* ── Encrypted Balances ── */}
          <SH id="enc-bal" tag="Concepts">Encrypted Balances</SH>
          <P>An <strong>Encrypted Balance</strong> is a per-token, per-user ciphertext stored in a PDA (<IC c="EncryptedTokenAccount" />) on-chain. Only the account owner can decrypt it using their X25519 private key in combination with Arcium&apos;s MPC network.</P>

          <H3>Arcium MPC</H3>
          <P>Arcium is a multiparty computation (MPC) network built on Solana. When your encrypted balance changes — via a deposit, claim, or withdrawal — the Umbra program emits an Arcium computation request. The Arcium nodes collectively evaluate an arithmetic circuit over the ciphertext, updating the balance without any node learning the plaintext amount.</P>
          <P>Key properties:</P>
          <UL items={[
            "No single Arcium node can decrypt the balance — threshold security requires collusion of a supermajority.",
            "The balance update is verified on-chain via a succinct proof from the Arcium prover.",
            "The Umbra relayer pays Arcium computation fees on the user's behalf — users pay only Solana transaction fees.",
          ]} />

          <H3>Balance states</H3>
          <P>The encrypted balance SDK returns one of three states:</P>
          <Table
            head={["State", "Meaning", "Can withdraw?"]}
            rows={[
              [<IC c="none" />,    "Account PDA not yet initialised — no deposits received.", "No"],
              [<IC c="mxe" />,     "Arcium computation in progress — balance updating.", "No (wait ~30s)"],
              [<IC c="shared" />,  "Balance settled and ready.", "Yes"],
            ]}
          />

          <H3>Viewing keys</H3>
          <P>The <strong>Master Viewing Key</strong> (MVK) is an X25519 keypair derived from the wallet&apos;s master seed. It is registered on-chain during account setup. Anyone holding the MVK can decrypt all incoming ciphertexts for that account — but cannot sign transactions or move funds. This enables selective disclosure to auditors without granting custody.</P>
          <Note>The VeilPay Audit tab lets you paste a claim URL hash and inspect the UTXO status — pending, in-transit, or delivered — without connecting a wallet.</Note>

          {/* ── Private Payment Links ── */}
          <SH id="links" tag="Features">Private Payment Links</SH>
          <P>Private links let a sender create a one-time claimable payment in the shielded pool. No recipient wallet address is needed at creation time — you share the URL and they claim it later from any device.</P>

          <H3>How it works</H3>
          <Steps items={[
            ["Generate ephemeral keypair",  "A fresh Ed25519 keypair is generated in-browser. The private key never touches the server."],
            ["Fund ephemeral",              <>0.02 SOL is sent from the sender to the ephemeral address to cover Umbra registration rent (<IC c="EPHEMERAL_SOL_BUFFER" />).</>],
            ["Register ephemeral",          "The ephemeral address is registered with the Umbra program (X25519 keys on-chain, one ZK registration proof)."],
            ["Create receiver-claimable UTXO", "The sender deposits funds into the Umbra Merkle tree, addressed to the ephemeral key."],
            ["Encode URL",                  <>The ephemeral private key + token are base58-encoded into the URL hash: <IC c="/claim?lid=…&exp=…#<bs58Key>:<TOKEN>" />. The hash never leaves the browser.</>],
          ]} />

          <H3>Claim flow</H3>
          <Steps items={[
            ["Parse URL hash",    "The claim page reads the hash fragment synchronously in useLayoutEffect — before first paint — and immediately clears it from the URL via history.replaceState."],
            ["Scan the pool",     "The SDK scans the Umbra indexer for UTXOs addressed to the ephemeral X25519 key."],
            ["Generate ZK proof", "A Groth16 proof is computed in the browser (~15–60 s). ZK circuit files are cached after first download."],
            ["Claim to encrypted balance", "The relayer broadcasts the ZK claim transaction. The relayer pays fees."],
            ["Withdraw",          "The ephemeral encrypted balance is swept to the recipient's public ATA."],
            ["Mark claimed",      "The link is marked claimed in Supabase via a signed PATCH request."],
          ]} />

          <H3>Wallet-locked links</H3>
          <P>Optionally restrict claiming to a specific wallet. The claim page verifies the connected wallet matches via <IC c="signMessage" /> and an Ed25519 signature before the claim transaction is submitted. Suitable for high-value, pre-arranged payments.</P>

          <H3>Link expiry</H3>
          <P>Links expire after <IC c="NEXT_PUBLIC_LINK_EXPIRY_DAYS" /> days (default 7). The expiry is encoded in the URL query string (<IC c="?exp=<ms>" />) and checked client-side before any network call. Expired links show a clear error state.</P>

          {/* ── Confidential Transfers ── */}
          <SH id="conf" tag="Features">Confidential Transfers</SH>
          <P>Confidential transfers move tokens from your public wallet directly into a known recipient&apos;s Umbra encrypted balance. The amount is hidden on-chain via Arcium MPC. The transaction records your address and the recipient&apos;s PDA — not their wallet address — so the amount is private but the relationship is visible.</P>

          <H3>When to use confidential transfers vs. private links</H3>
          <Table
            head={["", "Private Link", "Confidential Transfer"]}
            rows={[
              ["Sender identity",       "Hidden",   "Visible"],
              ["Recipient identity",    "Hidden",   "Visible (PDA only)"],
              ["Amount on-chain",       "Hidden",   "Hidden"],
              ["Recipient needs account", "No",     "Yes — must have VeilPay account"],
              ["Claim step required",   "Yes",      "No — instant arrival"],
              ["Best for",              "Fully anonymous sends, tips, anonymous invoices", "Business payments, payroll, recurring known-party sends"],
            ]}
          />

          <H3>How it works</H3>
          <P>VeilPay calls <IC c="getPublicBalanceToEncryptedBalanceDirectDepositorFunction" /> from the Umbra SDK. This creates a deposit transaction that triggers an Arcium MPC computation encrypting the token amount into the recipient&apos;s <IC c="EncryptedTokenAccount" /> PDA.</P>
          <Warn>The recipient must have connected to VeilPay at least once so their Umbra account PDAs are initialised on-chain. The SDK will throw if they haven't registered.</Warn>

          {/* ── Shield & Unshield ── */}
          <SH id="shield" tag="Features">Shield &amp; Unshield</SH>
          <P>Shielding moves tokens from your <strong>public wallet</strong> into your <strong>own encrypted balance</strong>. Unshielding (withdrawal) reverses this — it moves your encrypted balance back to your public ATA. This is useful for accumulating privacy before a transfer, or for converting a public balance to a shielded one without involving another party.</P>

          <H3>Shield flow (public → encrypted)</H3>
          <Steps items={[
            ["Check registration",   "VeilPay verifies your Umbra account PDAs exist. If not, it runs a ZK registration (wallet prompts 2–4)."],
            ["Ensure ATA",           "For SPL tokens, the associated token account is created if missing."],
            ["Deposit to self",      <>Calls <IC c="getPublicBalanceToEncryptedBalanceDirectDepositorFunction" /> with your own address as recipient. Your public tokens are locked and your encrypted balance increases.</>],
          ]} />
          <Note>Shielding SOL requires no ATA — SOL is handled natively. Shielding SPL tokens may trigger one extra wallet prompt to create the token account.</Note>

          <H3>Unshield flow (encrypted → public)</H3>
          <Steps items={[
            ["Enter amount",        "From the Dashboard, click Withdraw on any token with a non-zero encrypted balance and enter the amount in the modal."],
            ["Arcium decryption",   <>VeilPay calls <IC c="getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction" />. Arcium MPC decrements the encrypted balance.</>],
            ["On-chain transfer",   "The Umbra program transfers tokens from the program's escrow to your public ATA."],
          ]} />

          <H3>From the Dashboard UI</H3>
          <P>The Dashboard shows both your <strong>Public Balance</strong> and <strong>Encrypted Balance</strong> side by side for every supported token. Each row has two action buttons:</P>
          <UL items={[
            <><strong>Shield</strong> — opens a modal to enter an amount (with MAX button), moves public → encrypted.</>,
            <><strong>Withdraw</strong> — opens a modal to enter an amount, moves encrypted → public.</>,
          ]} />

          {/* ── x402 ── */}
          <SH id="x402" tag="Features">x402 Payments</SH>
          <P>The <a href="https://x402.org" target="_blank" rel="noopener noreferrer" className="dc-link">x402 protocol</a> extends HTTP with a <IC c="402 Payment Required" /> response carrying machine-readable payment instructions. VeilPay implements x402 using Umbra stealth deposits — so the payment is metered <em>and</em> private.</P>

          <H3>Protocol flow</H3>
          <Steps items={[
            ["Request",           "Client sends GET/POST to a protected endpoint."],
            ["402 response",      <>Server returns a JSON invoice: amount, token, destination address, 32-byte <IC c="invoiceId" />.</>],
            ["Deposit",           <>Client makes an Umbra stealth deposit to the server&apos;s Umbra address, embedding <IC c="invoiceId" /> in the proof instruction&apos;s optional-data field.</>],
            ["X-402-Payment header", <>Client retries with <IC c="X-402-Payment: x402 <proofTxSig>:<depositTxSig>:<invoiceIdHex>" />.</>],
            ["Server verifies",   "Server decrypts the proof payload via ECDH + AES-256-GCM, checks amount ≥ required, destination correct, invoiceId matches, signature not replayed."],
            ["200 response",      "API content returned."],
          ]} />

          <H3>Invoice response format</H3>
          <Code lang="json" code={`HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": "Payment Required",
  "invoice": {
    "amount": 0.1,
    "token": "SOL",
    "destination": "<server_solana_address>",
    "invoiceId": "<32_byte_hex>"
  }
}`} />

          <H3>Payment header format</H3>
          <Code lang="http" code={`X-402-Payment: x402 <proofTxSignature>:<depositTxSignature>:<invoiceIdHex>`} />

          <H3>Proof instruction AES payload layout</H3>
          <Code lang="text" code={`Bytes  0– 7 : amount         (little-endian u64)
Bytes  8–39 : destination     (32-byte address)
Bytes 40–55 : generation idx  (16 bytes)
Bytes 56–67 : domain sep.     (12 bytes)`} />

          {/* ── SDK ── */}
          <SH id="sdk" tag="SDK & Integrations">@veilpay/x402-sdk</SH>
          <P>Drop-in Node.js package for accepting private x402 payments in any server framework.</P>

          <H3>Installation</H3>
          <Code lang="bash" code={`npm install @veilpay/x402-sdk`} />

          <H3>Next.js App Router</H3>
          <Code lang="typescript" code={`// app/api/premium/route.ts
import { createX402 } from "@veilpay/x402-sdk";
import { Connection } from "@solana/web3.js";

const x402 = createX402({
  network: "mainnet",
  connection: new Connection(process.env.RPC_URL!),
  serverPrivateKeyBase58: process.env.X402_SERVER_PRIVATE_KEY!,
  serverSolanaAddress: process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS!,
});

export const GET = x402.nextjs(
  { amount: 0.1, token: "SOL" },
  async (req) => Response.json({ data: "premium content" })
);`} />

          <H3>Express</H3>
          <Code lang="typescript" code={`import express from "express";
import { createX402 } from "@veilpay/x402-sdk";

const x402 = createX402({ network: "mainnet", connection, serverPrivateKeyBase58: "…", serverSolanaAddress: "…" });
const app = express();

app.get("/premium",
  x402.express({ amount: 0.1, token: "SOL" }),
  (req, res) => res.json({ data: "premium content" })
);`} />

          <H3>Client — automatic payment</H3>
          <Code lang="typescript" code={`import { x402Fetch } from "@veilpay/x402-sdk";

// On a 402 response, x402Fetch automatically creates an Umbra deposit
// and retries with the X-402-Payment header.
const res = await x402Fetch("https://yourapp.com/api/premium", {
  wallet,    // Wallet Standard Wallet
  account,   // WalletAccount
  network: "mainnet",
});
const data = await res.json();`} />

          <H3>Replay protection — Redis store</H3>
          <Code lang="typescript" code={`import type { ReplayStore } from "@veilpay/x402-sdk";

class RedisReplayStore implements ReplayStore {
  constructor(private redis: Redis) {}
  async has(sig: string): Promise<boolean> {
    return (await this.redis.exists(\`x402:seen:\${sig}\`)) === 1;
  }
  async add(sig: string): Promise<void> {
    await this.redis.setex(\`x402:seen:\${sig}\`, 86400 * 30, "1");
  }
}

const x402 = createX402({ …, replayStore: new RedisReplayStore(redis) });`} />

          <H3>API reference</H3>
          <Table
            head={["Function", "Description"]}
            rows={[
              [<IC c="createX402(config)" />,              "Factory. Returns an X402Instance for your server."],
              [<IC c="x402.nextjs(opts, handler)" />,      "Wraps a Next.js App Router handler with x402 enforcement."],
              [<IC c="x402.express(opts)" />,               "Returns an Express middleware."],
              [<IC c="x402.handle(req, opts, handler)" />,  "Framework-agnostic handler (fetch-compatible Request)."],
              [<IC c="x402.verify(payment, amount, token)" />, "Fully verifies an x402 payment. Returns { valid, reason }."],
              [<IC c="x402.generateInvoice(amt, token)" />, "Returns a fresh { invoiceId, invoiceIdHex } pair."],
              [<IC c="x402.parseAuthHeader(header)" />,     "Parses X-402-Payment header → X402Payment | null."],
              [<IC c="x402Fetch(url, opts)" />,             "Client helper — auto-pays 402 responses."],
              [<IC c="new MemoryReplayStore()" />,          "In-memory replay store. Single-instance only."],
            ]}
          />

          {/* ── Agent Skill ── */}
          <SH id="skill" tag="SDK & Integrations">VeilPay Agent Skill</SH>
          <P>The VeilPay agent skill lets AI agents create and claim private payment links fully autonomously — no browser, no wallet popup. The agent signs transactions with its own stored keypair. ZK proofs run locally in Node.js.</P>

          <H3>Install</H3>
          <Code lang="bash" code={`npx skills add Bmzennn/agent-skills@veilpay`} />

          <H3>Agent setup</H3>
          <Code lang="bash" code={`node scripts/wallet.cjs create    # generate wallet → ~/.veilpay/wallet.json
node scripts/wallet.cjs airdrop   # request devnet SOL
node scripts/wallet.cjs balance`} />

          <H3>Create a payment link</H3>
          <Code lang="bash" code={`node scripts/create-link.cjs --amount 1.5 --token SOL --network devnet`} />
          <Code lang="text" code={`[1/4] Generating ephemeral keypair…
[2/4] Funding ephemeral…
[3/4] Registering privacy channels (ZK proofs)…
[4/4] Depositing into shielded pool…

✅ Link: https://veilpay.xyz/claim?lid=…#<secret>:SOL
   Amount: 1.5 SOL  |  Expires: 7 days`} />

          <H3>Claim a link</H3>
          <Code lang="bash" code={`node scripts/claim-link.cjs --link "https://veilpay.xyz/claim?lid=…#<secret>:SOL"`} />
          <Code lang="text" code={`[1/5] Scanning pool… Found 1.5 SOL
[2/5] Generating ZK proof (~20–60s, cached after first run)…
[3/5] On-chain ZK verification… ✓
[4/5] Preparing token account…
[5/5] Withdrawing to wallet…

✅ Claimed: 1.5 SOL → 7xKt…9mPq`} />
          <Note>ZK circuit files (~100 MB) are cached at <IC c="~/.veilpay/zk-cache/" /> after the first claim. Subsequent claims skip the download.</Note>

          <H3>Why no browser required</H3>
          <P>The browser version uses Phantom for signing because browsers cannot safely hold raw private keys. An agent has no such constraint — it uses <IC c="createSignerFromPrivateKeyBytes" /> from the Umbra SDK directly. The ZK prover runs in Node.js with local circuit files, producing identical proofs to the browser version.</P>
          <Warn>Store the agent wallet with <IC c="chmod 600 ~/.veilpay/wallet.json" />. Never commit it to version control.</Warn>

          {/* ── Security Model ── */}
          <SH id="security" tag="Security">Security Model</SH>

          <H3>Claim note protection</H3>
          <P>The ephemeral private key lives only in the URL hash. VeilPay clears it from the URL via <IC c="window.history.replaceState" /> in <IC c="useLayoutEffect" /> — synchronously before first paint — minimising the window in which browser extensions can observe it.</P>
          <P>Three runtime protections guard the link display:</P>
          <UL items={[
            <><strong>Blur by default</strong> — the key is blurred until the user clicks Reveal.</>,
            <><strong>Focus-loss re-blur</strong> — the key re-blurs immediately if the window loses focus (tab switch, screen share, alt-tab).</>,
            <><strong>15-second auto-hide</strong> — a live countdown re-blurs the key after 15 s. The user must re-click to reveal again.</>,
          ]} />

          <H3>Clipboard hijack detection</H3>
          <P>Malicious extensions sometimes overwrite <IC c="navigator.clipboard.writeText" /> to silently replace copied addresses. VeilPay detects this by checking <IC c="Function.prototype.toString" /> on the clipboard method — extensions that override it typically do not also spoof the native-code signature. If tampering is detected, the Copy button is disabled and an amber warning is shown; the OS-level Web Share API remains available.</P>

          <H3>Server-side security</H3>
          <UL items={[
            <>All POST/PATCH requests to <IC c="/api/links" /> require an Ed25519 signature from the sender&apos;s wallet, verified server-side with <IC c="@noble/curves/ed25519" />.</>,
            "Signatures include a Unix timestamp — requests older than 5 minutes are rejected (replay protection).",
            "Rate limiting: 20 link creations per IP per minute.",
            "Supabase Row Level Security is enforced — the database is append-only for the anon key; only the service-role key can mark links claimed.",
            "The service-role key is server-side only (no NEXT_PUBLIC_ prefix) and is never sent to the browser.",
          ]} />

          {/* ── Privacy Guarantees ── */}
          <SH id="privacy" tag="Security">Privacy Guarantees</SH>
          <P>What VeilPay can and cannot hide:</P>
          <Table
            head={["Property", "Private Links", "Confidential Transfers", "x402"]}
            rows={[
              ["Sender identity",      <Badge label="Hidden" color="green" />, <Badge label="Visible" color="amber" />, <Badge label="Partial" color="amber" />],
              ["Recipient identity",   <Badge label="Hidden" color="green" />, <Badge label="PDA only" color="amber" />, <Badge label="Server only" color="amber" />],
              ["Transfer amount",      <Badge label="Hidden" color="green" />, <Badge label="Hidden" color="green" />, <Badge label="Hidden" color="green" />],
              ["Transfer time",        <Badge label="Visible" color="red" />,  <Badge label="Visible" color="red" />,  <Badge label="Visible" color="red" />],
              ["Token type",           <Badge label="Visible" color="red" />,  <Badge label="Visible" color="red" />,  <Badge label="Visible" color="red" />],
              ["Link to existing balance", <Badge label="No link" color="green" />, <Badge label="PDA linked" color="amber" />, <Badge label="No link" color="green" />],
            ]}
          />
          <Note>Transaction timing and token type are always visible on-chain. For maximum privacy, avoid patterns that make timing-correlation attacks trivial (e.g. depositing and withdrawing the exact same amount within minutes of each other).</Note>


          {/* ── Footer spacer ── */}
          <div style={{ height: 64 }} />
        </main>

        {/* Right TOC */}
        <aside className="dc-sidebar-r">
          <div className="dc-sidebar-r-inner">
            <p className="dc-toc-label">On this page</p>
            {NAV.map(({ group, items }) => (
              <div key={group} className="dc-toc-group">
                <p className="dc-toc-group-label">{group}</p>
                {items.map(({ id, label }) => (
                  <button
                    key={id}
                    className={`dc-toc-item${active === id ? " is-active" : ""}`}
                    onClick={() => go(id)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="dc-footer">
        <div className="dc-footer-inner">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-nobg.png" alt="VeilPay" style={{ width: 18, height: 18, opacity: 0.6 }} />
            <span>VeilPay Docs · Built on Umbra Protocol</span>
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            <a href="/">Home</a>
            <a href="/create">App</a>
            <a href="/audit">Audit</a>
          </div>
        </div>
      </footer>

      </div> {/* /content wrapper */}

      <style jsx global>{`
        /* ── Top bar ── */
        .dc-topbar {
          position:sticky; top:0; z-index:50;
          border-bottom:1px solid var(--hairline);
          border-radius:0 !important;
          backdrop-filter:blur(20px) saturate(180%);
          -webkit-backdrop-filter:blur(20px) saturate(180%);
          overflow:visible !important;
        }
        .dc-topbar-inner {
          max-width:1400px; margin:0 auto; padding:0 24px;
          height:54px; display:flex; align-items:center; gap:16px;
        }
        .dc-topbar-logo { display:flex; align-items:center; gap:8px; font-weight:600; font-size:14px; letter-spacing:-0.02em; }
        .dc-topbar-link { display:flex; align-items:center; gap:4px; font-size:12.5px; color:var(--ink-3); font-weight:500; transition:color 0.15s; }
        .dc-topbar-link:hover { color:var(--ink); }

        /* Search */
        .dc-search {
          flex:1; max-width:380px; display:flex; align-items:center; gap:8px;
          background:var(--glass-bg); border:0.5px solid var(--hairline-strong);
          border-radius:var(--radius-pill); padding:7px 14px; cursor:text;
          font-size:13px; color:var(--ink-4);
          transition:border-color 0.15s, box-shadow 0.15s;
        }
        .dc-search:hover { border-color:var(--hairline-strong); box-shadow:0 0 0 3px rgba(0,179,255,0.06); }
        .dc-kbd {
          margin-left:auto; font-size:10px; font-family:var(--font-mono);
          padding:1px 6px; border-radius:5px;
          background:var(--glass-bg-strong); border:0.5px solid var(--hairline-strong);
          color:var(--ink-4);
        }
        .dc-theme-btn {
          width:32px; height:32px; border-radius:8px; display:flex; align-items:center; justify-content:center;
          background:var(--glass-bg); border:0.5px solid var(--hairline); color:var(--ink-3);
          cursor:pointer; transition:background 0.15s, color 0.15s; flex-shrink:0;
        }
        .dc-theme-btn:hover { background:var(--glass-bg-strong); color:var(--ink); }

        /* Search dropdown */
        .dc-search-input { flex:1; background:none; border:none; outline:none; font-size:13px; color:var(--ink); font-family:var(--font-sans); min-width:0; }
        .dc-search-input::placeholder { color:var(--ink-4); }
        .dc-search-drop {
          position:absolute; top:calc(100% + 8px); left:0; right:0;
          z-index:200; border-radius:var(--radius-md); overflow:hidden;
          box-shadow:0 16px 40px -8px rgba(0,0,0,0.5);
          max-height:320px; overflow-y:auto;
          background:var(--bg) !important;
          border:0.5px solid var(--hairline-strong) !important;
          backdrop-filter:blur(24px) saturate(200%) !important;
          -webkit-backdrop-filter:blur(24px) saturate(200%) !important;
        }
        [data-theme='dark'] .dc-search-drop {
          background:rgba(10,16,32,0.96) !important;
        }
        :root:not([data-theme='dark']) .dc-search-drop {
          background:rgba(245,249,255,0.97) !important;
        }
        .dc-search-result {
          width:100%; text-align:left; display:flex; align-items:center; gap:8px;
          padding:10px 14px; border-bottom:1px solid var(--hairline);
          background:none; cursor:pointer; transition:background 0.12s;
        }
        .dc-search-result:last-child { border-bottom:none; }
        .dc-search-result:hover { background:var(--glass-bg-strong); }

        /* ── Body grid ── */
        .dc-body {
          flex:1; display:grid;
          grid-template-columns:240px minmax(0,1fr) 200px;
          max-width:1400px; margin:0 auto; width:100%; padding:0 24px;
        }
        @media (max-width:1100px) { .dc-body { grid-template-columns:220px minmax(0,1fr); } .dc-sidebar-r { display:none; } }
        @media (max-width:720px)  { .dc-body { grid-template-columns:1fr; padding:0 16px; } .dc-sidebar-l { display:none; } }

        /* ── Left sidebar ── */
        .dc-sidebar-l { padding:28px 0; }
        .dc-sidebar-l-inner { position:sticky; top:82px; max-height:calc(100vh - 100px); overflow-y:auto; padding-right:8px; }
        .dc-sidebar-l-inner::-webkit-scrollbar { width:2px; }
        .dc-sidebar-l-inner::-webkit-scrollbar-thumb { background:var(--hairline-strong); border-radius:2px; }
        .dc-nav-group { margin-bottom:20px; }
        .dc-nav-group-label { font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-4); padding:0 10px; margin:0 0 4px; }
        .dc-nav-item {
          width:100%; text-align:left; display:block;
          padding:7px 10px; border-radius:8px;
          font-size:13px; font-weight:500; color:var(--ink-3);
          background:transparent; border:0.5px solid transparent;
          cursor:pointer; transition:all 0.13s; margin-bottom:1px;
        }
        .dc-nav-item:hover { color:var(--ink); background:var(--glass-bg-soft); }
        .dc-nav-item.is-active {
          color:var(--vp-sky-deep); background:rgba(0,179,255,0.08);
          border-color:rgba(0,179,255,0.2);
        }
        [data-theme='dark'] .dc-nav-item.is-active { color:var(--vp-sky-2); }

        /* ── Main content ── */
        .dc-main { padding:36px 40px 0; max-width:740px; }
        @media (max-width:720px) { .dc-main { padding:24px 0 0; } }

        /* Section head */
        .dc-section-head { margin-top:64px; margin-bottom:4px; padding-top:24px; scroll-margin-top:80px; }
        .dc-section-head:first-child { margin-top:0; padding-top:0; }
        .dc-tag { display:inline-block; font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--vp-sky-deep); margin-bottom:10px; }
        [data-theme='dark'] .dc-tag { color:var(--vp-sky-2); }
        .dc-sh { font-size:28px; font-weight:600; letter-spacing:-0.025em; color:var(--ink); margin:0 0 16px; line-height:1.2; }
        .dc-h3 { font-size:16px; font-weight:600; color:var(--ink); margin:32px 0 10px; letter-spacing:-0.015em; scroll-margin-top:80px; }
        .dc-p { font-size:14px; color:var(--ink-2); line-height:1.75; margin:0 0 14px; }
        .dc-link { color:var(--vp-sky-deep); text-decoration:underline; text-decoration-color:rgba(0,128,255,0.4); }
        .dc-link:hover { text-decoration-color:var(--vp-sky-deep); }
        [data-theme='dark'] .dc-link { color:var(--vp-sky-2); }
        .dc-ul { margin:0 0 16px; padding:0; list-style:none; display:flex; flex-direction:column; gap:7px; }
        .dc-ul li { font-size:14px; color:var(--ink-2); line-height:1.65; display:flex; gap:8px; }
        .dc-ul li::before { content:'·'; color:var(--vp-sky); font-size:16px; line-height:1.4; flex-shrink:0; }
        .dc-steps { list-style:none; padding:0; margin:0 0 20px; display:flex; flex-direction:column; gap:10px; }
        .dc-steps li { display:flex; gap:12px; align-items:flex-start; font-size:14px; color:var(--ink-2); line-height:1.65; }
        .dc-step-num { width:22px; height:22px; border-radius:6px; background:rgba(0,179,255,0.1); border:0.5px solid rgba(0,179,255,0.25); color:var(--vp-sky-deep); font-size:11px; font-weight:700; display:flex; align-items:center; justify-content:center; flex-shrink:0; margin-top:1px; }
        .dc-step-body { flex:1; }

        /* Inline code */
        .dc-ic { background:var(--glass-bg-strong); border:0.5px solid var(--hairline-strong); border-radius:5px; padding:1.5px 5px; font-size:12px; font-family:var(--font-mono); color:var(--vp-sky-deep); }
        [data-theme='dark'] .dc-ic { color:var(--vp-sky-2); }

        /* Code block */
        .dc-code { margin:16px 0; border-radius:var(--radius-md); overflow:hidden; border:0.5px solid rgba(255,255,255,0.08); box-shadow:0 4px 20px -4px rgba(0,0,0,0.3); }
        .dc-code-bar { display:flex; align-items:center; gap:8px; padding:8px 14px; background:rgba(15,20,35,0.95); border-bottom:1px solid rgba(255,255,255,0.06); }
        .dc-dots { display:flex; gap:5px; }
        .dc-dots span { width:10px; height:10px; border-radius:50%; }
        .dc-dots span:nth-child(1) { background:#FF5F57; }
        .dc-dots span:nth-child(2) { background:#FFBD2E; }
        .dc-dots span:nth-child(3) { background:#28CA42; }
        .dc-lang { margin-left:4px; font-size:10px; font-family:var(--font-mono); color:rgba(255,255,255,0.3); flex:1; }
        .dc-copy { padding:4px; border-radius:5px; background:rgba(255,255,255,0.06); border:0.5px solid rgba(255,255,255,0.1); color:rgba(255,255,255,0.4); cursor:pointer; transition:background 0.15s, color 0.15s; display:flex; align-items:center; }
        .dc-copy:hover { background:rgba(255,255,255,0.12); color:rgba(255,255,255,0.8); }
        .dc-pre { margin:0; padding:18px; background:rgba(8,12,26,0.97); overflow-x:auto; }
        .dc-pre code { font-size:12.5px; font-family:var(--font-mono); color:#a8d8a8; line-height:1.7; white-space:pre; }

        /* Callouts */
        .dc-callout { margin:16px 0; display:flex; gap:10px; padding:12px 16px; border-radius:var(--radius-sm); }
        .dc-callout p { font-size:13px; color:var(--ink-2); line-height:1.6; margin:0; }
        .dc-info { background:rgba(0,179,255,0.06); border:0.5px solid rgba(0,179,255,0.22); }
        .dc-info > span { color:var(--vp-sky-deep); flex-shrink:0; font-size:14px; }
        .dc-warn { background:rgba(245,158,11,0.06); border:0.5px solid rgba(245,158,11,0.22); color:#d97706; }
        .dc-warn p { color:var(--ink-2); }

        /* Table */
        .dc-table-wrap { overflow-x:auto; margin:16px 0; border-radius:var(--radius-md); border:0.5px solid var(--hairline-strong); }
        .dc-table { width:100%; border-collapse:collapse; font-size:13px; }
        .dc-table th { text-align:left; padding:10px 14px; font-size:10.5px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; color:var(--ink-4); background:var(--glass-bg); border-bottom:1px solid var(--hairline-strong); }
        .dc-table td { padding:10px 14px; border-bottom:1px solid var(--hairline); color:var(--ink-2); vertical-align:middle; }
        .dc-table tr:last-child td { border-bottom:none; }
        .dc-table tr:hover td { background:var(--glass-bg-soft); }

        /* Concept grid */
        .dc-concept-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:16px 0 20px; }
        @media (max-width:560px) { .dc-concept-grid { grid-template-columns:1fr; } }
        .dc-concept-card { padding:16px; }

        /* ── Right TOC ── */
        .dc-sidebar-r { padding:28px 0 28px 20px; }
        .dc-sidebar-r-inner { position:sticky; top:82px; max-height:calc(100vh - 100px); overflow-y:auto; }
        .dc-sidebar-r-inner::-webkit-scrollbar { width:2px; }
        .dc-sidebar-r-inner::-webkit-scrollbar-thumb { background:var(--hairline-strong); border-radius:2px; }
        .dc-toc-label { font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-4); margin:0 0 10px; display:flex; align-items:center; gap:6px; }
        .dc-toc-label::before { content:'≡'; font-size:12px; }
        .dc-toc-group { margin-bottom:14px; }
        .dc-toc-group-label { font-size:9.5px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:var(--ink-4); opacity:0.6; margin:0 0 3px 8px; }
        .dc-toc-item {
          width:100%; text-align:left; display:block;
          padding:5px 8px; border-radius:6px; border-left:1.5px solid transparent;
          font-size:12px; color:var(--ink-4); background:none; cursor:pointer;
          transition:all 0.12s; margin-bottom:1px;
        }
        .dc-toc-item:hover { color:var(--ink-2); }
        .dc-toc-item.is-active { color:var(--vp-sky-deep); border-left-color:var(--vp-sky); background:rgba(0,179,255,0.06); }
        [data-theme='dark'] .dc-toc-item.is-active { color:var(--vp-sky-2); }

        /* ── Footer ── */
        .dc-footer { border-top:1px solid var(--hairline); padding:20px 0; margin-top:0; position:relative; z-index:1; }
        .dc-footer-inner { max-width:1400px; margin:0 auto; padding:0 24px; display:flex; align-items:center; justify-content:space-between; font-size:12px; color:var(--ink-4); }
        .dc-footer-inner a { color:var(--ink-4); transition:color 0.15s; }
        .dc-footer-inner a:hover { color:var(--ink-2); }
      `}</style>
    </div>
  );
}
