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

Run `setup_payments_table.sql` in your Supabase SQL editor, then also create:

```sql
create table x402_invoices (
  id text primary key,
  expires_at timestamptz not null,
  consumed boolean default false
);

create table x402_rate_limit (
  id bigserial primary key,
  ip text not null,
  hit_at timestamptz not null
);
create index on x402_rate_limit (ip, hit_at);
```

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
