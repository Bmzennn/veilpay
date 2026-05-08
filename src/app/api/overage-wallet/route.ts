import { NextResponse } from "next/server";

export const runtime = "edge";

/**
 * GET /api/overage-wallet
 * Returns the operator's overage wallet address.
 * Called by agent skill scripts to determine where leftover ephemeral SOL is swept.
 * Public endpoint — the address itself is not sensitive.
 */
export async function GET() {
  const address = process.env.NEXT_PUBLIC_OVERAGE_WALLET;

  if (!address) {
    return NextResponse.json(
      { error: "Overage wallet not configured on server." },
      { status: 503 }
    );
  }

  return NextResponse.json({ address }, {
    headers: { "Cache-Control": "public, max-age=3600" },
  });
}
