import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSupabaseServiceClient } from "./supabase";
import { NETWORK } from "./constants";
import bs58 from "bs58";

const UMBRA_PROGRAM_IDS = {
  mainnet: "UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh",
  devnet:  "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ",
} as const;

const UMBRA_PROGRAM_ID = new PublicKey(
  UMBRA_PROGRAM_IDS[NETWORK as "mainnet" | "devnet"] ?? UMBRA_PROGRAM_IDS.devnet
);

// Umbra instruction discriminators (from @umbra-privacy/umbra-codama)
const PROOF_BUFFER_DISCRIMINATOR = Buffer.from([139, 135, 169, 216, 228, 15, 104, 98]);
const DEPOSIT_DISCRIMINATOR      = Buffer.from([232, 133, 25, 16, 203, 167, 3, 3]);

/**
 * Verify an x402 payment made via receiver-claimable UTXO (shielded deposit).
 *
 * Security model:
 * 1. Fetch both the proof creation and the actual deposit transactions.
 * 2. Verify both transactions succeeded on-chain.
 * 3. Verify the proof transaction contains the unique random invoiceId in its optionalData.
 * 4. Verify the deposit transaction specifies the correct payment amount.
 * 5. Track used signatures in Supabase to prevent replay.
 */
export interface VerifyX402DepositParams {
  connection: Connection;
  proofTxSignature: string;      // createProofAccountSignature from the SDK
  depositTxSignature: string;    // createUtxoSignature from the SDK
  serverSolanaAddress: string;   // the recipient address (public key)
  expectedInvoiceId: Uint8Array; // 32-byte random invoice ID
  /** Expected deposit amount in raw token base units (lamports for SOL, 6-decimal for USDC, etc.) */
  expectedAmount: number;
  /** Human-readable token symbol for logging (e.g. "SOL", "USDC") */
  expectedToken?: string;
  /** @deprecated use expectedAmount — kept for backward compat */
  expectedAmountSol?: number;
}

export async function verifyX402Deposit(params: VerifyX402DepositParams): Promise<boolean> {
  const {
    connection,
    proofTxSignature,
    depositTxSignature,
    serverSolanaAddress,
    expectedInvoiceId,
    expectedToken = "SOL",
  } = params;
  // Support both new expectedAmount and legacy expectedAmountSol
  const expectedAmount = params.expectedAmount ?? (params.expectedAmountSol! * LAMPORTS_PER_SOL);

  try {
    const supabase = getSupabaseServiceClient();

    // ── Replay protection ────────────────────────────────────────────────────
    if (supabase) {
      const { data: existing } = await supabase
        .from("payments")
        .select("id")
        .eq("deposit_sig", depositTxSignature)
        .single();
      if (existing) {
        console.error(`[x402] Replay attempt — sig ${depositTxSignature.slice(0, 12)} already used`);
        return false;
      }
    } else {
      console.error("[x402] Supabase not configured — cannot check replay. Rejecting payment.");
      return false;
    }

    // ── Fetch transactions ───────────────────────────────────────────────────
    const [proofTx, depositTx] = await Promise.all([
      connection.getParsedTransaction(proofTxSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      }),
      connection.getParsedTransaction(depositTxSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed",
      }),
    ]);

    if (!proofTx)   { console.error("[x402] Proof transaction not found"); return false; }
    if (!depositTx) { console.error("[x402] Deposit transaction not found"); return false; }
    
    if (proofTx.meta?.err)   { console.error("[x402] Proof transaction failed:", proofTx.meta.err); return false; }
    if (depositTx.meta?.err) { console.error("[x402] Deposit transaction failed:", depositTx.meta.err); return false; }

    // ── Verify Proof Transaction (contains invoiceId) ────────────────────────
    let invoiceFound = false;
    for (const ix of proofTx.transaction.message.instructions) {
      if (!("data" in ix) || ix.programId.toBase58() !== UMBRA_PROGRAM_ID.toBase58()) continue;
      
      const data = Buffer.from(bs58.decode(ix.data));
      // Check if it's the CreatePublicStealthPoolDepositInputBuffer instruction
      if (!data.subarray(0, 8).equals(PROOF_BUFFER_DISCRIMINATOR)) continue;

      // The invoiceId (32 bytes) is the last field (optionalData) in this instruction.
      const optionalData = data.subarray(data.length - 32);
      if (optionalData.equals(expectedInvoiceId)) {
        invoiceFound = true;
        break;
      }
    }

    if (!invoiceFound) {
      console.error("[x402] Invoice ID not found in proof transaction data");
      return false;
    }

    // ── Verify Deposit Transaction (contains amount in raw token base units) ────
    let amountVerified = false;
    const expectedRaw = BigInt(Math.round(expectedAmount));

    for (const ix of depositTx.transaction.message.instructions) {
      if (!("data" in ix) || ix.programId.toBase58() !== UMBRA_PROGRAM_ID.toBase58()) continue;

      const data = Buffer.from(bs58.decode(ix.data));
      if (!data.subarray(0, 8).equals(DEPOSIT_DISCRIMINATOR)) continue;

      // The transferAmount (8 bytes, u64 little-endian) is the last field in this instruction.
      const amountBytes = data.subarray(data.length - 8);
      const amountRaw = amountBytes.readBigUInt64LE();

      if (amountRaw >= expectedRaw) {
        amountVerified = true;
        break;
      }
    }

    if (!amountVerified) {
      console.error(`[x402] Payment amount not verified — expected ${expectedRaw} raw ${expectedToken} units`);
      return false;
    }

    console.log(
      `[x402] ✅ Payment verified! invoice: ${Buffer.from(expectedInvoiceId).toString("hex").slice(0, 12)}... ` +
      `amount: ${expectedAmount} ${expectedToken} (raw units)`
    );

    // ── Record to prevent replay ──────────────────────────────────────────────
    await supabase!.from("payments").insert({
      deposit_sig:  depositTxSignature,
      proof_sig:    proofTxSignature,
      invoice_id:   Buffer.from(expectedInvoiceId).toString("hex"),
      recipient:    serverSolanaAddress,
      amount_sol:   expectedAmount,   // stored as raw units
      verified_at:  new Date().toISOString(),
    });

    return true;

  } catch (error) {
    console.error("[x402] Verification error:", error);
    return false;
  }
}
