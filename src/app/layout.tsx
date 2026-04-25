import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletContext";

export const metadata: Metadata = {
  title: "VeilPay — Private Payments on Solana",
  description:
    "Send and receive private crypto payments on Solana. Zero on-chain link between sender and recipient.",
  referrer: "no-referrer",
};

// Reads theme from localStorage before React hydrates to prevent flash.
const themeScript = `(function(){try{var s=localStorage.getItem('vp-theme');var p=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=(s||p);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <WalletProvider>
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
