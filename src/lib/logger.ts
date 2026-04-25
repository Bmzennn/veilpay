/**
 * Environment-aware logger.
 * - Development (NODE_ENV !== 'production'): always logs
 * - Production: silent unless NEXT_PUBLIC_DEBUG=true
 */

const isDev = process.env.NODE_ENV !== "production";
const DEBUG = isDev || process.env.NEXT_PUBLIC_DEBUG === "true";

export const log = DEBUG
  ? (...args: unknown[]) => console.log(...args)
  : () => {};

export const warn = DEBUG
  ? (...args: unknown[]) => console.warn(...args)
  : () => {};
