/**
 * Solana Web3.js helpers.
 *
 * Thin wrappers for operations not covered by the Umbra SDK:
 * - Funding the ephemeral account with SOL before registration
 * - Checking SOL/SPL balances
 * - Querying the Umbra relayer's supported mints (useful for devnet mint discovery)
 */

"use client";

import {
  Connection,
  SystemProgram,
  Transaction,
  PublicKey,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import type { Wallet, WalletAccount } from "@wallet-standard/core";
import { getUmbraRelayer } from "@umbra-privacy/sdk";
import { RPC_URL, EPHEMERAL_SOL_BUFFER, UMBRA_RELAYER_URL } from "./constants";
import { log, warn } from "./logger";

function getConnection(): Connection {
  return new Connection(RPC_URL, "confirmed");
}

/**
 * Transfer SOL from the sender to the ephemeral account so it can pay for
 * Umbra registration fees and on-chain account rent.
 *
 * Skips the transfer if the ephemeral already has sufficient balance.
 */
export async function fundEphemeral(
  senderWallet: Wallet,
  senderAccount: WalletAccount,
  ephemeralAddress: string
): Promise<void> {
  const connection = getConnection();
  const senderPubkey = new PublicKey(senderAccount.address);
  const ephemeralPubkey = new PublicKey(ephemeralAddress);

  const required = Math.round(EPHEMERAL_SOL_BUFFER * LAMPORTS_PER_SOL);
  let existing = 0;
  for (let i = 0; i < 5; i++) {
    try {
      existing = await connection.getBalance(ephemeralPubkey, "confirmed");
      break;
    } catch (e) {
      if (i === 4) throw e;
      warn(`[fundEphemeral] getBalance timeout, retrying in 3s... (${i + 1}/5)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (existing >= required) return;

  const lamports = required - existing;

  const signFeature = senderWallet.features["solana:signTransaction"] as {
    signTransaction: (
      ...inputs: readonly { account: WalletAccount; transaction: Uint8Array }[]
    ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
  };

  // Get blockhash with "confirmed" commitment — gives a fresher blockhash than
  // "finalized" (~30 slots newer, ~12 more seconds before lastValidBlockHeight).
  // "finalized" was causing expiry when the Phantom approval dialog took > ~40s.
  const getBh = async () => {
    for (let i = 0; i < 5; i++) {
      try {
        return await connection.getLatestBlockhash("confirmed");
      } catch (e) {
        if (i === 4) throw e;
        warn(`[fundEphemeral] getLatestBlockhash timeout, retrying (${i + 1}/5)…`);
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    throw new Error("Failed to fetch blockhash after 5 attempts");
  };

  // Sign once — blockhash embedded at signing time.
  // We do NOT re-sign on retry; instead we reuse the signed bytes and submit
  // with a fresh confirmation context. If the blockhash expired we get a new
  // one and ask the wallet to sign again (one extra prompt at most).
  let signedTransaction: Uint8Array = new Uint8Array(0);
  let blockhash = "";
  let lastValidBlockHeight = 0;

  const buildAndSign = async () => {
    const bh = await getBh();
    blockhash = bh.blockhash;
    lastValidBlockHeight = bh.lastValidBlockHeight;
    const tx = new Transaction().add(
      SystemProgram.transfer({ fromPubkey: senderPubkey, toPubkey: ephemeralPubkey, lamports })
    );
    tx.feePayer = senderPubkey;
    tx.recentBlockhash = blockhash;
    // Serialize to Uint8Array — Buffer (Node polyfill) can confuse some wallets.
    const txBytes = new Uint8Array(tx.serialize({ requireAllSignatures: false }));
    const results = await signFeature.signTransaction({ account: senderAccount, transaction: txBytes });
    signedTransaction = results[0].signedTransaction;
  };

  await buildAndSign();

  // Submit and confirm. On blockhash expiry, refresh and retry once — the user
  // won't see an extra prompt since we only retry submission, not signing.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const sig = await connection.sendRawTransaction(signedTransaction, { skipPreflight: true });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      return; // success
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("already been processed")) {
        const newBalance = await connection.getBalance(ephemeralPubkey, "confirmed");
        if (newBalance >= required) return;
      }
      // Blockhash expired — get a fresh one and re-sign, then retry once more.
      if (attempt < 2 && (msg.includes("block height exceeded") || msg.includes("Blockhash not found"))) {
        warn("[fundEphemeral] blockhash expired, refreshing and retrying…");
        await buildAndSign();
        continue;
      }
      throw e;
    }
  }
}

/** Return the SOL balance (in SOL) for any address. */
export async function getSolBalance(address: string): Promise<number> {
  const connection = getConnection();
  const lamports = await connection.getBalance(new PublicKey(address), "confirmed");
  return lamports / LAMPORTS_PER_SOL;
}

/**
 * Fetch the list of mint addresses the Umbra relayer supports.
 * Useful for discovering the correct devnet USDC mint address.
 *
 * @example
 * const mints = await fetchRelayerSupportedMints();
 * console.log("Umbra devnet mints:", mints);
 */
export async function fetchRelayerSupportedMints(): Promise<string[]> {
  const relayer = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER_URL });
  const { mints } = await relayer.getSupportedMints();
  return [...mints];
}
