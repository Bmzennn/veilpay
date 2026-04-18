"use client";

/**
 * Wallet Standard integration.
 *
 * Uses @wallet-standard/app directly (no wallet adapter abstraction)
 * so we can pass native WalletAccount objects to createSignerFromWalletAccount.
 */

import { getWallets } from "@wallet-standard/app";
import type { Wallet, WalletAccount } from "@wallet-standard/core";

const REQUIRED_FEATURES = [
  "solana:signTransaction",
  "solana:signMessage",
  "standard:connect",
  "standard:disconnect",
] as const;

/** Return wallets that support the Umbra-required feature set. */
export function getCompatibleWallets(): Wallet[] {
  const { get } = getWallets();
  return get().filter((w) =>
    REQUIRED_FEATURES.every((f) => f in w.features)
  );
}

/** Connect to a wallet and return the first account. */
export async function connectWallet(
  wallet: Wallet
): Promise<WalletAccount | null> {
  const connectFeature = wallet.features["standard:connect"] as {
    connect: () => Promise<{ accounts: WalletAccount[] }>;
  };
  const { accounts } = await connectFeature.connect();
  return accounts[0] ?? null;
}

/** Disconnect from a wallet. */
export async function disconnectWallet(wallet: Wallet): Promise<void> {
  const disconnectFeature = wallet.features["standard:disconnect"] as {
    disconnect: () => Promise<void>;
  } | undefined;
  await disconnectFeature?.disconnect();
}

/** Short form display of a base58 address. */
export function shortAddress(address: string): string {
  if (address.length < 12) return address;
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}
