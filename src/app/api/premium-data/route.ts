import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { verifyX402Deposit } from "@/lib/x402";
import { RPC_URL } from "@/lib/constants";

const SERVER_PRIVATE_KEY_BASE58 = process.env.X402_SERVER_PRIVATE_KEY || "";
const SERVER_SOLANA_ADDRESS = process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS || "";

if (!SERVER_PRIVATE_KEY_BASE58 || !SERVER_SOLANA_ADDRESS) {
  throw new Error("Missing X402_SERVER_PRIVATE_KEY or NEXT_PUBLIC_X402_SERVER_ADDRESS in environment variables.");
}

const INVOICE_AMOUNT_SOL = 0.1; // SOL
const SOL_DECIMALS = 9;
const EXPECTED_AMOUNT_RAW = BigInt(Math.round(INVOICE_AMOUNT_SOL * 10 ** SOL_DECIMALS));

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("x402 ")) {
    const invoiceId = crypto.getRandomValues(new Uint8Array(32));
    const invoiceIdHex = Buffer.from(invoiceId).toString("hex");

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

  const tokenParts = authHeader.substring(5).split(":");
  if (tokenParts.length !== 3) {
    return NextResponse.json({ error: "Invalid x402 authorization format." }, { status: 400 });
  }

  const [proofTxSig, depositTxSig, invoiceIdHex] = tokenParts;

  // Basic format validation to prevent DoS via RPC flooding
  const sigRegex = /^[1-9A-HJ-NP-Za-km-z]{32,88}$/;
  const hexRegex = /^[0-9a-fA-F]{64}$/;

  if (!sigRegex.test(proofTxSig) || !sigRegex.test(depositTxSig) || !hexRegex.test(invoiceIdHex)) {
    return NextResponse.json({ error: "Invalid payment proof format." }, { status: 400 });
  }

  try {
    const connection = new Connection(RPC_URL, "confirmed");
    const expectedInvoiceId = new Uint8Array(Buffer.from(invoiceIdHex, "hex"));

    const isValid = await verifyX402Deposit({
      connection,
      proofTxSignature: proofTxSig,
      depositTxSignature: depositTxSig,
      serverPrivateKeyBase58: SERVER_PRIVATE_KEY_BASE58,
      serverSolanaAddress: SERVER_SOLANA_ADDRESS,
      expectedAmountRaw: EXPECTED_AMOUNT_RAW,
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
          depositTx: depositTxSig,
          amountPaid: INVOICE_AMOUNT_SOL,
          token: "SOL"
        },
      },
    });

  } catch (error) {
    console.error("Error during x402 verification:", error);
    return NextResponse.json({ error: "Internal server error during verification." }, { status: 500 });
  }
}
