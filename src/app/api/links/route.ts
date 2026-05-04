/**
 * /api/links — Link metadata persistence
 *
 * POST  /api/links              → persist a new link record
 * GET   /api/links?id=<uuid>    → fetch a link record by ID
 * PATCH /api/links?id=<uuid>    → mark a link as claimed (with auth for locked links)
 *
 * For wallet-locked links, PATCH requires a body:
 *   { claimer_address: string, signature: string, timestamp: number }
 *
 * The server verifies:
 *   1. claimer_address matches the link's locked_to field
 *   2. Ed25519 signature over "VeilPay claim: {id} by {claimer_address} at {timestamp}"
 *   3. Timestamp is within a 5-minute window (replay protection)
 */

import { NextRequest, NextResponse } from "next/server";
import { ed25519 } from "@noble/curves/ed25519";
import { PublicKey } from "@solana/web3.js";
import { getSupabaseServiceClient, getSupabaseClient } from "@/lib/supabase";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";
import { securityLog } from "@/lib/securityLog";

// ─── POST — create link ───────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // 20 link creations per IP per minute — prevents DB spam
  const ip = getClientIp(req);
  if (!checkRateLimit(`links-POST:${ip}`, 20)) {
    securityLog("rate_limit_hit", { ip, detail: "links POST" });
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const client = getSupabaseServiceClient();
  if (!client) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    !("amount" in body) ||
    !("token" in body) ||
    !("created_at" in body) ||
    !("expires_at" in body) ||
    !("sender_address" in body) ||
    !("signature" in body) ||
    !("timestamp" in body)
  ) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const record = body as {
    id: string;
    amount: string;
    token: string;
    amount_raw: string;
    decimals: number;
    created_at: number;
    expires_at: number;
    locked_to?: string;
    sender_address: string;
    signature: string;
    timestamp: number;
  };

  // Replay protection — reject signatures older than 5 minutes
  if (typeof record.timestamp !== "number" || !Number.isFinite(record.timestamp)) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - record.timestamp);
  if (ageSeconds > 300) {
    return NextResponse.json({ error: "Signature has expired" }, { status: 400 });
  }

  // Verify Ed25519 signature
  // Message: "Authorize VeilPay Link: {id} by {sender_address} at {timestamp}"
  const message = `Authorize VeilPay Link: ${record.id} by ${record.sender_address} at ${record.timestamp}`;
  try {
    const pubkeyBytes = new PublicKey(record.sender_address).toBytes();
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = Buffer.from(record.signature, "base64");
    const valid = ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
    if (!valid) {
      securityLog("signature_failure", { detail: "POST /api/links — invalid sender sig", ref: record.sender_address.slice(0, 8) });
      return NextResponse.json({ error: "Invalid wallet signature" }, { status: 403 });
    }
  } catch {
    securityLog("signature_failure", { detail: "POST /api/links — sig verification threw" });
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  const { error } = await client.from("links").insert({
    id: record.id,
    amount: record.amount,
    token: record.token,
    amount_raw: record.amount_raw,
    decimals: record.decimals,
    created_at: new Date(record.created_at).toISOString(),
    expires_at: new Date(record.expires_at).toISOString(),
    claimed: false,
    locked_to: record.locked_to ?? null,
  });

  if (error) {
    console.error("[links POST] DB error:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
}

// ─── GET — fetch link ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
  // 60 reads per IP per minute — generous for UI polling, blocks scrapers
  const ip = getClientIp(req);
  if (!checkRateLimit(`links-GET:${ip}`, 60)) {
    securityLog("rate_limit_hit", { ip, detail: "links GET" });
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const client = getSupabaseClient();
  if (!client) {
    return NextResponse.json({ ok: true, persisted: false, link: null });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id param" }, { status: 400 });
  }

  const { data, error } = await client
    .from("links")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    if (error.code === "PGRST116") {
      return NextResponse.json({ link: null }, { status: 404 });
    }
    console.error("[links GET] DB error:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  return NextResponse.json({ link: data });
}

// ─── PATCH — mark claimed ─────────────────────────────────────────────────────

/**
 * All PATCH callers must prove wallet ownership via Ed25519 signature — even for
 * open (unlocked) links. This prevents griefing: an attacker without a wallet
 * cannot produce a valid signature and cannot mark a link as claimed in the DB.
 *
 * For locked links the server additionally verifies claimer_address === locked_to.
 */
interface ClaimBody {
  claimer_address?: string;
  signature?: string;   // base64-encoded Ed25519 signature
  timestamp?: number;   // Unix seconds — must be within 5 min of now
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  // 10 claim attempts per IP per minute — generous for normal use, blocks griefing spam
  const ip = getClientIp(req);
  if (!checkRateLimit(`links-PATCH:${ip}`, 10)) {
    securityLog("rate_limit_hit", { ip, detail: "links PATCH" });
    return NextResponse.json({ error: "Too many requests." }, { status: 429 });
  }

  const client = getSupabaseServiceClient();
  if (!client) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id param" }, { status: 400 });
  }

  let body: ClaimBody = {};
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    // fall through — missing fields caught below
  }

  const { claimer_address, signature, timestamp } = body;

  // ── Require wallet proof for all claims (open + locked) ───────────────────
  if (!claimer_address) {
    return NextResponse.json({ error: "claimer_address is required" }, { status: 400 });
  }
  if (!signature || timestamp === undefined) {
    return NextResponse.json(
      { error: "signature and timestamp are required" },
      { status: 400 }
    );
  }

  // Replay protection — reject signatures older than 5 minutes
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    return NextResponse.json({ error: "Invalid timestamp" }, { status: 400 });
  }
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
  if (ageSeconds > 300) {
    return NextResponse.json({ error: "Signature has expired" }, { status: 400 });
  }

  // Verify Ed25519 signature: message format matches what the client sends
  // "VeilPay claim: {id} by {claimer_address} at {timestamp}"
  const message = `VeilPay claim: ${id} by ${claimer_address} at ${timestamp}`;
  try {
    const pubkeyBytes = new PublicKey(claimer_address).toBytes();
    const msgBytes = new TextEncoder().encode(message);
    const sigBytes = Buffer.from(signature, "base64");
    const valid = ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
    if (!valid) {
      securityLog("signature_failure", { detail: `PATCH /api/links — invalid claim sig for ${id}`, ref: claimer_address.slice(0, 8) });
      return NextResponse.json({ error: "Invalid wallet signature" }, { status: 403 });
    }
  } catch {
    securityLog("signature_failure", { detail: `PATCH /api/links — claim sig verification threw for ${id}` });
    return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
  }

  // ── Fetch link to check locked_to ─────────────────────────────────────────
  const { data: link, error: fetchError } = await client
    .from("links")
    .select("locked_to, claimed")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    console.error("[links PATCH] DB fetch error:", fetchError.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (link.claimed) {
    return NextResponse.json({ error: "Link already claimed" }, { status: 409 });
  }

  // For wallet-locked links, enforce address match
  if (link.locked_to && claimer_address !== link.locked_to) {
    securityLog("lock_violation", { detail: `PATCH /api/links — wrong claimer for locked link ${id}`, ref: claimer_address.slice(0, 8) });
    return NextResponse.json(
      { error: "Unauthorized: claimer wallet does not match the locked recipient" },
      { status: 403 }
    );
  }

  // ── Atomic mark-claimed: .eq("claimed", false) prevents double-claim ──────
  const { data: updated, error: updateError } = await client
    .from("links")
    .update({
      claimed: true,
      claimed_by: claimer_address,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("claimed", false)
    .select("id");

  if (updateError) {
    console.error("[links PATCH] DB update error:", updateError.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }

  if (!updated || updated.length === 0) {
    // Another concurrent request already claimed this link
    return NextResponse.json({ error: "Link already claimed" }, { status: 409 });
  }

  return NextResponse.json({ ok: true });
}
