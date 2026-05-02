import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { verifyX402Deposit } from "@/lib/x402";
import { RPC_URL } from "@/lib/constants";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/rateLimit";
import { securityLog } from "@/lib/securityLog";

const SERVER_SOLANA_ADDRESS = process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS || "";

const INVOICE_AMOUNT_SOL = 0.1;
const INVOICE_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

// ─── Invoice registry (Supabase-backed) ──────────────────────────────────────
const _memInvoices = new Map<string, number>(); // dev fallback only

async function issueInvoice(): Promise<{ invoiceId: Uint8Array; invoiceIdHex: string }> {
  const invoiceId = crypto.getRandomValues(new Uint8Array(32));
  const invoiceIdHex = Buffer.from(invoiceId).toString("hex");
  const expiresAt = new Date(Date.now() + INVOICE_TTL_MS).toISOString();

  const client = getSupabaseServiceClient();
  if (client) {
    const { error } = await client
      .from("x402_invoices")
      .insert({ id: invoiceIdHex, expires_at: expiresAt, consumed: false });

    if (error) {
      console.error(
        "[x402] Supabase invoice insert failed:", error.message,
        "\n  ⚠️  Falling back to in-memory store — invoices WILL break across serverless instances."
      );
      _memInvoices.set(invoiceIdHex, Date.now() + INVOICE_TTL_MS);
    }
  } else {
    _memInvoices.set(invoiceIdHex, Date.now() + INVOICE_TTL_MS);
  }

  return { invoiceId, invoiceIdHex };
}

async function consumeInvoice(invoiceIdHex: string): Promise<boolean> {
  const client = getSupabaseServiceClient();

  if (client) {
    const { data, error } = await client
      .from("x402_invoices")
      .update({ consumed: true })
      .eq("id", invoiceIdHex)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .select("id");

    if (error) {
      console.error("[x402] Supabase consume failed:", error.message, "— checking in-memory fallback");
      const exp = _memInvoices.get(invoiceIdHex);
      if (!exp || Date.now() > exp) return false;
      _memInvoices.delete(invoiceIdHex);
      return true;
    }

    if (!data || data.length === 0) return false;
    return true;
  }

  // Dev fallback: in-memory
  const exp = _memInvoices.get(invoiceIdHex);
  if (!exp || Date.now() > exp) return false;
  _memInvoices.delete(invoiceIdHex);
  return true;
}

// ─── Rate limiter (Supabase-backed, fail-closed) ──────────────────────────────
const _memRate = new Map<string, number[]>();

async function checkX402RateLimit(ip: string): Promise<boolean> {
  const client = getSupabaseServiceClient();

  if (client) {
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count, error } = await client
      .from("x402_rate_limit")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .gt("hit_at", windowStart);

    if (error) {
      // Fail closed: a DB error cannot be used to bypass rate limiting.
      console.error("[x402] Rate-limit DB error, denying request:", error.message);
      return false;
    }
    if ((count ?? 0) >= RATE_MAX) return false;

    await client.from("x402_rate_limit").insert({ ip, hit_at: new Date().toISOString() });
    return true;
  }

  // Dev fallback: in-memory
  const now = Date.now();
  const hits = (_memRate.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return false;
  hits.push(now);
  _memRate.set(ip, hits);
  return true;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("X-402-Payment");

  if (!authHeader || !authHeader.startsWith("x402 ")) {
    const { invoiceIdHex } = await issueInvoice();

    return new NextResponse(
      JSON.stringify({
        error: "Payment Required",
        message: "This is a premium endpoint. Please remit payment via Umbra Shielded UTXO.",
        invoice: {
          amount: INVOICE_AMOUNT_SOL,
          token: "SOL",
          destination: SERVER_SOLANA_ADDRESS,
          invoiceId: invoiceIdHex,
        },
      }),
      {
        status: 402,
        headers: {
          "Content-Type": "application/json",
          "Www-Authenticate": `x402 macaroon="mock_macaroon", invoice="${invoiceIdHex}"`,
        },
      }
    );
  }

  const ip = getClientIp(req);

  if (!(await checkX402RateLimit(ip))) {
    securityLog("rate_limit_hit", { ip, detail: "x402 endpoint" });
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const tokenParts = authHeader.substring(5).split(":");
  if (tokenParts.length !== 3) {
    return NextResponse.json(
      { error: "Invalid x402 format. Expected: x402 <proofAccountSig>:<utxoSig>:<invoiceId>" },
      { status: 400 }
    );
  }

  const [proofTxSig, depositTxSig, invoiceIdHex] = tokenParts;

  const sigRegex = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;
  const hexRegex = /^[0-9a-fA-F]{64}$/;

  if (!sigRegex.test(proofTxSig) || !sigRegex.test(depositTxSig) || !hexRegex.test(invoiceIdHex)) {
    securityLog("payment_rejected", { ip, detail: "malformed proof format" });
    return NextResponse.json({ error: "Invalid payment proof format." }, { status: 400 });
  }

  if (!(await consumeInvoice(invoiceIdHex))) {
    securityLog("payment_rejected", { ip, detail: "invoice unknown or expired", ref: invoiceIdHex.slice(0, 12) });
    return NextResponse.json({ error: "Invoice unknown or expired." }, { status: 400 });
  }

  if (!SERVER_SOLANA_ADDRESS) {
    return NextResponse.json({ error: "Server not configured for x402 payments." }, { status: 503 });
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const expectedInvoiceId = new Uint8Array(Buffer.from(invoiceIdHex, "hex"));

    const isValid = await verifyX402Deposit({
      connection,
      proofTxSignature:   proofTxSig,
      depositTxSignature: depositTxSig,
      serverSolanaAddress: SERVER_SOLANA_ADDRESS,
      expectedInvoiceId,
      expectedAmountSol: INVOICE_AMOUNT_SOL,
    });

    if (!isValid) {
      securityLog("payment_rejected", { ip, detail: "on-chain verification failed", ref: depositTxSig.slice(0, 12) });
      return NextResponse.json({ error: "Payment verification failed." }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "Welcome to the premium club!",
        secretData: "The AI agent has successfully navigated the ZK shielding pool.",
        paymentReceipt: {
          proofTx:    proofTxSig,
          depositTx:  depositTxSig,
          invoiceId:  invoiceIdHex,
          amountPaid: INVOICE_AMOUNT_SOL,
          token:      "SOL",
        },
      },
    });
  } catch (error) {
    console.error("[x402] Verification error:", error);
    return NextResponse.json({ error: "Internal server error during verification." }, { status: 500 });
  }
}
