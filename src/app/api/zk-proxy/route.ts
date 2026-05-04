/**
 * /api/zk-proxy — Server-side proxy for Umbra ZK circuit assets.
 *
 * The ZK prover needs to fetch .zkey and .wasm files from the Umbra CDN.
 * The CDN does not send CORS headers, so browser fetches are blocked.
 * This route proxies the request server-side (no CORS restriction) and
 * streams the response back to the browser.
 *
 * Only URLs from the known Umbra CDN are allowed (allowlist check).
 */

import { type NextRequest, NextResponse } from "next/server";

// Node.js runtime — no timeout constraints for large binary streaming (50–100 MB .zkey files)
// Edge runtime's simulated fetch in webpack dev mode times out on slow CDN responses

const ALLOWED_CDN_ORIGIN = "https://d3j9fjdkre529f.cloudfront.net";

export async function GET(request: NextRequest): Promise<Response> {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }

  if (parsed.origin !== ALLOWED_CDN_ORIGIN) {
    return NextResponse.json({ error: "URL not in allowlist" }, { status: 403 });
  }

  // Only allow https; origin check above already ensures this, but be explicit
  if (parsed.protocol !== "https:") {
    return NextResponse.json({ error: "URL not in allowlist" }, { status: 403 });
  }

  console.log(`[zkProxy] Fetching upstream: ${parsed.pathname.split('/').pop()}`);

  try {
    const upstream = await fetch(parsed.href);

    if (!upstream.ok) {
      console.error(`[zkProxy] Upstream error: ${upstream.status} ${upstream.statusText}`);
      return new Response(null, { status: upstream.status });
    }

    const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";
    const contentLength = upstream.headers.get("content-length");

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=604800, immutable",
    };
    if (contentLength) headers["Content-Length"] = contentLength;

    return new Response(upstream.body, { headers });

  } catch (error: unknown) {
    console.error("[zkProxy] Fetch crash:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "CDN unreachable" }, { status: 502 });
  }
}
