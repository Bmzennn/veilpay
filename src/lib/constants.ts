import type { Token } from "@/types";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export const RPC_WS_URL =
  process.env.NEXT_PUBLIC_RPC_WS_URL ?? "wss://api.devnet.solana.com";

export const NETWORK =
  (process.env.NEXT_PUBLIC_NETWORK as "mainnet" | "devnet" | "localnet") ??
  "devnet";

// Browser-relative path — requests go through /api/indexer-proxy which
// server-side-forwards to https://utxo-indexer.api-devnet.umbraprivacy.com.
// The upstream sends no CORS headers, so direct browser fetches are blocked.
export const UMBRA_INDEXER_URL =
  process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL ?? "/api/indexer-proxy";

export const UMBRA_RELAYER_URL =
  process.env.NEXT_PUBLIC_UMBRA_RELAYER_URL ??
  "https://relayer.api-devnet.umbraprivacy.com";

export const LINK_EXPIRY_DAYS = Number(
  process.env.NEXT_PUBLIC_LINK_EXPIRY_DAYS ?? 7
);

export const TOKEN_CONFIG: Record<
  Token,
  { mint: string; decimals: number; symbol: string; color: string }
> = {
  USDC: {
    mint:
      NETWORK === "mainnet"
        ? "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
        : "GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9",
    decimals: NETWORK === "mainnet" ? 6 : 9,
    symbol: "USDC",
    color: "#2775CA",
  },
  SOL: {
    mint:
      process.env.NEXT_PUBLIC_SOL_MINT ??
      "So11111111111111111111111111111111111111112",
    decimals: 9,
    symbol: "SOL",
    color: "#9945FF",
  },
};

/** Minimum SOL to send to ephemeral account to cover registration + withdrawal fees */
export const EPHEMERAL_SOL_BUFFER = 0.018; // SOL
