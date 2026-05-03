# @veilpay/server

Accept private x402 payments on your server. Payments are made via the [Umbra ZK shielded pool](https://umbraprivacy.com) — the payer and server are never linked on-chain.

## Install

```bash
npm install @veilpay/server
```

## 1. Database setup

Run `sql/setup.sql` in your Supabase SQL editor once. This creates three tables:

- `x402_invoices` — single-use invoice registry (survives serverless restarts)
- `x402_rate_limit` — per-IP rate limiting
- `payments` — replay protection and payment history

## 2. Environment variables

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key   # server-only, never expose to browser
X402_SERVER_ADDRESS=your_solana_wallet_address    # receives the shielded payments
```

## 3. Protect a route

### Next.js App Router

```ts
// app/api/your-endpoint/route.ts
import { VeilPayServer, SOL_MINT, USDC_MINT_MAINNET } from "@veilpay/server";

const veilpay = new VeilPayServer({
  network:                "mainnet",           // or "devnet"
  supabaseUrl:            process.env.SUPABASE_URL!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

// Token config — change to USDC, USDT, etc.
const TOKEN = {
  symbol:   "SOL",
  mint:     SOL_MINT,
  decimals: 9,
  amount:   0.1,          // price per request
};

const SERVER_ADDRESS = process.env.X402_SERVER_ADDRESS!;

export async function GET(req: Request) {
  const authHeader = req.headers.get("X-402-Payment");

  // No payment header — issue an invoice
  if (!authHeader) {
    const invoice = await veilpay.issueInvoice({
      amount:        TOKEN.amount,
      token:         TOKEN.symbol,
      mint:          TOKEN.mint,
      decimals:      TOKEN.decimals,
      serverAddress: SERVER_ADDRESS,
    });

    return Response.json(
      { error: "Payment Required", invoice },
      {
        status: 402,
        headers: { "Www-Authenticate": `x402 invoice="${invoice.invoiceId}"` },
      }
    );
  }

  // Payment header present — verify it
  const proof = await veilpay.handlePayment({
    header:          authHeader,
    serverAddress:   SERVER_ADDRESS,
    expectedAmount:  TOKEN.amount,
    expectedToken:   TOKEN.symbol,
    expectedMint:    TOKEN.mint,
    expectedDecimals: TOKEN.decimals,
  });

  if (!proof) {
    return Response.json({ error: "Payment verification failed." }, { status: 402 });
  }

  // Payment verified — return the protected resource
  return Response.json({
    success: true,
    data:    { message: "Access granted." },
    receipt: { depositTx: proof.depositTxSig, invoiceId: proof.invoiceIdHex },
  });
}
```

### Express / Hono / any Node.js framework

```ts
import express from "express";
import { VeilPayServer, USDC_MINT_MAINNET } from "@veilpay/server";

const veilpay = new VeilPayServer({
  network:                "mainnet",
  supabaseUrl:            process.env.SUPABASE_URL!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
});

// Pay in USDC
const TOKEN = { symbol: "USDC", mint: USDC_MINT_MAINNET, decimals: 6, amount: 1.0 };

const app = express();

app.get("/api/premium", async (req, res) => {
  const authHeader = req.headers["x-402-payment"] as string | undefined;

  if (!authHeader) {
    const invoice = await veilpay.issueInvoice({
      amount: TOKEN.amount, token: TOKEN.symbol,
      mint: TOKEN.mint, decimals: TOKEN.decimals,
      serverAddress: process.env.X402_SERVER_ADDRESS!,
    });
    return res.status(402).json({ error: "Payment Required", invoice });
  }

  const proof = await veilpay.handlePayment({
    header: authHeader,
    serverAddress:    process.env.X402_SERVER_ADDRESS!,
    expectedAmount:   TOKEN.amount,
    expectedToken:    TOKEN.symbol,
    expectedMint:     TOKEN.mint,
    expectedDecimals: TOKEN.decimals,
  });

  if (!proof) return res.status(402).json({ error: "Payment verification failed." });

  res.json({ success: true, data: "your protected content here" });
});
```

## Token configuration

| Token | `mint`                                         | `decimals` | Constant              |
|-------|------------------------------------------------|------------|-----------------------|
| SOL   | `So11111111111111111111111111111111111111112`   | 9          | `SOL_MINT`            |
| USDC  | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`| 6          | `USDC_MINT_MAINNET`   |
| USDT  | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB`| 6          | `USDT_MINT_MAINNET`   |

For devnet USDC, pass your devnet mint address directly — no constant needed.

## How it works

1. Client hits your endpoint with no `X-402-Payment` header.
2. Server issues a single-use invoice (stored in Supabase) and returns 402.
3. Client pays via the Umbra ZK shielded pool — creates two on-chain transactions
   (proof account + UTXO). The server's address never appears in the transaction.
4. Client retries with `X-402-Payment: x402 <proofTxSig>:<depositTxSig>:<invoiceId>`.
5. Server consumes the invoice, verifies both txs on-chain, records the payment, and
   returns the protected resource.
