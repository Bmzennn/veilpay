/**
 * Structured security event logger (F-10).
 *
 * Writes to stdout in JSON-L format so Vercel log drains, Datadog, and
 * similar tools can ingest and alert on security events without extra setup.
 *
 * Event types that are always logged regardless of NODE_ENV:
 *   - signature_failure    Ed25519 verification rejected
 *   - replay_attempt       Known deposit signature resubmitted
 *   - rate_limit_hit       IP exceeded request quota
 *   - payment_rejected     x402 payment verification failed
 *   - lock_violation       Wrong wallet tried to claim a locked link
 *   - underpayment         x402 payer sent less than required amount
 */

export type SecurityEventType =
  | "signature_failure"
  | "replay_attempt"
  | "rate_limit_hit"
  | "payment_rejected"
  | "lock_violation"
  | "underpayment";

interface SecurityEvent {
  level: "SECURITY";
  event: SecurityEventType;
  ts: string;
  ip?: string;
  detail?: string;
  /** Partial identifier — never log a full signature or key. */
  ref?: string;
}

export function securityLog(
  event: SecurityEventType,
  opts: { ip?: string; detail?: string; ref?: string } = {}
): void {
  const entry: SecurityEvent = {
    level: "SECURITY",
    event,
    ts: new Date().toISOString(),
    ...opts,
  };
  // console.error routes to stderr on Vercel, which is the correct channel for
  // security events (separate from application stdout, easier to alert on).
  console.error(JSON.stringify(entry));
}
