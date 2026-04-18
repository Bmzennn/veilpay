export type Token = "USDC" | "SOL";
export type PaymentMode = "general" | "locked";

export type LinkStep = "input" | "funding" | "registering" | "creating" | "done";
export type ClaimStep = "scanning" | "preview" | "claiming" | "done";

export interface PaymentLinkMeta {
  id: string;
  amount: string;       // human-readable, e.g. "50"
  token: Token;
  decimals: number;
  amountRaw: string;    // bigint as string, e.g. "50000000"
  createdAt: number;    // unix ms
  expiresAt: number;    // unix ms
  claimed: boolean;
  lockedTo?: string;    // recipient wallet address for wallet-locked links
}

export interface TxResult {
  signature: string;
  status: "pending" | "confirmed" | "failed";
}
