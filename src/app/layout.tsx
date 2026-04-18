import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/WalletContext";
import { AnimatedBackground } from "@/components/AnimatedBackground";

export const metadata: Metadata = {
  title: "VeilPay — Private Payments on Solana",
  description:
    "Send and receive private crypto payments via shareable links. Zero on-chain link between sender and recipient.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full">
        <WalletProvider>
          <AnimatedBackground />
          {children}
        </WalletProvider>
      </body>
    </html>
  );
}
