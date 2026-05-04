import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { verifyX402Deposit } from "@/lib/x402";
import { RPC_URL } from "@/lib/constants";
import { getSupabaseServiceClient } from "@/lib/supabase";
import { getClientIp } from "@/lib/rateLimit";
import { securityLog } from "@/lib/securityLog";

const SERVER_SOLANA_ADDRESS = process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS || "";

const INVOICE_TOKEN    = "USDC";
const INVOICE_AMOUNT   = 0.2;                      // human-readable (0.20 USDC)
const INVOICE_DECIMALS = 6;
const INVOICE_MINT     = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const INVOICE_AMOUNT_RAW = Math.round(INVOICE_AMOUNT * 10 ** INVOICE_DECIMALS); 

const INVOICE_TTL_MS = 10 * 60 * 1000;

async function issueInvoice(): Promise<{ invoiceIdHex: string }> {
  const invoiceId = crypto.getRandomValues(new Uint8Array(32));
  const invoiceIdHex = Buffer.from(invoiceId).toString("hex");
  const expiresAt = new Date(Date.now() + INVOICE_TTL_MS).toISOString();

  const client = getSupabaseServiceClient();
  if (client) {
    await client
      .from("x402_invoices")
      .insert({ id: invoiceIdHex, expires_at: expiresAt, consumed: false });
  }

  return { invoiceIdHex };
}

async function consumeInvoice(invoiceIdHex: string): Promise<boolean> {
  const client = getSupabaseServiceClient();
  if (!client) return false;

  const { data } = await client
    .from("x402_invoices")
    .update({ consumed: true })
    .eq("id", invoiceIdHex)
    .eq("consumed", false)
    .gt("expires_at", new Date().toISOString())
    .select("id");

  return !!data && data.length > 0;
}

export async function handleX402Request(
  req: NextRequest,
  handler: () => Promise<NextResponse>
): Promise<NextResponse> {
  const authHeader = req.headers.get("X-402-Payment");

  if (!authHeader || !authHeader.startsWith("x402 ")) {
    const { invoiceIdHex } = await issueInvoice();

    return new NextResponse(
      JSON.stringify({
        error: "Payment Required",
        message: "This is a premium endpoint. Please remit payment via Umbra Shielded UTXO.",
        invoice: {
          amount: INVOICE_AMOUNT,
          token: INVOICE_TOKEN,
          mint: INVOICE_MINT,
          decimals: INVOICE_DECIMALS,
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
  const tokenParts = authHeader.substring(5).split(":");
  if (tokenParts.length !== 3) {
    return NextResponse.json(
      { error: "Invalid x402 format. Expected: x402 <proofAccountSig>:<utxoSig>:<invoiceId>" },
      { status: 400 }
    );
  }

  const [proofTxSig, depositTxSig, invoiceIdHex] = tokenParts;

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
      expectedAmount:     INVOICE_AMOUNT_RAW,
      expectedToken:      INVOICE_TOKEN,
    });

    if (!isValid) {
      securityLog("payment_rejected", { ip, detail: "on-chain verification failed", ref: depositTxSig.slice(0, 12) });
      return NextResponse.json({ error: "Payment verification failed." }, { status: 403 });
    }

    // Success! Execute the actual handler
    return await handler();

  } catch (error) {
    console.error("[x402] Handler error:", error);
    return NextResponse.json({ error: "Internal server error during verification." }, { status: 500 });
  }
}
