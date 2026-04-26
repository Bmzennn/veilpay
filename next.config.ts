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
  // CSP temporarily set to report-only with open connect-src to diagnose
  // which URLs the Umbra SDK calls during registration. Once identified,
  // tighten back to an explicit allowlist.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com",
      "img-src 'self' data: blob:",
      // blob: is required — snarkjs workers fetch zkey/wasm via blob URLs created in main thread
      [
        "connect-src 'self' blob:",
        "https://*.supabase.co",
        "wss://*.supabase.co",
        "https://*.umbraprivacy.com",
        "wss://*.umbraprivacy.com",
        "https://*.arcium.com",
        "wss://*.arcium.com",
        "https://d3j9fjdkre529f.cloudfront.net",
        "https://*.solana.com",
        "wss://*.solana.com",
        "https://*.helius.xyz",
        "https://*.helius-rpc.com",
        "https://*.quicknode.com",
        "https://*.alchemy.com",
        "https://solscan.io",
        "https://lite-api.jup.ag",   // Jupiter price API for USD balance display
        "https://price.jup.ag",      // Jupiter price API (legacy endpoint)
      ].join(" "),
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
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
