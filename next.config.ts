import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// In development, Next.js hot-reload (react-refresh) uses eval() for source maps.
// 'unsafe-eval' is required in dev only; production bundles never use eval().
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'"
  : "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'";

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
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      scriptSrc,
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
        "wss://*.helius.xyz",
        "https://*.helius-rpc.com",
        "wss://*.helius-rpc.com",
        "https://*.quicknode.com",
        "wss://*.quicknode.com",
        "https://*.alchemy.com",
        "wss://*.alchemy.com",
        "https://solscan.io",
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
