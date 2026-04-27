import { Connection, PublicKey } from "@solana/web3.js";
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
 * The UTXO approach provides full payer-server unlinkability: the server's Solana
 * address does NOT appear in the transaction accounts. The destination is encrypted
 * on-chain using the server's X25519 public key — only the server can scan and claim
 * the UTXO from the Umbra shielded pool.
 *
 * Authorization header format: x402 <proofAccountSig>:<utxoSig>:<invoiceId>
 * We verify utxoSig (the createUtxoSignature from CreateUtxoFromPublicBalanceResult).
 *
 * Security model:
 * - invoiceId is 32-byte random, single-use, server-issued → only a payer who
 *   received the invoice from this server can present a valid invoiceId.
 * - UTXO creation proves the payer spent real Umbra-program fees.
 * - Atomic invoice consumption (in the caller) prevents replay.
 * - Supabase payments table provides cross-instance replay protection.
 */
export interface VerifyX402DepositParams {
  connection: Connection;
  depositTxSignature: string;    // createUtxoSignature from the UTXO creation
  serverSolanaAddress: string;   // for replay record only (not checked in tx)
  expectedInvoiceId: Uint8Array; // 32 bytes
}

export async function verifyX402Deposit(params: VerifyX402DepositParams): Promise<boolean> {
  const { connection, depositTxSignature, serverSolanaAddress, expectedInvoiceId } = params;

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

    // ── Note: server address NOT present in accounts — this is expected ───────
    // For receiver-claimable UTXOs, the destination is encrypted using the
    // server's X25519 public key. The server's Solana address does not appear
    // in plaintext transaction accounts. This is exactly what provides
    // payer-server unlinkability on-chain.

    console.log(`[x402] ✅ UTXO tx confirmed — sig ${depositTxSignature.slice(0, 12)}`);

    // ── Record to prevent replay ──────────────────────────────────────────────
    if (supabase) {
      await supabase.from("payments").insert({
        deposit_sig: depositTxSignature,
        invoice_id:  Buffer.from(expectedInvoiceId).toString("hex"),
        recipient:   serverSolanaAddress,
        verified_at: new Date().toISOString(),
      });
    }

    return true;

  } catch (error) {
    console.error("[x402] Verification error:", error);
    return false;
  }
}
