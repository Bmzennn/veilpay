import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getSupabaseServiceClient } from "./supabase";
import { NETWORK } from "./constants";

const UMBRA_PROGRAM_IDS = {
  mainnet: "UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh",
  devnet:  "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ",
} as const;

const UMBRA_PROGRAM_ID = new PublicKey(
  UMBRA_PROGRAM_IDS[NETWORK as "mainnet" | "devnet"] ?? UMBRA_PROGRAM_IDS.devnet
);

/**
 * Verify an x402 payment made via receiver-claimable UTXO (shielded deposit).
 *
 * Security model:
 * - invoiceId is 32-byte random, single-use, server-issued → only a payer who
 *   received the invoice from this server can present a valid invoiceId.
 * - Amount is verified via the fee-payer's on-chain balance delta: the payer's
 *   SOL balance must decrease by at least expectedAmountSol (the UTXO deposit
 *   amount dominates this delta; Solana tx fees add ~0.000005 SOL on top).
 * - Atomic invoice consumption in the caller prevents replay.
 * - Supabase payments table provides cross-instance replay protection.
 */
export interface VerifyX402DepositParams {
  connection: Connection;
  depositTxSignature: string;    // createUtxoSignature from the UTXO creation
  serverSolanaAddress: string;   // for replay record only (not checked in tx)
  expectedInvoiceId: Uint8Array; // 32 bytes
  expectedAmountSol: number;     // minimum SOL the payer must have committed
}

export async function verifyX402Deposit(params: VerifyX402DepositParams): Promise<boolean> {
  const {
    connection,
    depositTxSignature,
    serverSolanaAddress,
    expectedInvoiceId,
    expectedAmountSol,
  } = params;

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
      // Supabase not configured: block rather than proceed without replay protection.
      console.error("[x402] Supabase not configured — cannot check replay. Rejecting payment.");
      return false;
    }

    // ── Fetch and validate the UTXO creation transaction ─────────────────────
    const tx = await connection.getParsedTransaction(depositTxSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) { console.error("[x402] UTXO transaction not found"); return false; }
    if (tx.meta?.err) { console.error("[x402] UTXO transaction failed on-chain:", tx.meta.err); return false; }

    // ── Confirm it's an Umbra program call ────────────────────────────────────
    const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    if (!accountKeys.includes(UMBRA_PROGRAM_ID.toBase58())) {
      console.error("[x402] Transaction does not invoke the Umbra program");
      return false;
    }

    // ── Verify payment amount via fee-payer balance delta ─────────────────────
    // index 0 in accountKeys is always the fee payer (Solana protocol guarantee).
    // The delta = UTXO deposit amount + Solana tx fee (~5000 lamports).
    // If the attacker deposited less than the required amount, this check fails.
    const preBalance  = tx.meta?.preBalances?.[0]  ?? 0;
    const postBalance = tx.meta?.postBalances?.[0] ?? 0;
    const payerSpentLamports = preBalance - postBalance;
    const requiredLamports   = Math.round(expectedAmountSol * LAMPORTS_PER_SOL);

    if (payerSpentLamports < requiredLamports) {
      console.error(
        `[x402] Underpayment: payer spent ${payerSpentLamports} lamports, ` +
        `required >= ${requiredLamports} (${expectedAmountSol} SOL)`
      );
      return false;
    }

    console.log(
      `[x402] ✅ Amount verified: payer spent ${payerSpentLamports} lamports ` +
      `(required ${requiredLamports}) — sig ${depositTxSignature.slice(0, 12)}`
    );

    // ── Record to prevent replay ──────────────────────────────────────────────
    await supabase!.from("payments").insert({
      deposit_sig:  depositTxSignature,
      invoice_id:   Buffer.from(expectedInvoiceId).toString("hex"),
      recipient:    serverSolanaAddress,
      amount_sol:   expectedAmountSol,
      verified_at:  new Date().toISOString(),
    });

    return true;

  } catch (error) {
    console.error("[x402] Verification error:", error);
    return false;
  }
}
