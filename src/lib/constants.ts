import type { Token } from "@/types";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export const RPC_WS_URL =
  process.env.NEXT_PUBLIC_RPC_WS_URL ?? "wss://api.devnet.solana.com";

export const NETWORK =
  (process.env.NEXT_PUBLIC_NETWORK as "mainnet" | "devnet" | "localnet") ??
  "devnet";

export const UMBRA_INDEXER_URL =
  process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL ??
  (typeof window !== "undefined"
    ? "/api/indexer-proxy"
    : NETWORK === "mainnet"
    ? "https://utxo-indexer.api.umbraprivacy.com"
    : "https://utxo-indexer.api-devnet.umbraprivacy.com");

export const UMBRA_RELAYER_URL =
  process.env.NEXT_PUBLIC_UMBRA_RELAYER_URL ??
  "https://relayer.api-devnet.umbraprivacy.com";

export const LINK_EXPIRY_DAYS = Number(
  process.env.NEXT_PUBLIC_LINK_EXPIRY_DAYS ?? 7
);

// All SPL tokens use mainnet mint addresses.
// SOL uses the canonical wrapped-SOL mint (same on all networks).
// Testing on devnet: only SOL transfers work natively; SPL tokens will show
// "insufficient balance" unless you hold the mainnet mint on devnet (not possible),
// so devnet testing is SOL-only until mainnet launch.
export const TOKEN_CONFIG: Record<
  Token,
  { mint: string; decimals: number; symbol: string; name: string; color: string }
> = {
  SOL: {
    mint: "So11111111111111111111111111111111111111112",
    decimals: 9,
    symbol: "SOL",
    name: "Solana",
    color: "#9945FF",
  },
  USDC: {
    mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    decimals: 6,
    symbol: "USDC",
    name: "USD Coin",
    color: "#2775CA",
  },
  USDT: {
    mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    decimals: 6,
    symbol: "USDT",
    name: "Tether USD",
    color: "#26A17B",
  },
  BONK: {
    mint: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    decimals: 5,
    symbol: "BONK",
    name: "Bonk",
    color: "#FF8C00",
  },
  JUP: {
    mint: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    decimals: 6,
    symbol: "JUP",
    name: "Jupiter",
    color: "#C7F284",
  },
  WIF: {
    mint: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    decimals: 6,
    symbol: "WIF",
    name: "dogwifhat",
    color: "#F5B942",
  },
};

/** Minimum SOL to send to ephemeral account to cover registration + withdrawal fees */
export const EPHEMERAL_SOL_BUFFER = 0.018;
