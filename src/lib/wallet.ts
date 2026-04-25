"use client";

/**
 * Wallet Standard integration with Phantom fallback.
 *
 * Discovery priority:
 *  1. Wallet Standard (wallet-standard:app-ready / register events)
 *  2. window.phantom.solana  (Phantom's legacy injection)
 *  3. window.solana          (older legacy injection)
 */

import type { Wallet, WalletAccount } from "@wallet-standard/core";

const REQUIRED_FEATURES = [
  "solana:signTransaction",
  "solana:signMessage",
  "standard:connect",
  "standard:disconnect",
] as const;

function isCompatible(w: Wallet): boolean {
  return REQUIRED_FEATURES.every((f) => f in w.features);
}

/** Return all compatible Wallet Standard wallets. Must be called client-side. */
export function getCompatibleWallets(): Wallet[] {
  if (typeof window === "undefined") return [];
  // Dynamic import of getWallets to ensure it only runs in the browser.
  // We call it synchronously here because by the time this function is
  // invoked (inside a useEffect), the module has already been evaluated
  // client-side and the singleton is live.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getWallets } = require("@wallet-standard/app") as {
      getWallets: () => { get: () => Wallet[]; on: (event: string, cb: (...w: Wallet[]) => void) => () => void };
    };
    return getWallets().get().filter(isCompatible);
  } catch {
    return [];
  }
}

/**
 * Subscribe to wallet registration events. Returns an unsubscribe function.
 * Must be called client-side.
 */
export function subscribeWallets(
  onRegister: () => void,
  onUnregister: () => void
): () => void {
  if (typeof window === "undefined") return () => {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getWallets } = require("@wallet-standard/app") as {
      getWallets: () => { get: () => Wallet[]; on: (event: string, cb: (...w: Wallet[]) => void) => () => void };
    };
    const { on } = getWallets();
    const offReg = on("register", onRegister);
    const offUnreg = on("unregister", onUnregister);
    return () => { offReg(); offUnreg(); };
  } catch {
    return () => {};
  }
}

/**
 * Try to get a Phantom-compatible wallet account even when the Wallet Standard
 * registration hasn't fired (e.g. very early page loads or extension timing issues).
 * Returns a synthesized Wallet-like object if found, null otherwise.
 */
export function getPhantomFallback(): Wallet | null {
  if (typeof window === "undefined") return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phantom = (window as any).phantom?.solana ?? (window as any).solana;
  if (!phantom?.isPhantom) return null;

  // Build a minimal Wallet Standard–compatible shim around the legacy API.
  const shim: Wallet = {
    version: "1.0.0" as const,
    name: "Phantom",
    icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" as `data:image/${"svg+xml" | "webp" | "png" | "gif"};base64,${string}`,
    chains: ["solana:devnet", "solana:mainnet-beta"],
    features: {
      "standard:connect": {
        version: "1.0.0" as const,
        connect: async () => {
          const resp = await phantom.connect();
          const pubkey: string = resp.publicKey.toString();
          const account: WalletAccount = {
            address: pubkey as `${string}`,
            publicKey: new Uint8Array(phantom.publicKey.toBytes()),
            chains: ["solana:devnet", "solana:mainnet-beta"],
            features: ["solana:signTransaction", "solana:signMessage", "standard:connect", "standard:disconnect"],
          };
          return { accounts: [account] };
        },
      },
      "standard:disconnect": {
        version: "1.0.0" as const,
        disconnect: async () => { await phantom.disconnect(); },
      },
      "solana:signTransaction": {
        version: "1.0.0" as const,
        signTransaction: async (...inputs: readonly { account: WalletAccount; transaction: Uint8Array }[]) => {
          const results = await Promise.all(
            inputs.map(async ({ transaction }) => {
              const signed = await phantom.signTransaction({ serialize: () => transaction });
              return { signedTransaction: signed.serialize() as Uint8Array };
            })
          );
          return results;
        },
      },
      "solana:signMessage": {
        version: "1.0.0" as const,
        signMessage: async (...inputs: readonly { account: WalletAccount; message: Uint8Array }[]) => {
          const results = await Promise.all(
            inputs.map(async ({ message }) => {
              const { signature } = await phantom.signMessage(message, "utf8");
              return { signature: signature as Uint8Array };
            })
          );
          return results;
        },
      },
    } as Wallet["features"],
    accounts: [],
  };

  return shim;
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
