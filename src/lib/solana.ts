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
      console.warn(`[fundEphemeral] getBalance timeout, retrying in 3s... (${i + 1}/5)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  if (existing >= required) return;

  const lamports = required - existing;

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: senderPubkey, toPubkey: ephemeralPubkey, lamports })
  );
  tx.feePayer = senderPubkey;
  let blockhash = "", lastValidBlockHeight = 0;
  for (let i = 0; i < 5; i++) {
    try {
      const res = await connection.getLatestBlockhash("finalized");
      blockhash = res.blockhash;
      lastValidBlockHeight = res.lastValidBlockHeight;
      break;
    } catch (e) {
      if (i === 4) throw e;
      console.warn(`[fundEphemeral] getLatestBlockhash timeout, retrying in 3s... (${i + 1}/5)`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  tx.recentBlockhash = blockhash;

  // Wallet Standard signTransaction uses rest params (...inputs), not an array arg.
  // Passing an array directly wraps it as the first rest element and produces
  // a non-iterable result. Spread the single input as a positional argument instead.
  const signFeature = senderWallet.features["solana:signTransaction"] as {
    signTransaction: (
      ...inputs: readonly { account: WalletAccount; transaction: Uint8Array }[]
    ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
  };

  // Serialize to Uint8Array explicitly — Buffer (Node polyfill) can confuse some wallets.
  const txBytes = new Uint8Array(tx.serialize({ requireAllSignatures: false }));
  const results = await signFeature.signTransaction({ account: senderAccount, transaction: txBytes });
  const { signedTransaction } = results[0];

  try {
    const sig = await connection.sendRawTransaction(signedTransaction, { skipPreflight: false, maxRetries: 0 });
    await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("already been processed")) {
      // A previous attempt confirmed this exact transaction — verify balance is now sufficient.
      const newBalance = await connection.getBalance(ephemeralPubkey, "confirmed");
      if (newBalance >= required) return;
    }
    throw e;
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
