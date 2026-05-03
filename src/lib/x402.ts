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

const SOL_MINT = "So11111111111111111111111111111111111111112";

/**
 * Verify an x402 payment made via receiver-claimable UTXO (shielded deposit).
 *
 * Security model:
 * - invoiceId is 32-byte random, single-use, server-issued → only a payer who
 *   received the invoice from this server can present a valid invoiceId.
 * - SOL payments: amount verified by summing the fee-payer's native balance
 *   delta across both txs (proof account creation + UTXO creation). Checking
 *   only the deposit tx underreports the total spend.
 * - SPL token payments (USDC etc.): amount verified via the payer's token
 *   balance delta in the deposit tx using preTokenBalances/postTokenBalances.
 * - Atomic invoice consumption in the caller prevents replay.
 * - Supabase payments table provides cross-instance replay protection.
 */
export interface VerifyX402DepositParams {
  connection: Connection;
  proofTxSignature: string;      // createProofAccountSignature from the UTXO creation
  depositTxSignature: string;    // createUtxoSignature from the UTXO creation
  serverSolanaAddress: string;   // for replay record only (not checked in tx)
  expectedInvoiceId: Uint8Array; // 32 bytes
  expectedAmount: number;        // in token units (e.g. 0.1 SOL, 1.0 USDC)
  expectedToken: string;         // token symbol, e.g. "SOL" or "USDC"
  expectedMint: string;          // token mint address
  expectedDecimals: number;      // 9 for SOL, 6 for USDC
}

export async function verifyX402Deposit(params: VerifyX402DepositParams): Promise<boolean> {
  const {
    connection,
    proofTxSignature,
    depositTxSignature,
    serverSolanaAddress,
    expectedInvoiceId,
    expectedAmount,
    expectedToken,
    expectedMint,
    expectedDecimals,
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
    // creation. Both must succeed and the deposit tx must invoke the Umbra program.
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

    // ── Verify payment amount ─────────────────────────────────────────────────
    const payerAddress = accountKeys[0]; // fee payer is always index 0 (Solana guarantee)
    const isSol = expectedMint === SOL_MINT;

    let amountVerified = false;

    if (isSol) {
      // SOL: sum native lamport delta across both txs. The total spend is split
      // between proof account rent and the UTXO deposit itself.
      const proofDelta   = (proofTx.meta?.preBalances?.[0]   ?? 0) - (proofTx.meta?.postBalances?.[0]   ?? 0);
      const depositDelta = (depositTx.meta?.preBalances?.[0] ?? 0) - (depositTx.meta?.postBalances?.[0] ?? 0);
      const payerSpentLamports = proofDelta + depositDelta;
      const requiredLamports   = Math.round(expectedAmount * LAMPORTS_PER_SOL);

      if (payerSpentLamports < requiredLamports) {
        console.error(
          `[x402] SOL underpayment: payer spent ${payerSpentLamports} lamports across both txs, ` +
          `required >= ${requiredLamports} (${expectedAmount} SOL)`
        );
        return false;
      }
      console.log(
        `[x402] ✅ SOL amount verified: ${payerSpentLamports} lamports spent ` +
        `(required ${requiredLamports}) — deposit sig ${depositTxSignature.slice(0, 12)}`
      );
      amountVerified = true;
    } else {
      // SPL token (USDC etc.): check payer's token balance delta in the deposit tx.
      // The proof tx only moves SOL for rent; token transfer happens in the deposit tx.
      const pre  = (depositTx.meta?.preTokenBalances  ?? []).find(
        (b) => b.owner === payerAddress && b.mint === expectedMint
      );
      const post = (depositTx.meta?.postTokenBalances ?? []).find(
        (b) => b.owner === payerAddress && b.mint === expectedMint
      );

      if (!pre) {
        console.error(`[x402] No pre-balance found for payer's ${expectedToken} account in deposit tx`);
        return false;
      }

      const payerSpentRaw  = BigInt(pre.uiTokenAmount.amount) - BigInt(post?.uiTokenAmount.amount ?? "0");
      const requiredRaw    = BigInt(Math.round(expectedAmount * 10 ** expectedDecimals));

      if (payerSpentRaw < requiredRaw) {
        console.error(
          `[x402] ${expectedToken} underpayment: payer spent ${payerSpentRaw} raw units, ` +
          `required >= ${requiredRaw} (${expectedAmount} ${expectedToken})`
        );
        return false;
      }
      console.log(
        `[x402] ✅ ${expectedToken} amount verified: ${payerSpentRaw} raw units spent ` +
        `(required ${requiredRaw}) — deposit sig ${depositTxSignature.slice(0, 12)}`
      );
      amountVerified = true;
    }

    if (!amountVerified) return false;

    // ── Record to prevent replay ──────────────────────────────────────────────
    await supabase!.from("payments").insert({
      deposit_sig:  depositTxSignature,
      proof_sig:    proofTxSignature,
      invoice_id:   Buffer.from(expectedInvoiceId).toString("hex"),
      recipient:    serverSolanaAddress,
      token:        expectedToken,
      amount:       expectedAmount,
      verified_at:  new Date().toISOString(),
    });

    return true;

  } catch (error) {
    console.error("[x402] Verification error:", error);
    return false;
  }
}
