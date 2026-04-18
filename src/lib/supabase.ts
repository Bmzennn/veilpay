/**
 * Supabase client singleton.
 *
 * Usage: import { getSupabaseClient } from "@/lib/supabase"
 *
 * Returns null if Supabase credentials are not configured — callers must
 * handle this gracefully (link metadata persistence is optional).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export interface LinkRecord {
  id: string;
  amount: string;
  token: string;
  amount_raw: string;
  decimals: number;
  created_at: number;
  expires_at: number;
  claimed: boolean;
  locked_to?: string | null;   // wallet-locked recipient address (optional)
  claimed_by?: string | null;  // address that claimed (recorded on PATCH)
  claimed_at?: string | null;  // ISO timestamp of claim
}

// Two clients: anon (browser-safe) and service-role (server-only for writes)
let _anonClient: SupabaseClient | null = null;
let _serviceClient: SupabaseClient | null = null;

/** Browser-safe client using the anon key (respects RLS). */
export function getSupabaseClient(): SupabaseClient | null {
  if (_anonClient) return _anonClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  _anonClient = createClient(url, key);
  return _anonClient;
}

/**
 * Server-only client using the service role key (bypasses RLS).
 * NEVER expose this key to the browser — only call from API routes.
 */
export function getSupabaseServiceClient(): SupabaseClient | null {
  if (_serviceClient) return _serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Service role key is NOT prefixed NEXT_PUBLIC_ — server-side only
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  _serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _serviceClient;
}

export async function persistLink(
  record: LinkRecord
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: null }; // silently skip if not configured

  const { error } = await client.from("links").insert({
    id: record.id,
    amount: record.amount,
    token: record.token,
    amount_raw: record.amount_raw,
    decimals: record.decimals,
    created_at: new Date(record.created_at).toISOString(),
    expires_at: new Date(record.expires_at).toISOString(),
    claimed: record.claimed,
  });

  return { error: error?.message ?? null };
}

export async function markLinkClaimed(
  id: string
): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: null };

  const { error } = await client
    .from("links")
    .update({ claimed: true })
    .eq("id", id);

  return { error: error?.message ?? null };
}
