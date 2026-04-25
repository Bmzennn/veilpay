export type Token = "SOL" | "USDC" | "USDT" | "BONK" | "JUP" | "WIF";
export type PaymentMode = "general" | "locked";
export type TransferType = "link" | "confidential";

export type LinkStep = "input" | "funding" | "registering" | "creating" | "done";
export type ClaimStep = "scanning" | "preview" | "claiming" | "done";
export type ConfidentialStep = "input" | "sending" | "done";

export interface PaymentLinkMeta {
  id: string;
  amount: string;
  token: Token;
  decimals: number;
  amountRaw: string;
  createdAt: number;
  expiresAt: number;
  claimed: boolean;
  lockedTo?: string;
}

export interface TxResult {
  signature: string;
  status: "pending" | "confirmed" | "failed";
}
