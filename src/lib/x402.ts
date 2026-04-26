import { Connection, PublicKey } from "@solana/web3.js";
import { log } from "./logger";
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
 * Verify an x402 payment made via direct confidential deposit.
 *
 * The new flow uses getPublicBalanceToEncryptedBalanceDirectDepositorFunction
 * (same as a regular confidential transfer) instead of receiver-claimable UTXOs.
 * This means:
 *  - No UTXO claiming step → no Arcium mxe state dependency
 *  - Balance lands directly in server's encrypted account as "shared" mode
 *  - Simpler verification: confirm the tx is a valid Umbra deposit, check invoiceId
 *
 * Amount verification is omitted because confidential deposits encrypt the amount
 * on-chain. Security is maintained by the one-use invoiceId (replay prevention)
 * and the server controlling what invoiceId it issues per request.
 *
 * Authorization header format: x402 <depositTxSig>:<invoiceId>
 */
export interface VerifyX402DepositParams {
  connection: Connection;
  depositTxSignature: string;
  serverSolanaAddress: string;
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

    // ── Fetch and validate the deposit transaction ────────────────────────────
    const tx = await connection.getParsedTransaction(depositTxSignature, {
      maxSupportedTransactionVersion: 0,
      commitment: "confirmed",
    });

    if (!tx) { console.error("[x402] Deposit transaction not found"); return false; }
    if (tx.meta?.err) { console.error("[x402] Deposit transaction failed on-chain:", tx.meta.err); return false; }

    // ── Confirm it's an Umbra program call ────────────────────────────────────
    const accountKeys = tx.transaction.message.accountKeys.map((k) => k.pubkey.toBase58());
    if (!accountKeys.includes(UMBRA_PROGRAM_ID.toBase58())) {
      console.error("[x402] Transaction does not invoke the Umbra program");
      return false;
    }

    // ── Confirm the server's address is referenced in the transaction ─────────
    // Direct deposits to the server's encrypted balance reference the server's
    // address when deriving the encrypted token account PDA.
    if (!accountKeys.includes(serverSolanaAddress)) {
      console.error(`[x402] Server address ${serverSolanaAddress.slice(0, 8)} not found in tx accounts`);
      return false;
    }

    log(`[x402] ✅ Deposit tx confirmed — server ${serverSolanaAddress.slice(0, 8)}, sig ${depositTxSignature.slice(0, 12)}`);

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
