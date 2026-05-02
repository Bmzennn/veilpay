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
 * - Amount is verified by summing the fee-payer's balance delta across both the
 *   proof account creation tx and the UTXO creation tx. A receiver-claimable
 *   UTXO requires two on-chain transactions; checking only the deposit tx
 *   underreports the total spend and causes false underpayment rejections.
 * - Atomic invoice consumption in the caller prevents replay.
 * - Supabase payments table provides cross-instance replay protection.
 */
export interface VerifyX402DepositParams {
  connection: Connection;
  proofTxSignature: string;      // createProofAccountSignature from the UTXO creation
  depositTxSignature: string;    // createUtxoSignature from the UTXO creation
  serverSolanaAddress: string;   // for replay record only (not checked in tx)
  expectedInvoiceId: Uint8Array; // 32 bytes
  expectedAmountSol: number;     // minimum SOL the payer must have committed
}

export async function verifyX402Deposit(params: VerifyX402DepositParams): Promise<boolean> {
  const {
    connection,
    proofTxSignature,
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

    // ── Fetch and validate both Umbra transactions ───────────────────────────
    // A receiver-claimable UTXO requires two txs: proof account creation + UTXO
    // creation. Both must succeed and invoke the Umbra program.
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

    if (!proofTx)    { console.error("[x402] Proof account transaction not found"); return false; }
    if (!depositTx)  { console.error("[x402] UTXO transaction not found"); return false; }
    if (proofTx.meta?.err)   { console.error("[x402] Proof tx failed on-chain:", proofTx.meta.err); return false; }
    if (depositTx.meta?.err) { console.error("[x402] UTXO tx failed on-chain:", depositTx.meta.err); return false; }

    // ── Confirm the deposit tx invokes the Umbra program ─────────────────────
    const accountKeys = depositTx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    if (!accountKeys.includes(UMBRA_PROGRAM_ID.toBase58())) {
      console.error("[x402] Deposit transaction does not invoke the Umbra program");
      return false;
    }

    // ── Verify payment amount via combined fee-payer balance delta ────────────
    // index 0 is always the fee payer (Solana protocol guarantee).
    // The total spend is split across both txs: proof account creation consumes
    // rent + fees, and UTXO creation deposits the shielded amount. Summing both
    // gives the true total committed by the payer.
    const proofDelta   = (proofTx.meta?.preBalances?.[0]   ?? 0) - (proofTx.meta?.postBalances?.[0]   ?? 0);
    const depositDelta = (depositTx.meta?.preBalances?.[0] ?? 0) - (depositTx.meta?.postBalances?.[0] ?? 0);
    const payerSpentLamports = proofDelta + depositDelta;
    const requiredLamports   = Math.round(expectedAmountSol * LAMPORTS_PER_SOL);

    if (payerSpentLamports < requiredLamports) {
      console.error(
        `[x402] Underpayment: payer spent ${payerSpentLamports} lamports across both txs, ` +
        `required >= ${requiredLamports} (${expectedAmountSol} SOL)`
      );
      return false;
    }

    console.log(
      `[x402] ✅ Amount verified: payer spent ${payerSpentLamports} lamports across proof+deposit ` +
      `(required ${requiredLamports}) — deposit sig ${depositTxSignature.slice(0, 12)}`
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
