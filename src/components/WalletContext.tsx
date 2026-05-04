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

const LAST_WALLET_KEY = "vp-last-wallet";

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

  // ── Auto-reconnect: silently re-connect to last used wallet ──────────────
  const tryAutoConnect = useCallback(async (available: Wallet[]) => {
    if (account) return; // already connected
    const lastName = typeof window !== "undefined"
      ? localStorage.getItem(LAST_WALLET_KEY)
      : null;
    if (!lastName) return;

    const last = available.find(w => w.name === lastName);
    if (!last) return;

    try {
      const connectFeature = last.features["standard:connect"] as {
        connect: (opts?: { silent?: boolean }) => Promise<{ accounts: readonly WalletAccount[] }>;
      };
      // silent:true — shows no popup; succeeds only if site was previously approved
      const result = await connectFeature.connect({ silent: true });
      if (result.accounts.length > 0) {
        setWallet(last);
        setAccount(result.accounts[0]);
      }
    } catch {
      // silent connect not supported or approval revoked — user must reconnect manually
      localStorage.removeItem(LAST_WALLET_KEY);
    }
  }, [account]);

  useEffect(() => {
    const refresh = () => {
      const ws = getCompatibleWallets();
      const list = ws.length > 0 ? ws : (getPhantomFallback() ? [getPhantomFallback()!] : []);
      setWallets(list);
      // Attempt auto-reconnect after the wallet list stabilises
      tryAutoConnect(list);
    };

    refresh();
    const t1 = setTimeout(refresh, 300);
    const t2 = setTimeout(refresh, 800);
    const unsub = subscribeWallets(refresh, refresh);

    return () => { clearTimeout(t1); clearTimeout(t2); unsub(); };
  }, [tryAutoConnect]);

  const connect = useCallback(async (w: Wallet) => {
    setConnecting(true);
    try {
      const acc = await connectWallet(w);
      if (acc) {
        setWallet(w);
        setAccount(acc);
        localStorage.setItem(LAST_WALLET_KEY, w.name);
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
    localStorage.removeItem(LAST_WALLET_KEY);
  }, [wallet]);

  const selectWallet = useCallback((w: Wallet) => { setWallet(w); }, []);

  const address = account?.address ?? null;

  return (
    <WalletContext.Provider
      value={{
        wallets, wallet, account,
        connected: !!account, connecting,
        address,
        displayAddress: address ? shortAddress(address) : null,
        connect, disconnect, selectWallet,
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
