/**
 * Debug-gated logger.
 *
 * In production all log() calls are no-ops.
 * Set NEXT_PUBLIC_DEBUG=true in .env.local to enable during development.
 *
 * console.error() is always active — it's used only for genuine error paths
 * and is never called with sensitive data.
 */

const DEBUG = process.env.NEXT_PUBLIC_DEBUG === "true";

export const log = DEBUG
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

export const warn = DEBUG
  ? (...args: unknown[]) => console.warn(...args)
  : () => {};
