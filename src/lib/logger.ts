/**
 * Environment-aware logger.
 * - Development (NODE_ENV !== 'production'): always logs
 * - Production: silent unless NEXT_PUBLIC_DEBUG=true
 */

const getDebug = () => {
  if (typeof process !== "undefined" && process.env.NODE_ENV !== "production") return true;
  if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_DEBUG === "true") return true;
  if (typeof window !== "undefined" && (window as any).DEBUG_VEILPAY) return true;
  return false;
};

const DEBUG = getDebug();

export const log = (...args: unknown[]) => {
  if (DEBUG) {
    console.log(...args);
  }
};

export const warn = (...args: unknown[]) => {
  if (DEBUG) {
    console.warn(...args);
  }
};
