"use client";

/**
 * Wallet context using @wallet-standard/app directly.
 * This avoids the @solana/wallet-adapter type mismatch with @solana/kit.
 * The Umbra SDK's createSignerFromWalletAccount expects native WalletAccount objects.
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Wallet, WalletAccount } from "@wallet-standard/core";
import {
  getCompatibleWallets,
  connectWallet,
  disconnectWallet,
  shortAddress,
} from "@/lib/wallet";

interface WalletContextValue {
  wallets: Wallet[];
  wallet: Wallet | null;
  account: WalletAccount | null;
  connected: boolean;
  connecting: boolean;
  address: string | null;
  displayAddress: string | null;
  connect: (wallet: Wallet) => Promise<void>;
  disconnect: () => Promise<void>;
  selectWallet: (wallet: Wallet) => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [connecting, setConnecting] = useState(false);

  // Discover wallets on mount (client-only)
  useEffect(() => {
    setWallets(getCompatibleWallets());
  }, []);

  const connect = useCallback(async (w: Wallet) => {
    setConnecting(true);
    try {
      const acc = await connectWallet(w);
      if (acc) {
        setWallet(w);
        setAccount(acc);
      }
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    if (wallet) await disconnectWallet(wallet);
    setWallet(null);
    setAccount(null);
  }, [wallet]);

  const selectWallet = useCallback((w: Wallet) => {
    setWallet(w);
  }, []);

  const address = account?.address ?? null;

  return (
    <WalletContext.Provider
      value={{
        wallets,
        wallet,
        account,
        connected: !!account,
        connecting,
        address,
        displayAddress: address ? shortAddress(address) : null,
        connect,
        disconnect,
        selectWallet,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWalletContext(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWalletContext must be used inside WalletProvider");
  return ctx;
}
