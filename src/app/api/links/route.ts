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

// ─── POST — create link ───────────────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
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
    !("expires_at" in body)
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
  };

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, persisted: true });
}

// ─── GET — fetch link ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest): Promise<NextResponse> {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ link: data });
}

// ─── PATCH — mark claimed ─────────────────────────────────────────────────────

interface ClaimBody {
  claimer_address?: string;
  signature?: string;   // base64-encoded Ed25519 signature
  timestamp?: number;   // Unix seconds — must be within 5 min of now
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const client = getSupabaseServiceClient();
  if (!client) {
    return NextResponse.json({ ok: true, persisted: false });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id param" }, { status: 400 });
  }

  // Body is optional for general (unlocked) links
  let body: ClaimBody = {};
  try {
    body = (await req.json()) as ClaimBody;
  } catch {
    // no body — fine for general links
  }

  const { claimer_address, signature, timestamp } = body;

  // Fetch the link to check locked_to and claimed status
  const { data: link, error: fetchError } = await client
    .from("links")
    .select("locked_to, claimed")
    .eq("id", id)
    .single();

  if (fetchError) {
    if (fetchError.code === "PGRST116") {
      return NextResponse.json({ error: "Link not found" }, { status: 404 });
    }
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (link.claimed) {
    return NextResponse.json({ error: "Link already claimed" }, { status: 409 });
  }

  // ── Wallet-locked enforcement ──────────────────────────────────────────────
  if (link.locked_to) {
    if (!claimer_address) {
      return NextResponse.json(
        { error: "claimer_address is required for wallet-locked links" },
        { status: 400 }
      );
    }

    if (claimer_address !== link.locked_to) {
      return NextResponse.json(
        { error: "Unauthorized: claimer wallet does not match the locked recipient" },
        { status: 403 }
      );
    }

    // Require a valid wallet signature
    if (!signature || timestamp === undefined) {
      return NextResponse.json(
        { error: "signature and timestamp are required for wallet-locked links" },
        { status: 400 }
      );
    }

    // Replay protection — reject signatures older than 5 minutes
    const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestamp);
    if (ageSeconds > 300) {
      return NextResponse.json({ error: "Signature has expired" }, { status: 400 });
    }

    // Verify Ed25519 signature
    // Message: "VeilPay claim: {id} by {claimer_address} at {timestamp}"
    const message = `VeilPay claim: ${id} by ${claimer_address} at ${timestamp}`;
    try {
      const pubkeyBytes = new PublicKey(claimer_address).toBytes();
      const msgBytes = new TextEncoder().encode(message);
      const sigBytes = Buffer.from(signature, "base64");
      const valid = ed25519.verify(sigBytes, msgBytes, pubkeyBytes);
      if (!valid) {
        return NextResponse.json({ error: "Invalid wallet signature" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Signature verification failed" }, { status: 400 });
    }
  }

  // ── Mark claimed ───────────────────────────────────────────────────────────
  const { error: updateError } = await client
    .from("links")
    .update({
      claimed: true,
      claimed_by: claimer_address ?? null,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
