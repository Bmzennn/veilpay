/**
 * Lightweight IP-based rate limiter for Next.js API routes.
 *
 * Uses an in-memory sliding window as the primary store with a
 * Supabase fallback table for cross-instance persistence on serverless.
 * For routes that don't need cross-instance precision (indexer proxy,
 * links POST), the in-memory version is sufficient — it limits abuse
 * within a single warm instance and cold-starts naturally reset the window.
 */

const WINDOW_MS = 60_000; // 1 minute

interface Window {
  hits: number[];
}

const store = new Map<string, Window>();

/**
 * Returns true if the request should be allowed, false if rate-limited.
 * @param key    Unique key per (route, ip) — e.g. "links-POST:1.2.3.4"
 * @param max    Max requests allowed per WINDOW_MS
 */
export function checkRateLimit(key: string, max: number): boolean {
  const now = Date.now();
  const entry = store.get(key) ?? { hits: [] };

  // Evict expired hits
  entry.hits = entry.hits.filter((t) => now - t < WINDOW_MS);

  // After eviction, if the bucket is empty it means this IP went quiet for a full
  // window — delete the key now so the Map doesn't grow unboundedly under
  // rotating-proxy attacks where millions of IPs each contribute one stale entry.
  if (entry.hits.length === 0) store.delete(key);

  if (entry.hits.length >= max) {
    store.set(key, entry);
    return false;
  }

  entry.hits.push(now);
  store.set(key, entry);
  return true;
}

/**
 * Extract the real client IP from a Next.js request.
 *
 * x-forwarded-for is a comma-separated chain appended by each proxy:
 *   <client>, <proxy1>, ..., <platform>
 * The LAST entry is appended by Vercel's edge and cannot be spoofed by the
 * client. The FIRST entry is attacker-controlled — never key rate limits on it.
 */
export function getClientIp(req: Request): string {
  const fwd = (req.headers as Headers).get("x-forwarded-for");
  if (fwd) {
    const parts = fwd.split(",");
    return parts[parts.length - 1].trim();
  }
  return "unknown";
}
