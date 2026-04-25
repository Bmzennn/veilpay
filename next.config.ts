import type { NextConfig } from "next";

const securityHeaders = [
  // Prevent clickjacking — critical for a financial app where iframing could trick users into signing txs
  { key: "X-Frame-Options", value: "DENY" },
  // Prevent MIME-type sniffing
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Never send referrer to external sites (protects claim URLs in the hash from leaking)
  { key: "Referrer-Policy", value: "no-referrer" },
  // Block camera/mic/geo — this app needs none of them
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Force HTTPS for 2 years, include subdomains (production only — harmless on dev)
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  // Basic XSS protection header (legacy browsers)
  { key: "X-XSS-Protection", value: "1; mode=block" },
  // Content Security Policy — restrictive baseline for a Next.js + Solana app
  // Allows: same-origin scripts, Supabase, Umbra CDN/relayer, Solana RPC, Google Fonts
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // Scripts: self + nonce (Next.js inline) + trusted CDNs
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // unsafe-eval needed for snarkjs WASM
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      // Images: self + data URIs (QR code data URLs) + token logos served locally
      "img-src 'self' data: blob:",
      // Connect: Supabase, all Umbra services (wildcard covers any subdomain the SDK uses),
      // all Solana RPC endpoints, CloudFront ZK CDN, Solscan
      [
        "connect-src 'self'",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://*.umbraprivacy.com",   // covers relayer, indexer, and any other SDK endpoints
        "wss://*.umbraprivacy.com",
        "https://*.arcium.com",         // Arcium MPC endpoints used by Umbra SDK
        "wss://*.arcium.com",
        "https://d3j9fjdkre529f.cloudfront.net",  // ZK circuit CDN
        "https://*.solana.com",         // covers devnet, mainnet-beta, testnet
        "wss://*.solana.com",
        "https://*.helius.xyz",         // common paid RPC providers
        "https://*.helius-rpc.com",
        "https://*.quicknode.com",
        "https://*.alchemy.com",
        "https://solscan.io",
      ].join(" "),
      "worker-src 'self' blob:",  // snarkjs spawns workers
      "frame-ancestors 'none'",   // belt-and-suspenders with X-Frame-Options
      "base-uri 'self'",
      "form-action 'self'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
