"use client";

import { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Shield, Link2, Lock, Zap, Code, Copy, Check, ChevronRight,
  BookOpen, Terminal, Package, Cpu, Key, ExternalLink,
} from "lucide-react";
import { VeilPayLogo } from "@/components/VeilPayLogo";

// ── Copy button ──────────────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);
  return (
    <button
      onClick={copy}
      className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors text-white/60 hover:text-white"
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// ── Code block ───────────────────────────────────────────────────────────────
function CodeBlock({ code, lang = "bash" }: { code: string; lang?: string }) {
  return (
    <div className="relative group rounded-xl overflow-hidden my-4">
      <div className="bg-gray-900 px-4 pt-9 pb-4 overflow-x-auto">
        <div className="absolute top-0 left-0 right-0 h-7 bg-gray-800 flex items-center px-4 gap-1.5">
          {["#FF5F57","#FFBD2E","#28CA42"].map((c) => (
            <div key={c} className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
          ))}
          <span className="ml-2 text-[10px] text-white/30 font-mono">{lang}</span>
        </div>
        <pre className="text-sm text-green-300 font-mono leading-relaxed whitespace-pre-wrap break-all">{code}</pre>
      </div>
      <CopyButton text={code} />
    </div>
  );
}

// ── Inline code ──────────────────────────────────────────────────────────────
function IC({ children }: { children: React.ReactNode }) {
  return (
    <code style={{ background: "var(--glass-bg-strong)", border: "0.5px solid var(--hairline)", borderRadius: 6, padding: "2px 6px", fontSize: 12, fontFamily: "var(--font-mono)", color: "var(--vp-sky-deep)" }}>
      {children}
    </code>
  );
}

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} style={{ fontSize: 20, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.02em", marginTop: 40, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, scrollMarginTop: 96 }}>
      <span style={{ width: 4, height: 20, borderRadius: 2, background: "var(--vp-sky)", flexShrink: 0 }} />
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)", marginTop: 24, marginBottom: 8 }}>{children}</h3>;
}

function P({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 14, color: "var(--ink-2)", lineHeight: 1.7, marginBottom: 12 }}>{children}</p>;
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: "16px 0", display: "flex", gap: 12, background: "rgba(0,179,255,0.06)", border: "0.5px solid rgba(0,179,255,0.2)", borderRadius: 12, padding: "12px 16px" }}>
      <span style={{ color: "var(--vp-sky)", flexShrink: 0 }}>ℹ</span>
      <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  );
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ margin: "16px 0", display: "flex", gap: 12, background: "rgba(245,158,11,0.06)", border: "0.5px solid rgba(245,158,11,0.2)", borderRadius: 12, padding: "12px 16px" }}>
      <span style={{ color: "#d97706", flexShrink: 0 }}>⚠</span>
      <p style={{ fontSize: 12.5, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>{children}</p>
    </div>
  );
}

// ── Nav items ─────────────────────────────────────────────────────────────────
const NAV = [
  { id: "intro",            label: "Introduction",           icon: <BookOpen className="w-3.5 h-3.5" /> },
  { id: "private-links",    label: "Private Payment Links",  icon: <Link2 className="w-3.5 h-3.5" /> },
  { id: "confidential",     label: "Confidential Transfers", icon: <Lock className="w-3.5 h-3.5" /> },
  { id: "x402",             label: "Private x402 Payments",  icon: <Zap className="w-3.5 h-3.5" /> },
  { id: "sdk",              label: "@veilpay/x402-sdk",       icon: <Package className="w-3.5 h-3.5" /> },
  { id: "skill",            label: "VeilPay Skill (AI Agent)",icon: <Cpu className="w-3.5 h-3.5" /> },
  { id: "security",         label: "Security Model",         icon: <Key className="w-3.5 h-3.5" /> },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("intro");

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg)", color: "var(--ink)" }}>
      {/* Top bar */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, borderBottom: "1px solid var(--hairline)", background: "var(--glass-bg)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "0 24px", height: 52, display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/" style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <VeilPayLogo size="xs" />
            <span style={{ fontWeight: 600, fontSize: 14, letterSpacing: "-0.02em", color: "var(--ink)" }}>VeilPay</span>
          </a>
          <ChevronRight style={{ width: 14, height: 14, color: "var(--ink-4)", flexShrink: 0 }} />
          <span style={{ fontSize: 13, color: "var(--ink-3)", fontWeight: 500 }}>Docs</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <a href="/create" style={{ fontSize: 12, color: "var(--vp-sky-deep)", fontWeight: 500, display: "flex", alignItems: "center", gap: 4 }}>
              Open App <ExternalLink style={{ width: 11, height: 11 }} />
            </a>
          </div>
        </div>
      </nav>

      <div style={{ maxWidth: 1200, margin: "0 auto", width: "100%", display: "flex", flex: 1, padding: "0 24px", paddingTop: 32, paddingBottom: 32, gap: 32 }}>
        {/* Sidebar */}
        <aside style={{ display: "none", flexDirection: "column", width: 208, flexShrink: 0 }} className="hidden md:flex">
          <div style={{ position: "sticky", top: 96, display: "flex", flexDirection: "column", gap: 2 }}>
            <p style={{ fontSize: 10, color: "var(--ink-4)", textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 600, padding: "0 12px 8px" }}>Contents</p>
            {NAV.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                onClick={() => setActiveSection(item.id)}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "8px 12px",
                  borderRadius: 10, fontSize: 12.5, fontWeight: 500, transition: "all 0.15s",
                  color: activeSection === item.id ? "var(--vp-sky-deep)" : "var(--ink-3)",
                  background: activeSection === item.id ? "rgba(0,179,255,0.08)" : "transparent",
                  border: activeSection === item.id ? "0.5px solid rgba(0,179,255,0.2)" : "0.5px solid transparent",
                }}
              >
                {item.icon}
                {item.label}
              </a>
            ))}
          </div>
        </aside>

        {/* Content */}
        <main style={{ flex: 1, minWidth: 0, maxWidth: 720 }}>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>

            {/* ─── Introduction ──────────────────────────────────────────────── */}
            <H2 id="intro">Introduction</H2>
            <P>
              <strong>VeilPay</strong> is a private payments application built on the{" "}
              <a href="https://umbraprivacy.com" className="text-[#00b3ff] hover:underline" target="_blank" rel="noopener noreferrer">Umbra Protocol</a>{" "}
              on Solana. It lets users send and receive cryptocurrency with zero on-chain link between sender and recipient, using Groth16 ZK proofs and Arcium MPC encryption.
            </P>
            <P>
              VeilPay exposes three payment primitives:
            </P>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Private Payment Links", "Shareable URLs that encode an ephemeral claim key. Sender and recipient are both anonymous."],
                ["Confidential Transfers", "Direct encrypted deposits to a known recipient's Umbra balance. Amount is hidden; recipient address is known."],
                ["Private x402 Payments", "HTTP 402 payment flow using Umbra stealth deposits. Enables private pay-per-request API access."],
              ].map(([title, desc]) => (
                <li key={title} style={{ display: "flex", gap: 8, fontSize: 14, color: "var(--ink-2)" }}>
                  <span style={{ color: "var(--vp-sky)", flexShrink: 0, marginTop: 1 }}>→</span>
                  <span><strong style={{ color: "var(--ink)" }}>{title}</strong> — {desc}</span>
                </li>
              ))}
            </ul>
            <Note>All networks: devnet for development, mainnet for production. Set <IC>NEXT_PUBLIC_NETWORK=mainnet</IC> in your environment to switch.</Note>

            {/* ─── Private Payment Links ─────────────────────────────────────── */}
            <H2 id="private-links">Private Payment Links</H2>
            <P>
              Private links let any sender create a one-time claimable payment that lives in the Umbra shielded pool. No recipient wallet is needed at creation time — you share the link and they claim it later.
            </P>

            <H3>How it works</H3>
            <ol style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                "A fresh ephemeral Ed25519 keypair is generated in the browser.",
                "A small SOL buffer is sent to the ephemeral address to cover Umbra registration rent.",
                "The ephemeral address is registered with the Umbra program (X25519 keys, one ZK proof transaction).",
                "The sender creates a receiver-claimable UTXO in Umbra's indexed Merkle tree, addressed to the ephemeral key.",
                "The ephemeral private key and token type are encoded into the URL hash: /claim?lid=…&exp=…#<bs58Key>:<TOKEN>",
                "The hash never reaches the server — it lives only in the browser.",
              ].map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#00b3ff] font-bold shrink-0">{i + 1}.</span>
                  {s}
                </li>
              ))}
            </ol>

            <H3>Creating a link (UI)</H3>
            <P>Navigate to <IC>/create</IC>, connect your wallet, select <strong>Private Link</strong>, choose an amount and token, then click <strong>Create Private Link</strong>. The flow takes 20–90 seconds depending on ZK proof generation time.</P>

            <H3>Claiming a link</H3>
            <P>Open the link URL. VeilPay parses the ephemeral key from the hash, scans the Umbra pool for the matching UTXO, and presents a <strong>Claim</strong> button. On click:</P>
            <ol style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "UTXO is claimed into the ephemeral encrypted balance (relayer pays fees).",
                "Encrypted balance is withdrawn to the recipient's public ATA.",
                "Link is marked claimed in the database.",
              ].map((s, i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#00b3ff] font-bold shrink-0">{i + 1}.</span>
                  {s}
                </li>
              ))}
            </ol>

            <H3>Wallet-locked links</H3>
            <P>
              Optionally enter a recipient wallet address when creating. The claim page will verify via <IC>signMessage</IC> that the claiming wallet matches — adding an extra security layer for high-value transfers.
            </P>

            <H3>Supported tokens</H3>
            <div className="grid grid-cols-3 gap-2 my-4">
              {[
                ["SOL", "Native Solana"],
                ["USDC", "USD Coin"],
                ["USDT", "Tether"],
                ["BONK", "Bonk"],
                ["JUP", "Jupiter"],
                ["WIF", "dogwifhat"],
              ].map(([sym, name]) => (
                <div key={sym} className="bg-black/[0.03] border border-black/[0.07] rounded-xl px-3 py-2 text-center">
                  <p className="text-xs font-bold text-gray-900">{sym}</p>
                  <p className="text-[10px] text-black/35">{name}</p>
                </div>
              ))}
            </div>
            <Note>On devnet, only SOL is natively tradeable. All other tokens use mainnet mint addresses and require mainnet for actual transfers.</Note>

            {/* ─── Confidential Transfers ────────────────────────────────────── */}
            <H2 id="confidential">Confidential Transfers</H2>
            <P>
              Confidential transfers move tokens directly from your public wallet into the recipient&apos;s Umbra encrypted balance. The amount is encrypted on-chain via Arcium MPC; only the sender/recipient relationship is visible (the transaction shows your address and the recipient&apos;s Umbra PDA).
            </P>

            <H3>When to use</H3>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "You know the recipient's Solana address and they have a VeilPay account.",
                "You want to hide the transfer amount but don't need full anonymity.",
                "Simpler UX: no link generated, no claim step — funds arrive instantly.",
              ].map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-[#00b3ff] shrink-0">•</span>{s}</li>
              ))}
            </ul>

            <H3>How it works</H3>
            <P>
              VeilPay calls <IC>getPublicBalanceToEncryptedBalanceDirectDepositorFunction</IC> from the Umbra SDK with the recipient's address. The Umbra program triggers an Arcium MPC computation that encrypts the token amount into the recipient&apos;s <IC>EncryptedTokenAccount</IC> PDA.
            </P>
            <Warn>Recipient must have connected to VeilPay at least once so their Umbra account PDAs are initialised on-chain. The transfer will fail otherwise.</Warn>

            {/* ─── x402 Payments ─────────────────────────────────────────────── */}
            <H2 id="x402">Private x402 Payments</H2>
            <P>
              The <a href="https://x402.org" className="text-[#00b3ff] hover:underline" target="_blank" rel="noopener noreferrer">x402 protocol</a> extends HTTP with a <IC>402 Payment Required</IC> response that carries machine-readable payment instructions. VeilPay implements x402 using Umbra stealth deposits — so the payment is not just metered but also private.
            </P>

            <H3>Protocol flow</H3>
            <ol style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Client requests", "Client sends GET/POST to a protected endpoint."],
                ["Server responds 402", "Server replies with an invoice: amount, token, destination address, and a 32-byte invoiceId."],
                ["Client deposits", "Client makes an Umbra stealth deposit to the server's Umbra address, embedding the invoiceId in the proof instruction's optional-data field."],
                ["Client presents proof", "Client sends Authorization: x402 <proofTxSig>:<depositTxSig>:<invoiceIdHex>."],
                ["Server verifies", "Server decrypts the proof instruction payload via ECDH + Keccak-256 + AES-256-GCM, checks amount ≥ expected, destination = server address, invoiceId = issued invoice. Records deposit sig to prevent replay."],
                ["Server responds 200", "Content or API response is returned."],
              ].map(([title, desc], i) => (
                <li key={i} className="flex gap-2">
                  <span className="text-[#00b3ff] font-bold shrink-0">{i + 1}.</span>
                  <span><strong className="text-gray-800">{title}</strong> — {desc}</span>
                </li>
              ))}
            </ol>

            <H3>Authorization header format</H3>
            <CodeBlock lang="http" code={`Authorization: x402 <proofTxSignature>:<depositTxSignature>:<invoiceIdHex>`} />

            <H3>Invoice payload</H3>
            <CodeBlock lang="json" code={`{
  "error": "Payment Required",
  "invoice": {
    "amount": 0.1,
    "token": "SOL",
    "destination": "<server_solana_address>",
    "invoiceId": "<32_byte_hex>"
  }
}`} />

            <H3>Proof instruction AES payload layout</H3>
            <P>The Umbra proof instruction embeds an AES-256-GCM encrypted payload. After ECDH key exchange, the plaintext has this layout:</P>
            <CodeBlock lang="text" code={`Bytes  0–7  : amount (little-endian U64)
Bytes  8–39 : destination address (32 bytes)
Bytes 40–55 : generation index (16 bytes)
Bytes 56–67 : domain separator (12 bytes)`} />

            {/* ─── SDK ───────────────────────────────────────────────────────── */}
            <H2 id="sdk">@veilpay/x402-sdk</H2>
            <P>
              The <IC>@veilpay/x402-sdk</IC> package gives any Node.js server (Next.js, Express, etc.) a drop-in integration for accepting private x402 payments verified via the Umbra protocol.
            </P>

            <H3>Installation</H3>
            <CodeBlock lang="bash" code={`npm install @veilpay/x402-sdk

# Peer dependencies (install whichever you don't have)
npm install @solana/web3.js @umbra-privacy/sdk @umbra-privacy/umbra-codama @noble/curves @noble/hashes bs58`} />

            <H3>Server setup — Next.js App Router</H3>
            <CodeBlock lang="typescript" code={`// app/api/premium/route.ts
import { createX402 } from "@veilpay/x402-sdk";
import { Connection } from "@solana/web3.js";

const x402 = createX402({
  network: "mainnet",          // or "devnet"
  connection: new Connection("https://api.mainnet-beta.solana.com"),
  serverPrivateKeyBase58: process.env.X402_SERVER_PRIVATE_KEY!,
  serverSolanaAddress: process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS!,
});

// Protect a Next.js route handler
export const GET = x402.nextjs(
  { amount: 0.1, token: "SOL" },
  async (req) => {
    return Response.json({ data: "premium content" });
  }
);`} />

            <H3>Server setup — Express</H3>
            <CodeBlock lang="typescript" code={`import express from "express";
import { createX402 } from "@veilpay/x402-sdk";
import { Connection } from "@solana/web3.js";

const x402 = createX402({
  network: "mainnet",
  connection: new Connection(process.env.RPC_URL!),
  serverPrivateKeyBase58: process.env.X402_SERVER_PRIVATE_KEY!,
  serverSolanaAddress: process.env.SERVER_ADDRESS!,
});

const app = express();
app.get(
  "/premium",
  x402.express({ amount: 0.1, token: "SOL" }),
  (req, res) => res.json({ data: "premium content" })
);`} />

            <H3>Client — making a payment</H3>
            <CodeBlock lang="typescript" code={`import { x402Fetch } from "@veilpay/x402-sdk";

// x402Fetch wraps the native fetch API.
// On a 402 response it automatically creates an Umbra stealth deposit,
// then retries the request with the Authorization header.
const response = await x402Fetch("https://yourapp.com/api/premium", {
  wallet,      // Wallet Standard wallet object
  account,     // WalletAccount
  network: "mainnet",
});

const data = await response.json();`} />

            <H3>Manual verification</H3>
            <CodeBlock lang="typescript" code={`import { createX402, MemoryReplayStore } from "@veilpay/x402-sdk";

const x402 = createX402({
  network: "mainnet",
  connection,
  serverPrivateKeyBase58: process.env.X402_SERVER_PRIVATE_KEY!,
  serverSolanaAddress: process.env.SERVER_ADDRESS!,
  replayStore: new MemoryReplayStore(), // swap for Redis/Postgres in production
});

// Parse the Authorization header
const payment = x402.parseAuthHeader(req.headers.get("Authorization"));
if (!payment) return new Response("Missing payment", { status: 402 });

// Verify on-chain
const outcome = await x402.verify(payment, 0.1, "SOL");
if (!outcome.valid) return new Response(outcome.reason, { status: 403 });

// All good — serve the resource`} />

            <H3>Replay protection</H3>
            <P>
              The SDK includes a <IC>ReplayStore</IC> interface. The default <IC>MemoryReplayStore</IC> works for single-instance servers. For distributed deployments, implement the interface with Redis or Postgres:
            </P>
            <CodeBlock lang="typescript" code={`import type { ReplayStore } from "@veilpay/x402-sdk";
import { Redis } from "ioredis";

class RedisReplayStore implements ReplayStore {
  constructor(private redis: Redis) {}

  async has(depositSig: string): Promise<boolean> {
    return (await this.redis.exists(\`x402:seen:\${depositSig}\`)) === 1;
  }

  async add(depositSig: string): Promise<void> {
    // Store with 30-day TTL
    await this.redis.setex(\`x402:seen:\${depositSig}\`, 60 * 60 * 24 * 30, "1");
  }
}`} />

            <H3>API reference</H3>
            <div className="overflow-x-auto my-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-black/[0.04] border-b border-black/[0.08]">
                    {["Function", "Description"].map((h) => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["createX402(config)", "Factory. Returns an X402Instance configured for your server."],
                    ["x402.generateInvoice(amount, token)", "Returns a fresh {invoiceId, invoiceIdHex} pair. Server-issued only."],
                    ["x402.verify(payment, amount, token)", "Fully verifies an x402 payment on-chain. Returns {valid, reason}."],
                    ["x402.parseAuthHeader(header)", "Parses Authorization: x402 … into an X402Payment object or null."],
                    ["x402.nextjs(opts, handler)", "Wraps a Next.js App Router handler with x402 protection."],
                    ["x402.express(opts)", "Returns an Express middleware that enforces x402 payment."],
                    ["x402.handle(req, opts, handler)", "Framework-agnostic: works with any fetch-compatible Request."],
                    ["x402Fetch(url, opts)", "Client helper — auto-pays 402 responses via Umbra deposit."],
                    ["new MemoryReplayStore()", "In-memory replay protection (single instance only)."],
                  ].map(([fn, desc]) => (
                    <tr key={fn} className="border-b border-black/[0.05] hover:bg-black/[0.02]">
                      <td className="px-3 py-2 font-mono text-[11px] text-gray-800">{fn}</td>
                      <td className="px-3 py-2 text-black/50">{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ─── VeilPay Skill ─────────────────────────────────────────────── */}
            <H2 id="skill">VeilPay Agent Skill</H2>
            <P>
              The VeilPay agent skill lets any AI agent make and receive private payments on Solana — fully autonomously, with no browser or wallet popup. The agent signs transactions directly with its own keypair. All operations run in Node.js, including ZK proof generation.
            </P>

            <H3>Install</H3>
            <CodeBlock lang="bash" code={`npx skills add Bmzennn/agent-skills@veilpay`} />

            <H3>Capabilities</H3>
            <div style={{ overflowX: "auto", margin: "16px 0" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--hairline-strong)" }}>
                    {["Script", "What it does"].map((h) => (
                      <th key={h} style={{ textAlign: "left", padding: "8px 12px", color: "var(--ink-3)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.06em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["wallet.cjs create", "Generate a persistent agent Solana keypair"],
                    ["create-link.cjs", "Deposit to pool, return a shareable claim URL"],
                    ["claim-link.cjs", "Paste a link → funds arrive in the agent's wallet"],
                    ["check-link.cjs", "pending / claimed / delivered / not_found"],
                    ["balance.cjs", "Query encrypted shielded balance"],
                  ].map(([script, desc]) => (
                    <tr key={script} style={{ borderBottom: "1px solid var(--hairline)" }}>
                      <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--vp-sky-deep)" }}>{script}</td>
                      <td style={{ padding: "10px 12px", color: "var(--ink-2)" }}>{desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <H3>1. Agent setup</H3>
            <CodeBlock lang="bash" code={`# Create a persistent agent wallet (saved to ~/.veilpay/wallet.json)
node scripts/wallet.cjs create

# Fund it with SOL for fees (devnet)
node scripts/wallet.cjs airdrop

# Check balance
node scripts/wallet.cjs balance`} />

            <H3>2. Create a private payment link</H3>
            <P>The agent generates an ephemeral keypair, funds it, runs two ZK registration proofs, deposits funds into the Umbra pool, and returns a claim URL — all without any user interaction.</P>
            <CodeBlock lang="bash" code={`node scripts/create-link.cjs \\
  --amount 1.5 \\
  --token SOL \\
  --network devnet \\
  --memo "Payment for task #42"`} />
            <CodeBlock lang="text" code={`[1/4] Generating ephemeral keypair…
[2/4] Funding ephemeral for registration fees…
[3/4] Registering privacy channels (ZK proofs)…
[4/4] Depositing into shielded pool…

✅ Private link created!
   Link:    https://www.veilpayments.xyz/claim?lid=...#<secret>:SOL:Payment%20for%20task%20%2342
   Amount:  1.5 SOL
   Expires: 2026-05-03`} />
            <Note>Link creation requires ~0.02 SOL extra for the ephemeral registration buffer. This SOL is recovered by the recipient when they claim.</Note>

            <H3>3. Claim a payment link</H3>
            <P>An agent that receives a VeilPay link can claim it directly to its own wallet — no browser, no human approval. The full Groth16 ZK proof is generated locally in Node.js.</P>
            <CodeBlock lang="bash" code={`node scripts/claim-link.cjs \\
  --link "https://www.veilpayments.xyz/claim?lid=...#<secret>:SOL" \\
  --network devnet`} />
            <CodeBlock lang="text" code={`[1/5] Scanning shielded pool…
      Found: 1.5 SOL
[2/5] Generating ZK proof (this takes 20–60s)…
      Downloading claimreceiverclaimableutxo.zkey (cached after first run)… done
[3/5] Waiting for on-chain ZK verification…
      Verified ✓
[4/5] Preparing token account…
[5/5] Withdrawing to your wallet…

✅ Claimed successfully!
   Amount:    1.5 SOL
   Delivered: 7xKt...9mPq`} />
            <Note>ZK circuit files (~100MB) are downloaded on first claim and cached in <IC>~/.veilpay/zk-cache/</IC>. Subsequent claims use the cache and take seconds less.</Note>

            <H3>4. Check link status</H3>
            <CodeBlock lang="bash" code={`node scripts/check-link.cjs \\
  --link "https://www.veilpayments.xyz/claim?lid=...#<secret>:SOL"`} />
            <CodeBlock lang="text" code={`Status: pending     # funds in pool, not yet claimed
Status: claimed     # ZK proof accepted, sweep in progress
Status: delivered   # funds in recipient's wallet
Status: not_found   # expired or already swept`} />

            <H3>5. Check encrypted balance</H3>
            <P>If the agent received a confidential transfer (direct send), the balance waits in its encrypted Umbra account:</P>
            <CodeBlock lang="bash" code={`node scripts/balance.cjs --network devnet`} />
            <CodeBlock lang="text" code={`Encrypted balances for 7xKt...9mPq on devnet:
  USDC   42.00  ← withdraw with: node withdraw.cjs --token USDC`} />

            <H3>Environment variables</H3>
            <CodeBlock lang="bash" code={`VEILPAY_NETWORK=devnet           # devnet or mainnet
VEILPAY_RPC_URL=https://...      # optional custom RPC
VEILPAY_WALLET_PATH=~/.veilpay/wallet.json`} />

            <H3>How it works — no browser required</H3>
            <P>
              The browser version of VeilPay uses Phantom to sign transactions because browsers cannot safely hold raw private keys. An agent has no such constraint — it loads its keypair from <IC>~/.veilpay/wallet.json</IC> and uses <IC>createSignerFromPrivateKeyBytes</IC> from the Umbra SDK directly. The ZK prover (<IC>@umbra-privacy/web-zk-prover</IC>) runs in Node.js with circuit files stored locally, producing identical proofs to the browser version.
            </P>
            <Warn>The agent wallet private key is stored unencrypted at <IC>~/.veilpay/wallet.json</IC>. Restrict file permissions (<IC>chmod 600</IC>) and never commit it to version control.</Warn>

            {/* ─── Security Model ─────────────────────────────────────────────── */}
            <H2 id="security">Security Model</H2>

            <H3>Privacy guarantees</H3>
            <div className="overflow-x-auto my-4">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-black/[0.04] border-b border-black/[0.08]">
                    {["Feature", "Sender visible?", "Recipient visible?", "Amount visible?"].map((h) => <th key={h} className="text-left px-3 py-2 font-semibold text-gray-700">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Private Link", "No", "No", "No"],
                    ["Confidential Transfer", "Yes", "Yes (PDA)", "No"],
                    ["x402 Payment", "Partially", "Server only", "No"],
                  ].map(([f, s, r, a]) => (
                    <tr key={f} className="border-b border-black/[0.05]">
                      <td className="px-3 py-2 font-medium text-gray-800">{f}</td>
                      <td className={`px-3 py-2 ${s === "No" ? "text-emerald-600" : "text-amber-600"}`}>{s}</td>
                      <td className={`px-3 py-2 ${r === "No" ? "text-emerald-600" : "text-amber-600"}`}>{r}</td>
                      <td className={`px-3 py-2 ${a === "No" ? "text-emerald-600" : "text-amber-600"}`}>{a}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <H3>Claim note security</H3>
            <P>The ephemeral private key (claim note) lives only in the URL hash. The hash is never sent to the server by the browser. VeilPay clears it from the URL via <IC>window.history.replaceState</IC> synchronously on page load (<IC>useLayoutEffect</IC>, before first paint), minimising the window in which browser extensions could observe it.</P>

            <H3>Client-side link protection</H3>
            <P>
              Because the claim key is displayed in the browser, VeilPay implements three runtime protections on the link display:
            </P>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {[
                ["Blur by default", "The URL hash (claim key) is blurred until the user explicitly clicks Reveal. The public domain and path are always visible; only the secret fragment is hidden."],
                ["Auto-hide on focus loss", "If the browser window loses focus while the key is revealed — switching tabs, alt-tab, or a remote desktop session grabbing the screen — the key is immediately re-blurred. This limits exposure from screen-share observers."],
                ["15-second reveal timer", "The key automatically re-blurs 15 seconds after reveal, with a live countdown. Users must re-click to reveal again."],
              ].map(([title, desc]) => (
                <li key={title as string} className="flex gap-2">
                  <span className="text-[#00b3ff] shrink-0 mt-0.5">→</span>
                  <span><strong className="text-gray-800">{title}</strong> — {desc}</span>
                </li>
              ))}
            </ul>

            <H3>Clipboard hijack detection</H3>
            <P>
              Malicious browser extensions sometimes monkey-patch <IC>navigator.clipboard.writeText</IC> to silently replace copied wallet addresses or payment links. VeilPay detects this at page load by calling <IC>Function.prototype.toString</IC> on the clipboard method — extensions that override the method typically do not also spoof the prototype&apos;s <IC>toString</IC>, so the absence of &quot;native code&quot; in the output reveals tampering.
            </P>
            <P>
              If tampering is detected, the Copy button is disabled and an amber warning is shown. The Share button (using the OS-level Web Share API, which extensions cannot intercept) remains available as a safe alternative.
            </P>
            <Warn>
              VeilPay cannot detect OS-level clipboard hijackers (malware running outside the browser). Always verify the destination address in your wallet before confirming any transaction.
            </Warn>

            <H3>Remote access and screen sharing</H3>
            <P>
              Browsers run in a sandbox with no access to OS-level state. VeilPay cannot reliably detect remote desktop software (TeamViewer, AnyDesk, RDP) or screen recording apps — these operate below the browser layer. The focus-loss re-blur is the strongest available browser-side mitigation: it re-hides the claim key the moment the window is no longer in the foreground.
            </P>
            <P>
              For high-value transfers, follow these environment recommendations before revealing a claim key:
            </P>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px", display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                "Use a private browser window with extensions disabled.",
                "Confirm no screen sharing or remote desktop session is active.",
                "Do not open the link on a shared or public computer.",
                "If you must use a shared device, copy the link and open it only on your personal device.",
              ].map((s, i) => (
                <li key={i} className="flex gap-2"><span className="text-[#00b3ff] shrink-0">•</span>{s}</li>
              ))}
            </ul>

            <H3>x402 replay protection</H3>
            <P>Each 402 invoice is registered server-side with a 10-minute TTL. The Authorization header must include an invoiceId that was actually issued by the server. Deposit transaction signatures are stored after successful verification — presenting the same deposit signature a second time returns 403 immediately.</P>

            <H3>Supabase RLS</H3>
            <P>Link metadata (non-sensitive: id, amount, token, expiry, claimed) is stored in Supabase with Row Level Security enabled. The database stores no private keys, no claim notes, and no transaction signatures that could compromise user funds.</P>

            <Warn>VeilPay is non-custodial. Private keys never leave your browser. All transaction signing is performed by your wallet adapter (Phantom, Solflare, etc.).</Warn>

          </motion.div>
        </main>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--hairline)", padding: "24px", marginTop: 32 }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 12, color: "var(--ink-4)" }}>
          <span>VeilPay Docs</span>
          <div style={{ display: "flex", gap: 16 }}>
            <a href="/" style={{ color: "var(--ink-4)" }}>Home</a>
            <a href="/create" style={{ color: "var(--ink-4)" }}>App</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
