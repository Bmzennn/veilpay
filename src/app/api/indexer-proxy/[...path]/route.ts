/**
 * /api/indexer-proxy — Server-side proxy for the Umbra UTXO indexer.
 *
 * The indexer does not send CORS headers, so browser fetches from the SDK are
 * blocked. This catch-all route forwards GET/POST requests server-side and
 * streams the binary protobuf response back.
 *
 * Endpoints:
 *   mainnet → utxo-indexer.api.umbraprivacy.com
 *   devnet  → utxo-indexer.api-devnet.umbraprivacy.com
 *
 * The SDK is configured with UMBRA_INDEXER_URL = "/api/indexer-proxy", so
 * ReadServiceClient issues URLs like /api/indexer-proxy/v1/utxos?... — we
 * reconstruct the upstream URL by appending the caught path + original query.
 */

import type { NextRequest } from "next/server";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

const UPSTREAM =
  process.env.NEXT_PUBLIC_NETWORK === "mainnet"
    ? "https://utxo-indexer.api.umbraprivacy.com"
    : "https://utxo-indexer.api-devnet.umbraprivacy.com";

const FORWARD_HEADERS = ["accept", "content-type", "x-response-layout"];

function buildUpstreamUrl(path: string[], req: NextRequest): string {
  const subpath = path.map(encodeURIComponent).join("/");
  const search = req.nextUrl.search;
  return `${UPSTREAM}/${subpath}${search}`;
}

function pickHeaders(req: NextRequest): Headers {
  const out = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = req.headers.get(name);
    if (value) out.set(name, value);
  }
  return out;
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
  method: "GET" | "POST"
): Promise<Response> {
  // 120 indexer requests per IP per minute — generous for normal SDK usage, blocks scrapers
  if (!checkRateLimit(`indexer:${getClientIp(req)}`, 120)) {
    return new Response(JSON.stringify({ error: "Too many requests." }), {
      status: 429,
      headers: { "Content-Type": "application/json" },
    });
  }
  const { path } = await ctx.params;
  const upstreamUrl = buildUpstreamUrl(path, req);

  const init: RequestInit = {
    method,
    headers: pickHeaders(req),
  };
  if (method === "POST") {
    init.body = await req.arrayBuffer();
  }

  let upstream: globalThis.Response;
  try {
    upstream = await fetch(upstreamUrl, init);
  } catch {
    return new Response(JSON.stringify({ error: "Indexer unreachable" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resHeaders = new Headers();
  const contentType = upstream.headers.get("content-type");
  if (contentType) resHeaders.set("Content-Type", contentType);
  const contentLength = upstream.headers.get("content-length");
  if (contentLength) resHeaders.set("Content-Length", contentLength);

  return new Response(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxy(req, ctx, "GET");
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  return proxy(req, ctx, "POST");
}
