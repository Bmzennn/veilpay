/**
 * /api/merchant-pay — Private Solana Pay payment requests
 *
 * POST  /api/merchant-pay              → create a payment request
 * GET   /api/merchant-pay?id=<uuid>    → fetch one request (public — needed for /pay/[id])
 * GET   /api/merchant-pay?merchant=<addr>&limit=<n> → list merchant's requests
 * PATCH /api/merchant-pay?id=<uuid>    → mark as paid (customer calls after ZK proof)
 */

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient, getSupabaseClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { securityLog } from "@/lib/securityLog";

// ─── POST — create payment request ───────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  if (!checkRateLimit(`merchant-pay-POST:${ip}`, 20)) {
    securityLog("rate_limit_hit", { ip, detail: "merchant-pay POST" });
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (
    typeof body !== "object" || body === null ||
    !("merchant_addr" in body) || !("token" in body) || !("amount" in body)
  ) {
    return NextResponse.json({ error: "Missing required fields: merchant_addr, token, amount" }, { status: 400 });
  }

  const { merchant_addr, label, amount, token } = body as {
    merchant_addr: string;
    label?: string;
    amount: string;
    token: string;
  };

  const VALID_TOKENS = ["SOL", "USDC", "USDT", "UMBRA", "CASH"];
  if (!VALID_TOKENS.includes(token)) {
    return NextResponse.json({ error: `Invalid token. Must be one of: ${VALID_TOKENS.join(", ")}` }, { status: 400 });
  }

  if (isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const reference = crypto.randomUUID();
  const id        = crypto.randomUUID();

  const client = getSupabaseServiceClient();
  if (!client) {
    // Return in-memory record when Supabase not configured (dev)
    return NextResponse.json({ id, reference, merchant_addr, amount, token, label, paid: false });
  }

  const { error } = await client.from("merchant_payment_requests").insert({
    id, merchant_addr, label: label ?? null, amount, token, reference,
    paid: false,
  });

  if (error) {
    console.error("[merchant-pay POST] DB error:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ id, reference });
}

// ─── GET — fetch one or list ──────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  if (!checkRateLimit(`merchant-pay-GET:${ip}`, 120)) {
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const id       = req.nextUrl.searchParams.get("id");
  const merchant = req.nextUrl.searchParams.get("merchant");
  const limit    = Math.min(parseInt(req.nextUrl.searchParams.get("limit") ?? "20"), 50);

  // Use service client so RLS on the new table doesn't block public reads
  const client = getSupabaseServiceClient();
  if (!client) {
    return NextResponse.json({ error: "Database not configured" }, { status: 503 });
  }

  if (id) {
    const { data, error } = await client
      .from("merchant_payment_requests")
      .select("id, merchant_addr, label, amount, token, reference, paid, paid_at, deposit_sig, created_at")
      .eq("id", id)
      .single();

    if (error) {
      if (error.code === "PGRST116") return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
    return NextResponse.json({ request: data });
  }

  if (merchant) {
    const { data, error } = await client
      .from("merchant_payment_requests")
      .select("id, label, amount, token, reference, paid, paid_at, created_at")
      .eq("merchant_addr", merchant)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    return NextResponse.json({ requests: data });
  }

  return NextResponse.json({ error: "Provide id or merchant param" }, { status: 400 });
}

// ─── PATCH — mark as paid ─────────────────────────────────────────────────────

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  if (!checkRateLimit(`merchant-pay-PATCH:${ip}`, 10)) {
    securityLog("rate_limit_hit", { ip, detail: "merchant-pay PATCH" });
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id param" }, { status: 400 });

  let body: { deposit_sig?: string } = {};
  try { body = await req.json(); } catch {}

  const { deposit_sig } = body;
  if (!deposit_sig) return NextResponse.json({ error: "deposit_sig is required" }, { status: 400 });

  // Basic sig format validation (Solana base58 signature)
  if (!/^[1-9A-HJ-NP-Za-km-z]{64,90}$/.test(deposit_sig)) {
    return NextResponse.json({ error: "Invalid deposit_sig format" }, { status: 400 });
  }

  const client = getSupabaseServiceClient();
  if (!client) return NextResponse.json({ ok: true, persisted: false });

  const { data: existing } = await client
    .from("merchant_payment_requests")
    .select("paid")
    .eq("id", id)
    .single();

  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (existing.paid) return NextResponse.json({ error: "Already paid" }, { status: 409 });

  const { error } = await client
    .from("merchant_payment_requests")
    .update({ paid: true, paid_at: new Date().toISOString(), deposit_sig })
    .eq("id", id)
    .eq("paid", false);

  if (error) {
    console.error("[merchant-pay PATCH] DB error:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
