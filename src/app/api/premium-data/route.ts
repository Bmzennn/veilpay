import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { verifyX402Deposit } from "@/lib/x402";
import { RPC_URL } from "@/lib/constants";
import { getSupabaseServiceClient } from "@/lib/supabase";

// Server Solana address used for replay record-keeping only.
// X402_SERVER_PRIVATE_KEY is not needed here — verification uses the on-chain
// balance delta, not server-side UTXO decryption.
const SERVER_SOLANA_ADDRESS = process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS || "";

const INVOICE_AMOUNT_SOL = 0.1;
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

  // Fallback: in-memory
  const exp = _memInvoices.get(invoiceIdHex);
  if (!exp || Date.now() > exp) return false;
  _memInvoices.delete(invoiceIdHex);
  return true;
}

// ─── Rate limiter (Supabase-backed) ──────────────────────────────────────────
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

    if (error) return true; // fail open on DB error
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

  // Rate-limit authenticated attempts (prevents RPC flooding)
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (!(await checkRateLimit(ip))) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  // Format: x402 <proofAccountSig>:<utxoSig>:<invoiceId>
  // proofAccountSig = createProofAccountSignature (proof account buffer tx)
  // utxoSig         = createUtxoSignature (actual UTXO creation tx)
  // invoiceId       = 64-char hex, server-issued one-time token
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
    return NextResponse.json({ error: "Invalid payment proof format." }, { status: 400 });
  }

  if (!(await consumeInvoice(invoiceIdHex))) {
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
      depositTxSignature: depositTxSig,
      serverSolanaAddress: SERVER_SOLANA_ADDRESS,
      expectedInvoiceId,
      expectedAmountSol: INVOICE_AMOUNT_SOL,
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
          proofTx:    proofTxSig,
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
