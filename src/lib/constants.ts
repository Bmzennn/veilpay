import type { Token } from "@/types";

export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.mainnet-beta.solana.com";

export const RPC_WS_URL =
  process.env.NEXT_PUBLIC_RPC_WS_URL ?? "wss://api.mainnet-beta.solana.com";

export const NETWORK =
  (process.env.NEXT_PUBLIC_NETWORK as "mainnet" | "devnet" | "localnet") ??
  "mainnet";

export const UMBRA_INDEXER_URL =
  process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL ??
  (typeof window !== "undefined"
    ? "/api/indexer-proxy"
    : NETWORK === "mainnet"
    ? "https://utxo-indexer.api.umbraprivacy.com"
    : "https://utxo-indexer.api-devnet.umbraprivacy.com");

export const UMBRA_RELAYER_URL =
  process.env.NEXT_PUBLIC_UMBRA_RELAYER_URL ??
  "https://relayer.api.umbraprivacy.com";

export const LINK_EXPIRY_DAYS = Number(
  process.env.NEXT_PUBLIC_LINK_EXPIRY_DAYS ?? 7
);

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
  UMBRA: {
    mint: "PRVT6TB7uss3FrUd2D9xs2zqDBsa3GbMJMwCQsgmeta",
    decimals: 6,
    symbol: "UMBRA",
    name: "Umbra",
    color: "#7C3AED",
  },
  CASH: {
    mint: "CASHx9KJUStyftLFWGvEVf59SGeG9sh5FfcnZMVPCASH",
    decimals: 6,
    symbol: "CASH",
    name: "CASH",
    color: "#00C98D",
  },
};

/** Minimum SOL to send to ephemeral account to cover registration + withdrawal fees.
 *  Net protocol cost is ~0.003 SOL, but peak concurrent rent during registration
 *  is ~0.012 SOL — the buffer must cover the peak, not the net. Excess is swept
 *  to the overage wallet after the link is claimed. */
export const EPHEMERAL_SOL_BUFFER = 0.020;
