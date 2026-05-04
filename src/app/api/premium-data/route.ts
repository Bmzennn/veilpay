import { NextRequest, NextResponse } from "next/server";
import { handleX402Request } from "@/lib/x402-handler";

const INVOICE_TOKEN    = "USDC";
const INVOICE_AMOUNT   = 0.2;                      // human-readable (0.20 USDC)

export async function GET(req: NextRequest) {
  return handleX402Request(req, async () => {
    return NextResponse.json({
      success: true,
      data: {
        message: "Welcome to the premium club!",
        secretData: "The AI agent has successfully navigated the ZK shielding pool.",
        paymentReceipt: {
          amountPaid: INVOICE_AMOUNT,
          token:      INVOICE_TOKEN,
        },
      },
    });
  });
}
