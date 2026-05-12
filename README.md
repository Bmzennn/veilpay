# VeilPay — Private Payments on Solana

> Send and receive funds with zero on-chain link between sender and recipient.

Built on the [Umbra Privacy SDK](https://umbraprivacy.com) using Arcium MPC and ZK proofs. Live on **Solana Mainnet**.

🌐 **[veilpayments.xyz](https://veilpayments.xyz)**

---

## Features

### Private Payment Links
Generate a shareable URL. Anyone with the link can claim funds into any wallet — no account required, no wallet address exchanged. The ZK proof breaks any cryptographic link between the deposit and the withdrawal on-chain.

### Confidential Direct Transfers
Send directly to any VeilPay address. Amount is hidden on-chain via Arcium MPC. Funds land in the recipient's encrypted balance on the dashboard.

### Private Gift Cards
Choose a denomination, personalise with a message and recipient name, and generate a gift card link. Recipient unwraps it and claims to their own wallet. Download the gift card as a printable front+back PNG — no on-chain link to the sender.

### Private Merchant QR (Solana Pay)
Merchants generate a private payment request and display a QR code at checkout. Customers pay without revealing their wallet. Payments are confirmed via polling — no webhook required.

### Dashboard
View encrypted balance, withdraw shielded funds to a public wallet, and audit payment history using a viewing key. The dashboard shows real-time ZK-encrypted balances across all supported tokens.

### x402 — Private Paywalled APIs
HTTP `402 Payment Required` paywalls where the fee flows through the Umbra shielded pool. The server's wallet address never appears in any transaction. Clients can be wallets, browsers, or AI agents.

---

## Supported Tokens

| Token | Network |
|-------|---------|
| SOL | Mainnet |
| USDC | Mainnet |
| USDT | Mainnet |
| UMBRA | Mainnet |
| CASH | Mainnet |

---

## How the Privacy Works

```
Sender wallet  →  fund ephemeral  →  Umbra shielded pool (ZK deposit)
                                               ↓  ZK proof
Recipient wallet  ←  sweep  ←  ephemeral ATA  ←  ZK claim
```

The ZK proof proves "I know the secret for a valid commitment in this pool" without revealing which one. The sender's wallet and recipient's wallet have zero on-chain relationship — no shared transaction, no common intermediate account, no traceable path.

**Claim secrets live only in the URL hash.** The `#fragment` is never sent to any server by the browser. VeilPay's backend stores only metadata (amount, token, expiry, claimed status) — never the claim credential itself.

---

## Resilience & Mainnet Recovery

VeilPay is built to handle the high latency and dynamic nature of Solana Mainnet. Unlike standard prototypes, it includes a multi-layered recovery system:

### 1. 3-Stage Atomic Resumption
Claiming a private link involves moving funds through three distinct states: **Shielded Pool** → **Private Vault** (Arcium) → **Public Gateway** → **User Wallet**. VeilPay's "Resume" logic automatically detects if a claim was interrupted (due to browser crash or RPC timeout) and allows the user to finish the delivery with a single click, starting from the furthest progressed stage.

### 2. "Stranded SOL" Rescue (Sender Side)
If a sender funds the ephemeral gateway but the link creation is aborted before the ZK deposit is committed, the ephemeral keypair is persisted in the browser's local state. On the next visit, the user is presented with a "Rescue Buffer" banner to sweep those funds back to their main wallet.

### 3. Mainnet Latency Buffers
- **Extended Polling**: VeilPay polls for Arcium MPC callbacks for up to **180 seconds**, ensuring that even during extreme network congestion, the tokens are captured as they land in the gateway.
- **Rent-Exemption Safety**: The system maintains a **0.005 SOL safety buffer** in every gateway transaction. This prevents on-chain failures caused by `InsufficientFundsForRent` when creating recipient token accounts or handling rent-exempt minimums.

### 4. Precise Fee Calculation
The final delivery phase uses a "Drain to 0" or "Safe Rent" strategy. It calculates exact network fees to ensure the gateway wallet is either perfectly emptied or left with a healthy rent balance, preventing the common mainnet "gas-burn" spiral where failed transactions consume the remaining buffer.

---

## Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript (strict) |
| Privacy | Umbra SDK v4 + Arcium MPC |
| Wallet | Wallet Standard (`@wallet-standard/core`) |
| Solana | `@solana/web3.js` v1 |
| Database | Supabase (Postgres) — metadata only, no secrets |
| Deployment | Vercel |
| ZK circuits | snarkjs + Groth16 (user registration, UTXO creation, claim) |

---

## Local Setup

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
# Solana
NEXT_PUBLIC_RPC_URL=https://mainnet.helius-rpc.com/?api-key=<key>
NEXT_PUBLIC_NETWORK=mainnet

# Umbra Protocol
NEXT_PUBLIC_UMBRA_INDEXER_URL=/api/indexer-proxy
NEXT_PUBLIC_UMBRA_RELAYER_URL=https://relayer.api.umbraprivacy.com

# Token mints (mainnet)
NEXT_PUBLIC_USDC_MINT=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
NEXT_PUBLIC_USDT_MINT=Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB
NEXT_PUBLIC_UMBRA_MINT=<umbra_token_mint>
NEXT_PUBLIC_CASH_MINT=<cash_token_mint>
NEXT_PUBLIC_SOL_MINT=So11111111111111111111111111111111111111112

NEXT_PUBLIC_LINK_EXPIRY_DAYS=7

# Supabase (metadata only — no private data stored)
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_ROLE_KEY=<service_role_key>   # server-only

# Sweep destination for leftover SOL from ephemeral accounts
NEXT_PUBLIC_OVERAGE_WALLET=<your_solana_address>

# x402 private API (optional)
X402_SERVER_PRIVATE_KEY=<base58_keypair>        # server-only
NEXT_PUBLIC_X402_SERVER_ADDRESS=<pubkey>

# Maintenance mode (set to "true" to show maintenance page)
MAINTENANCE_MODE=
```

### 3. Set up Supabase tables

Run `setup_payments_table.sql` in your Supabase SQL editor. Creates:
- `payments` — payment link metadata
- `merchant_payment_requests` — merchant QR payment requests
- `x402_invoices` — x402 payment invoices
- `x402_rate_limit` — per-IP rate limiting for x402 endpoints

### 4. Run

```bash
npm run dev
```

---

## Architecture

```
src/
├── app/
│   ├── api/
│   │   ├── links/              # Payment link CRUD. Ed25519 sig on all writes.
│   │   ├── merchant-pay/       # Merchant payment request CRUD + polling.
│   │   ├── zk-proxy/           # Streams ZK circuit files from CloudFront CDN.
│   │   ├── indexer-proxy/      # Umbra UTXO indexer proxy (IP rate-limited).
│   │   └── premium-data/       # x402 paywalled demo endpoint.
│   ├── create/                 # Send flow: private link, direct transfer, or gift card.
│   ├── claim/                  # Claim flow: scan pool → ZK proof → sweep to wallet.
│   ├── gift/                   # Gift card creation with denomination presets + card download.
│   ├── merchant/               # Merchant dashboard — generate QR, poll for payment.
│   ├── pay/[id]/               # Customer checkout for merchant payment requests.
│   ├── dashboard/              # Encrypted balance viewer, withdraw, audit tab.
│   ├── audit/                  # Payment receipt checker (claim secret → pool status).
│   └── docs/                   # In-app documentation.
├── components/
│   ├── AppShell.tsx            # Shared nav, footer, theme toggle.
│   ├── WalletModal.tsx         # Portaled wallet connect modal.
│   └── WalletContext.tsx       # Wallet Standard detection + auto-reconnect.
└── lib/
    ├── umbra.ts                # All Umbra SDK calls — deposit, withdraw, note, viewing key.
    ├── solana.ts               # Web3.js helpers (fund ephemeral, balance checks).
    ├── rateLimit.ts            # Sliding-window IP rate limiter for API routes.
    ├── logger.ts               # Debug-gated logger (no-op in production).
    └── constants.ts            # Token configs, RPC endpoints, expiry settings.
```

---

## AI Agent Skill

VeilPay ships a complete agent skill for AI systems (Claude, GPT, any tool-calling agent):

```bash
npx skills add Bmzennn/agent-skills@veilpay
```

Agents can then:

```bash
# Create a private payment link
node scripts/create-link.cjs --amount 10 --token USDC --network mainnet

# Claim a link
node scripts/claim-link.cjs --url "https://veilpayments.xyz/claim#<secret>:USDC"

# Confidential transfer to a VeilPay address
node scripts/transfer.cjs --to <address> --amount 5 --token USDC

# Check link status
node scripts/check-link.cjs --url "https://veilpayments.xyz/claim#<secret>:SOL"

# Check encrypted balance
node scripts/balance.cjs --network mainnet

# Withdraw to public wallet
node scripts/withdraw.cjs --token USDC --network mainnet
```

Full documentation: [github.com/Bmzennn/agent-skills](https://github.com/Bmzennn/agent-skills/tree/main/veilpay)

---

## x402 — Private Paywalled APIs

VeilPay implements the [x402 payment protocol](https://x402.org): an HTTP `402 Payment Required` flow where the client pays a shielded on-chain fee and retries with proof. Unlike standard x402, payments route through the Umbra ZK shielded pool — **the server's address never appears in the transaction**.

### Accepting x402 payments on your server

```ts
import { VeilPayServer, USDC_MINT_MAINNET } from "@bmzennn/veilpay-server";

const veilpay = new VeilPayServer({
  network: "mainnet",
  supabaseUrl: process.env.SUPABASE_URL!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

const INVOICE = { symbol: "USDC", mint: USDC_MINT_MAINNET, decimals: 6, amount: 0.2 };

export async function GET(req: Request) {
  const authHeader = req.headers.get("X-402-Payment");

  if (!authHeader) {
    const invoice = await veilpay.issueInvoice({
      amount: INVOICE.amount, token: INVOICE.symbol,
      mint: INVOICE.mint, decimals: INVOICE.decimals,
      serverAddress: process.env.X402_SERVER_ADDRESS!,
    });
    return Response.json({ error: "Payment Required", invoice }, {
      status: 402,
      headers: { "Www-Authenticate": `x402 invoice="${invoice.invoiceId}"` },
    });
  }

  const proof = await veilpay.handlePayment({
    header: authHeader,
    serverAddress: process.env.X402_SERVER_ADDRESS!,
    expectedAmount: INVOICE.amount,
    expectedToken: INVOICE.symbol,
    expectedMint: INVOICE.mint,
    expectedDecimals: INVOICE.decimals,
  });

  if (!proof) return Response.json({ error: "Payment verification failed." }, { status: 402 });
  return Response.json({ data: "protected content" });
}
```

### Paying x402 endpoints (agents / CLI)

```bash
npx skills add Bmzennn/agent-skills@veilpay
node scripts/pay-invoice.cjs "$INVOICE_JSON" --network mainnet
# → X-402-Payment: x402 <proof>:<utxo>:<invoiceId>
```

Full server package docs: `packages/server/README.md`

---

## Security

- **Claim secrets are browser-only** — the URL hash fragment is never sent to any server.
- `SUPABASE_SERVICE_ROLE_KEY` and `X402_SERVER_PRIVATE_KEY` are server-only. Never use `NEXT_PUBLIC_` prefix on secrets.
- All API write routes require Ed25519 wallet signatures with 5-minute replay protection.
- Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy) enforced in `next.config.ts`.
- Rate limiting on all public API routes (`src/lib/rateLimit.ts`).
- Atomic double-claim guard on the PATCH endpoint — row-level check prevents race conditions.

---

## Deployment

```bash
npm run build
npm run start
```

Connect the repo to Vercel and set all environment variables in the project settings. The build reads `.env.local` locally and Vercel environment variables in production.

**Do not commit `.env.local`.**

---

## Recovering Stranded SOL

If a link creation fails mid-flow, the ephemeral account may retain SOL. The app detects this automatically and shows a recovery banner on the Send page. To recover manually:

```bash
CLAIM_HASH="<secret>:USDC" node scripts/sweep-ephemeral.mjs
```

---

Built on [Umbra Privacy Protocol](https://umbraprivacy.com) · [Arcium MPC](https://arcium.com) · [Solana](https://solana.com)
