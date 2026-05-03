# VeilPay — Private Payments on Solana

Send and receive funds with zero on-chain link between sender and recipient. Built on the [Umbra Privacy SDK](https://umbraprivacy.com) using Groth16 ZK proofs and Arcium MPC.

## What it does

**Private links** — Sender generates a shareable URL. Recipient opens it and claims funds. The ZK proof breaks any cryptographic link between the deposit and the withdrawal on-chain.

**Confidential direct transfers** — Send directly to any VeilPay address. Amount is hidden on-chain; only the sender↔recipient relationship is visible.

**Audit** — Both parties can check payment status with the claim secret. The claim secret reveals payment status and the ephemeral address — not either party's real wallet.

---

## How the privacy works

```
Sender wallet  →  fund ephemeral  →  Umbra shielded pool (ZK deposit)
                                               ↓  Groth16 proof
Recipient wallet  ←  sweep  ←  ephemeral ATA  ←  ZK claim
```

The ZK proof proves "I know the secret key for a valid UTXO in this pool" without revealing which one. Anonymity set = all unclaimed UTXOs at claim time. Timing and amount correlation remains a residual risk (same class as Tornado Cash).

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Privacy | Umbra SDK v4 + Arcium MPC |
| Wallet | Wallet Standard (`@wallet-standard/core`) |
| Solana | `@solana/web3.js` v1 |
| Database | Supabase (Postgres) — link metadata only, no secrets |
| Deployment | Vercel |
| ZK proofs | snarkjs + Groth16 (user-registration, UTXO creation, claim) |

---

## Local setup

### 1. Install

```bash
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
# Solana RPC
NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_RPC_WS_URL=wss://api.devnet.solana.com
NEXT_PUBLIC_NETWORK=devnet

# Umbra Protocol
NEXT_PUBLIC_UMBRA_INDEXER_URL=/api/indexer-proxy
NEXT_PUBLIC_UMBRA_RELAYER_URL=https://relayer.api-devnet.umbraprivacy.com

# Token mints (devnet)
NEXT_PUBLIC_USDC_MINT=<devnet_usdc_mint>
NEXT_PUBLIC_SOL_MINT=So11111111111111111111111111111111111111112

NEXT_PUBLIC_LINK_EXPIRY_DAYS=7

# Supabase (optional — metadata only, no private data stored)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>   # server-only, never NEXT_PUBLIC_

# Sweep destination for overage SOL after claims
NEXT_PUBLIC_OVERAGE_WALLET=<your_solana_address>

# x402 private API (optional)
X402_SERVER_PRIVATE_KEY=<base58_keypair>        # server-only
NEXT_PUBLIC_X402_SERVER_ADDRESS=<pubkey>

# Set to true to enable verbose logging in development
NEXT_PUBLIC_DEBUG=false
```

### 3. Set up Supabase tables

Run `setup_payments_table.sql` in your Supabase SQL editor. It creates all three required tables: `x402_invoices`, `x402_rate_limit`, and `payments`.

### 4. Run

```bash
npm run dev
```

---

## x402 — Private Paywalled APIs

VeilPay implements the [x402 payment protocol](https://x402.org): an HTTP `402 Payment Required` flow where the client pays a shielded on-chain fee and retries the request with a proof of payment. Unlike standard x402, VeilPay payments go through the Umbra ZK shielded pool — **the server's address never appears in the transaction**, so payment and identity are fully unlinkable on-chain.

### How the flow works

```
Client                                    Server
  │── GET /api/resource ─────────────────▶ │
  │◀─ 402 { invoice: { amount, token,      │  issueInvoice()
  │         mint, destination, invoiceId }}─│
  │                                        │
  │  [ZK proof + shielded UTXO on Solana]  │
  │                                        │
  │── GET /api/resource ─────────────────▶ │
  │   X-402-Payment: x402 <proof>:<utxo>:<id>  verifyPayment()
  │◀─ 200 { data: "..." } ─────────────────│
```

The `X-402-Payment` header carries three base58 signatures: `proofAccountSig:utxoSig:invoiceId`. The server verifies both on-chain transactions and the invoice ID embedded in the UTXO's optional data.

### Accepting x402 payments on your server

Use the `@bmzennn/veilpay-server` package (lives in `packages/server/`):

```ts
// app/api/your-endpoint/route.ts  (Next.js App Router)
import { VeilPayServer, SOL_MINT, USDC_MINT_MAINNET } from "@bmzennn/veilpay-server";

const veilpay = new VeilPayServer({
  network:                "mainnet",           // or "devnet"
  supabaseUrl:            process.env.SUPABASE_URL!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

// Set your token here — SOL, USDC, USDT, or any SPL mint
const TOKEN = { symbol: "SOL", mint: SOL_MINT, decimals: 9, amount: 0.1 };
const SERVER_ADDRESS = process.env.X402_SERVER_ADDRESS!;

export async function GET(req: Request) {
  const authHeader = req.headers.get("X-402-Payment");

  if (!authHeader) {
    const invoice = await veilpay.issueInvoice({
      amount: TOKEN.amount, token: TOKEN.symbol,
      mint: TOKEN.mint, decimals: TOKEN.decimals,
      serverAddress: SERVER_ADDRESS,
    });
    return Response.json({ error: "Payment Required", invoice }, {
      status: 402,
      headers: { "Www-Authenticate": `x402 invoice="${invoice.invoiceId}"` },
    });
  }

  const proof = await veilpay.handlePayment({
    header: authHeader, serverAddress: SERVER_ADDRESS,
    expectedAmount: TOKEN.amount, expectedToken: TOKEN.symbol,
    expectedMint: TOKEN.mint, expectedDecimals: TOKEN.decimals,
  });

  if (!proof) return Response.json({ error: "Payment verification failed." }, { status: 402 });

  return Response.json({ success: true, data: "protected content" });
}
```

Works the same way with Express, Hono, or any Node.js framework — see `packages/server/README.md` for full examples.

#### Token configuration

| Token | `mint`                                           | `decimals` | Constant             |
|-------|--------------------------------------------------|------------|----------------------|
| SOL   | `So11111111111111111111111111111111111111112`     | 9          | `SOL_MINT`           |
| USDC  | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`  | 6          | `USDC_MINT_MAINNET`  |
| USDT  | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`  | 6          | `USDT_MINT_MAINNET`  |

For devnet USDC pass your devnet mint address directly — no constant needed.

#### Required env vars

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # server-only, never NEXT_PUBLIC_
X402_SERVER_ADDRESS=your_solana_wallet_address
```

Run `setup_payments_table.sql` in your Supabase SQL editor once to create the three required tables (`x402_invoices`, `x402_rate_limit`, `payments`).

### Paying x402 endpoints (AI agents / CLI)

Use the `pay-invoice.cjs` script from the [agent-skills](https://github.com/Bmzennn/agent-skills) repo. It auto-detects the token from the server's 402 invoice — no configuration needed on the payer side:

```bash
# 1. Install the veilpay agent skill
npx skills add Bmzennn/agent-skills@veilpay

# 2. Create a wallet (one-time)
node scripts/wallet.cjs create

# 3. Pay any x402 endpoint
INVOICE=$(curl -s https://your-api.com/endpoint | jq '.invoice')
node scripts/pay-invoice.cjs "$INVOICE" --network mainnet
# → prints: X-402-Payment: x402 <proof>:<utxo>:<invoiceId>

# 4. Retry with the payment header
curl -H "X-402-Payment: <header from step 3>" https://your-api.com/endpoint
```

The script reads `mint` and `decimals` from the invoice directly, so it works with any token the server specifies without any changes on the agent side.

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── links/          # Link metadata CRUD. Ed25519 sig verification on all writes.
│   │   ├── zk-proxy/       # CDN proxy for ZK circuit files (strict CloudFront allowlist).
│   │   ├── indexer-proxy/  # Umbra UTXO indexer proxy (IP rate-limited).
│   │   └── premium-data/   # x402 paid API demo. Supabase-backed invoice + rate limit store.
│   ├── create/             # Send flow: private link or confidential direct transfer.
│   ├── claim/              # Claim flow: scan pool → ZK proof → sweep to wallet.
│   ├── dashboard/          # View encrypted balances, withdraw.
│   └── audit/              # Payment receipt checker (claim secret → pool status).
├── components/
│   ├── AppShell.tsx        # Shared nav, footer, theme floater.
│   ├── WalletModal.tsx     # Portaled wallet connect (escapes backdrop-filter stacking context).
│   └── WalletContext.tsx   # Polling-based Wallet Standard detection + Phantom fallback.
└── lib/
    ├── umbra.ts            # All Umbra SDK calls. ZK prover, ephemeral signer, sweep logic.
    ├── solana.ts           # Web3.js helpers (fund ephemeral, balance checks).
    ├── rateLimit.ts        # Sliding-window IP rate limiter for API routes.
    ├── logger.ts           # Debug-gated logger (no-op in production).
    └── constants.ts        # RPC URLs, token configs, expiry settings.
```

---

## Security

- Claim secrets live **only in the URL hash** — never sent to any server.
- `SUPABASE_SERVICE_ROLE_KEY` and `X402_SERVER_PRIVATE_KEY` are server-only. Never prefix them with `NEXT_PUBLIC_`.
- All API write routes verify Ed25519 wallet signatures with 5-minute replay windows.
- Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy) set in `next.config.ts`.
- Rate limiting on all public API routes via `src/lib/rateLimit.ts`.

---

## Deployment

```bash
npm run build && npm run start
```

Deploy to Vercel: connect the repo and set all environment variables in the Vercel project settings. Do **not** commit `.env.local`.

---

## Privacy model — honest summary

VeilPay provides **third-party unlinkability**: a blockchain analyst cannot prove which sender corresponds to which recipient. It does **not** hide the transaction from your direct counterparty — both parties know they transacted because they exchanged the link out-of-band.

Residual risk: timing and amount correlation. Larger pool + longer time between deposit and claim = stronger anonymity set.

---

Built on [Umbra Privacy Protocol](https://umbraprivacy.com) · [Arcium MPC](https://arcium.com) · [Solana](https://solana.com)
