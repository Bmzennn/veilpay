/**
 * /api/prices — Server-side proxy for CoinGecko token prices.
 *
 * Browser fetches from CoinGecko are blocked by CORS on the free tier.
 * This route fetches server-side (no CORS restriction) and returns the
 * USD prices for supported tokens.
 *
 * GET /api/prices?tokens=SOL,USDC,UMBRA,CASH
 */

import { NextRequest, NextResponse } from "next/server";

const COINGECKO_IDS: Record<string, string> = {
  SOL:   "solana",
  UMBRA: "umbra",
  CASH:  "cash",
};

// Stablecoins: always $1 — no API call needed
const STABLE_USD: Record<string, number> = {
  USDC: 1.00,
  USDT: 1.00,
};

export async function GET(req: NextRequest): Promise<NextResponse> {
  const tokensParam = req.nextUrl.searchParams.get("tokens") ?? "";
  const tokens = tokensParam.split(",").filter(Boolean);

  if (tokens.length === 0) {
    return NextResponse.json({});
  }

  const prices: Record<string, number> = {};

  // Stablecoins: hardcode
  for (const token of tokens) {
    if (STABLE_USD[token] !== undefined) prices[token] = STABLE_USD[token];
  }

  // Dynamic tokens: fetch from CoinGecko server-side
  const toFetch = tokens.filter((t) => COINGECKO_IDS[t]);
  if (toFetch.length > 0) {
    const ids = toFetch.map((t) => COINGECKO_IDS[t]).join(",");
    try {
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
        { next: { revalidate: 60 } }  // cache 60s so repeated renders don't hammer CoinGecko
      );
      if (res.ok) {
        const json = await res.json() as Record<string, { usd: number }>;
        for (const token of toFetch) {
          prices[token] = json[COINGECKO_IDS[token]]?.usd ?? 0;
        }
      }
    } catch {
      // Return whatever we have (stablecoins at minimum)
    }
  }

  return NextResponse.json(prices, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
  });
}
