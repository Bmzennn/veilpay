import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { verifyX402Deposit } from "@/lib/x402";
import { RPC_URL } from "@/lib/constants";
import { getSupabaseServiceClient } from "@/lib/supabase";

const SERVER_PRIVATE_KEY_BASE58 = process.env.X402_SERVER_PRIVATE_KEY || "";
const SERVER_SOLANA_ADDRESS = process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS || "";

if (!SERVER_PRIVATE_KEY_BASE58 || !SERVER_SOLANA_ADDRESS) {
  throw new Error("Missing X402_SERVER_PRIVATE_KEY or NEXT_PUBLIC_X402_SERVER_ADDRESS in environment variables.");
}

const INVOICE_AMOUNT_SOL = 0.1;
const SOL_DECIMALS = 9;
const EXPECTED_AMOUNT_RAW = BigInt(Math.round(INVOICE_AMOUNT_SOL * 10 ** SOL_DECIMALS));
const INVOICE_TTL_MS = 10 * 60 * 1000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 5;

// ─── Invoice registry (Supabase-backed) ──────────────────────────────────────
// Uses the x402_invoices table so state persists across serverless instances.
// Schema: id TEXT PK, expires_at TIMESTAMPTZ, consumed BOOLEAN DEFAULT false
//
// Fallback: if Supabase is not configured (dev without DB), fall back to
// in-memory Map so local development still works.

const _memInvoices = new Map<string, number>(); // fallback for dev

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
      // Supabase insert failed — most likely the x402_invoices table doesn't exist.
      // Fall back to in-memory, but warn loudly: this breaks on serverless (cross-instance).
      console.error(
        "[x402] Supabase invoice insert failed:", error.message,
        "\n  ⚠️  Falling back to in-memory store — invoices WILL break across serverless instances.",
        "\n  ⚠️  Run the x402 table setup SQL in your Supabase project to fix this permanently."
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
    // Atomic: mark consumed=true only if not already consumed and not expired.
    // Returns the row if the update applied; empty if it was already consumed or expired.
    const { data, error } = await client
      .from("x402_invoices")
      .update({ consumed: true })
      .eq("id", invoiceIdHex)
      .eq("consumed", false)
      .gt("expires_at", new Date().toISOString())
      .select("id");

    if (error) {
      // Table likely missing — check in-memory fallback before failing.
      console.error("[x402] Supabase consume failed:", error.message, "— checking in-memory fallback");
      const exp = _memInvoices.get(invoiceIdHex);
      if (!exp || Date.now() > exp) return false;
      _memInvoices.delete(invoiceIdHex);
      return true;
    }

    if (!data || data.length === 0) return false;
    return true;
  }

  // Fallback: in-memory
  const exp = _memInvoices.get(invoiceIdHex);
  if (!exp || Date.now() > exp) return false;
  _memInvoices.delete(invoiceIdHex);
  return true;
}

// ─── Rate limiter (Supabase-backed) ──────────────────────────────────────────
// Schema: ip TEXT, hit_at TIMESTAMPTZ
// Counts rows in the sliding window; inserts one per request.
// Fallback to in-memory Map for local dev.

const _memRate = new Map<string, number[]>();

async function checkRateLimit(ip: string): Promise<boolean> {
  const client = getSupabaseServiceClient();

  if (client) {
    const windowStart = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const { count, error } = await client
      .from("x402_rate_limit")
      .select("*", { count: "exact", head: true })
      .eq("ip", ip)
      .gt("hit_at", windowStart);

    if (error) return true; // fail open on DB error (don't block legit requests)
    if ((count ?? 0) >= RATE_MAX) return false;

    await client.from("x402_rate_limit").insert({ ip, hit_at: new Date().toISOString() });
    return true;
  }

  // Fallback: in-memory
  const now = Date.now();
  const hits = (_memRate.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (hits.length >= RATE_MAX) return false;
  hits.push(now);
  _memRate.set(ip, hits);
  return true;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("x402 ")) {
    const { invoiceIdHex } = await issueInvoice();

    return new NextResponse(
      JSON.stringify({
        error: "Payment Required",
        message: "This is a premium endpoint. Please remit payment via Umbra Stealth Deposit.",
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

  // Rate-limit authenticated attempts (prevents RPC flooding)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // New format: x402 <depositTxSig>:<invoiceId>
  // Direct confidential deposit — no proof tx needed.
  const tokenParts = authHeader.substring(5).split(":");
  if (tokenParts.length !== 2) {
    return NextResponse.json({ error: "Invalid x402 format. Expected: x402 <depositTxSig>:<invoiceId>" }, { status: 400 });
  }

  const [depositTxSig, invoiceIdHex] = tokenParts;

  const sigRegex = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;
  const hexRegex = /^[0-9a-fA-F]{64}$/;

  if (!sigRegex.test(depositTxSig) || !hexRegex.test(invoiceIdHex)) {
    return NextResponse.json({ error: "Invalid payment proof format." }, { status: 400 });
  }

  if (!(await consumeInvoice(invoiceIdHex))) {
    return NextResponse.json({ error: "Invoice unknown or expired." }, { status: 400 });
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const expectedInvoiceId = new Uint8Array(Buffer.from(invoiceIdHex, "hex"));

    const isValid = await verifyX402Deposit({
      connection,
      depositTxSignature: depositTxSig,
      serverSolanaAddress: SERVER_SOLANA_ADDRESS,
      expectedInvoiceId,
    });

    if (!isValid) {
      return NextResponse.json({ error: "Payment verification failed." }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      data: {
        message: "Welcome to the premium club!",
        secretData: "The AI agent has successfully navigated the ZK shielding pool.",
        paymentReceipt: {
          depositTx:  depositTxSig,
          invoiceId:  invoiceIdHex,
          amountPaid: INVOICE_AMOUNT_SOL,
          token:      "SOL",
        },
      },
    });
  } catch (error) {
    console.error("Error during x402 verification:", error);
    return NextResponse.json({ error: "Internal server error during verification." }, { status: 500 });
  }
}
