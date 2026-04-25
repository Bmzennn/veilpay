"use client";

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
  subscribeWallets,
  getPhantomFallback,
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

  useEffect(() => {
    // Seed the wallet list. We do a few passes:
    //  1. Immediately after mount (handles wallets already registered)
    //  2. After 300ms (catches late-injecting extensions like Phantom)
    //  3. Subscribe to future register/unregister events

    const refresh = () => {
      const ws = getCompatibleWallets();
      // If Wallet Standard found nothing, try the legacy Phantom injection.
      if (ws.length === 0) {
        const fallback = getPhantomFallback();
        setWallets(fallback ? [fallback] : []);
      } else {
        setWallets(ws);
      }
    };

    // Immediate pass
    refresh();

    // Delayed pass — Phantom often injects 200-400ms after page load
    const t1 = setTimeout(refresh, 300);
    const t2 = setTimeout(refresh, 800);

    // Subscribe to Wallet Standard events for future changes
    const unsub = subscribeWallets(refresh, refresh);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      unsub();
    };
  }, []);

  const connect = useCallback(async (w: Wallet) => {
    setConnecting(true);
    try {
      const acc = await connectWallet(w);
      if (acc) {
        setWallet(w);
        setAccount(acc);
      }
    } catch (e) {
      console.error("[WalletContext] connect failed:", e);
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
