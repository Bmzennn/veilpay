"use client";

/**
 * Umbra SDK wrapper.
 *
 * All SDK calls are isolated here. Pages/components import only typed
 * result objects — never the SDK directly.
 *
 * ARCHITECTURE: Payment Links use a receiver-claimable UTXO pattern.
 *
 *   SEND:
 *   1. Generate ephemeral keypair (random 32-byte private key)
 *   2. Fund ephemeral with SOL (for registration fees + rent)
 *   3. Register ephemeral address with Umbra (X25519 key on-chain)
 *   4. Sender creates receiver-claimable UTXO → ephemeral address (public balance)
 *   5. Encode ephemeral private key + token + expiry in URL
 *      → /claim?lid=<uuid>&exp=<ms>#<bs58_key>:<TOKEN>
 *
 *   CLAIM:
 *   1. Parse URL → extract key, token, link ID, expiry
 *   2. Check expiry before touching the SDK
 *   3. Reconstruct ephemeral signer from secret bytes
 *   4. Scan Umbra pool for UTXOs addressed to ephemeral (publicReceived)
 *   5. Claim UTXO into ephemeral encrypted balance (relayer pays fees)
 *   6. Poll relayer until claim computation finalizes
 *   7. Withdraw from ephemeral encrypted balance → recipient public ATA
 *   8. Mark link as claimed in DB
 */

import {
  createSignerFromPrivateKeyBytes,
  createSignerFromWalletAccount,
  getUmbraClient,
  getUserRegistrationFunction,
  getUserAccountX25519KeypairDeriver,
  getMasterViewingKeyX25519KeypairDeriver,
  getPublicBalanceToReceiverClaimableUtxoCreatorFunction,
  getPublicBalanceToEncryptedBalanceDirectDepositorFunction,
  getClaimableUtxoScannerFunction,
  getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction,
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
  getEncryptedBalanceQuerierFunction,
  getUmbraRelayer,
  getUserAccountQuerierFunction,
  pollClaimUntilTerminal,
  getPollingTransactionForwarder,
  getPollingComputationMonitor,
} from "@umbra-privacy/sdk";
import { ed25519 as nobleEd25519 } from "@noble/curves/ed25519";
import {
  getCreateReceiverClaimableUtxoFromPublicBalanceProver,
  getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver,
  getUserRegistrationProver,
} from "@umbra-privacy/web-zk-prover";
import type { IZkAssetProvider } from "@umbra-privacy/web-zk-prover";
import type { ClaimableUtxoScannerFunction } from "@umbra-privacy/sdk/interfaces";
import { ReadServiceClient } from "@umbra-privacy/indexer-read-service-client";
import type { Wallet, WalletAccount } from "@wallet-standard/core";
import type { Address } from "@solana/kit";
import bs58 from "bs58";

import { Keypair, Connection, VersionedTransaction } from "@solana/web3.js";
import {
  RPC_URL,
  RPC_WS_URL,
  NETWORK,
  UMBRA_INDEXER_URL,
  UMBRA_RELAYER_URL,
  TOKEN_CONFIG,
  LINK_EXPIRY_DAYS,
} from "./constants";
import { fundEphemeral } from "./solana";
import type { Token, PaymentLinkMeta } from "@/types";
import { log, warn } from "./logger";

// Derive U32 from the scanner function's parameter type (it is a branded bigint)
export type U32 = Parameters<ClaimableUtxoScannerFunction>[0];

// ─── ZK asset provider ───────────────────────────────────────────────────────
// The Umbra CDN omits CORS headers, so browser fetches are blocked.
// We proxy through our own API route (server-side, no CORS restriction).
// The browser's HTTP cache (Cache-Control: immutable in the proxy response)
// keeps the files cached across refreshes.

const CDN_BASE = "https://d3j9fjdkre529f.cloudfront.net";
const ZK_CACHE_NAME = "veilpay-zk-v2";

type ManifestEntry = { url: string };
type ManifestAsset = ManifestEntry | Record<string, ManifestEntry>;
type Manifest = { assets: Record<string, ManifestAsset> };

/**
 * Enhanced ZK asset provider with persistent browser caching.
 * Uses the Cache Storage API to store massive .zkey files (>50MB)
 * so they are never re-downloaded after the first successful load.
 *
 * Module-level singleton: the manifest and blob URL cache survive across
 * multiple makeZkProverDeps() calls within a single page session, eliminating
 * redundant manifest proxy fetches.
 */
let _zkAssetProviderInstance: IZkAssetProvider | null = null;

function getPersistentZkAssetProvider(): IZkAssetProvider {
  if (_zkAssetProviderInstance) return _zkAssetProviderInstance;

  let manifestCache: Manifest | null = null;

  const fetchWithCache = async (url: string, attempt = 1): Promise<string> => {
    if (typeof window === "undefined") return url;

    try {
      const cache = await caches.open(ZK_CACHE_NAME);
      
      const cachedResponse = await cache.match(url);
      if (cachedResponse && cachedResponse.ok) {
        // Double check it's not a tiny error response that got cached
        const contentLength = cachedResponse.headers.get("content-length");
        if (!contentLength || parseInt(contentLength) > 1000) {
            log(`[zkCache] Persistent hit: ${url.split('/').pop()}`);
            const blob = await cachedResponse.blob();
            return URL.createObjectURL(blob);
        }
        await cache.delete(url); // Clean up bad entry
      }

      log(`[zkCache] Cache miss (attempt ${attempt}), downloading: ${url.split('/').pop()}`);
      const proxyUrl = `/api/zk-proxy?url=${encodeURIComponent(url)}`;
      const response = await fetch(proxyUrl);
      
      if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Proxy error (${response.status}): ${errorText.slice(0, 100)}`);
      }

      // Ensure we don't cache a 502/error body accidentally
      if (response.status === 200) {
        await cache.put(url, response.clone());
      }
      
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      warn(`[zkCache] Download failed (attempt ${attempt}):`, message);
      if (attempt < 3) {
          log("[zkCache] Retrying in 2s...");
          await new Promise(r => setTimeout(r, 2000));
          return fetchWithCache(url, attempt + 1);
      }
      return `/api/zk-proxy?url=${encodeURIComponent(url)}`;
    }
  };

  const provider: IZkAssetProvider = {
    async getAssetUrls(type: string, variant?: string): Promise<{ zkeyUrl: string; wasmUrl: string }> {
      if (!manifestCache) {
        const res = await fetch(
          `/api/zk-proxy?url=${encodeURIComponent(`${CDN_BASE}/manifest.json`)}`
        );
        if (!res.ok) throw new Error(`ZK manifest fetch failed (${res.status})`);
        manifestCache = (await res.json()) as Manifest;
      }

      const assetEntry = manifestCache.assets[type];
      if (!assetEntry) throw new Error(`ZK asset type '${type}' not found in manifest`);

      let rawUrl: string;
      if (variant !== undefined && !("url" in assetEntry)) {
        const variantEntry = (assetEntry as Record<string, ManifestEntry>)[variant];
        if (!variantEntry) throw new Error(`ZK variant '${variant}' not found for '${type}'`);
        rawUrl = variantEntry.url;
      } else {
        rawUrl = (assetEntry as ManifestEntry).url;
      }

      const fullZkeyUrl = rawUrl.startsWith("http") ? rawUrl : `${CDN_BASE}/${rawUrl}`;
      const fullWasmUrl = fullZkeyUrl.replace(/\.zkey$/i, ".wasm");

      const [zkeyUrl, wasmUrl] = await Promise.all([
        fetchWithCache(fullZkeyUrl),
        fetchWithCache(fullWasmUrl)
      ]);

      return { zkeyUrl, wasmUrl };
    },
  };

  _zkAssetProviderInstance = provider;
  return provider;
}

/**
 * Proactively pre-downloads and caches the massive ZK circuits needed for sending.
 */
export async function preloadCreateAssets() {
  if (typeof window === "undefined") return;
  log("[zkCache] Proactive pre-load started for 'send' circuits...");
  try {
    const provider = getPersistentZkAssetProvider();
    await Promise.all([
      provider.getAssetUrls("userregistration"),
      provider.getAssetUrls("receiverclaimableutxofrompublicbalance")
    ]);
    log("[zkCache] Proactive pre-load complete.");
  } catch (e) {
    warn("[zkCache] Proactive pre-load failed:", e);
  }
}

/**
 * Proactively pre-downloads and caches the massive ZK circuits needed for claiming.
 * Call this when the user opens the /claim page to eliminate the download wait time
 * when they actually click the "Claim" button.
 */
export async function preloadClaimAssets() {
  if (typeof window === "undefined") return;
  log("[zkCache] Proactive pre-load started for 'claim' circuits...");
  try {
    const provider = getPersistentZkAssetProvider();
    // This triggers the fetch-and-cache logic inside the provider
    await provider.getAssetUrls("claimreceiverclaimableutxointoencryptedbalance");
    log("[zkCache] Proactive pre-load complete.");
  } catch (e) {
    warn("[zkCache] Proactive pre-load failed (will retry on-demand):", e);
  }
}

/**
 * Manually wipes the local ZK persistent cache.
 * Useful for debugging or recovering from corrupted downloads.
 */
export async function clearZkCache() {
    if (typeof window === "undefined") return;
    try {
        await caches.delete(ZK_CACHE_NAME);
        log("[zkCache] Local storage wiped.");
    } catch (e) {
        console.error("[zkCache] Failed to clear:", e);
    }
}

export function makeZkProverDeps() {
  return {
    assetProvider: getPersistentZkAssetProvider(),
    callbacks: {
      onZkeyDownload: {
        pre: async () => log("[zkProver] preparing zkey…"),
        post: async () => log("[zkProver] zkey ready"),
      },
      onWasmDownload: {
        pre: async () => log("[zkProver] preparing wasm…"),
        post: async () => log("[zkProver] wasm ready"),
      },
      onWitnessGeneration: {
        pre: async () => log("[zkProver] generating witness…"),
        post: async () => log("[zkProver] witness done"),
      },
      onProofComputation: {
        pre: async () => log("[zkProver] computing ZK proof (may take 10-30s)…"),
        post: async () => log("[zkProver] proof done"),
      },
    },
  };
}

// ─── Error normalization ──────────────────────────────────────────────────────

function normalizeError(err: unknown): string {
  // Always log the raw error so DevTools shows the real cause.
  console.error("[normalizeError] raw error:", err);

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("insufficient") || msg.includes("not enough sol") || msg.includes("lamports")) {
      return "Insufficient SOL balance to cover transaction fees.";
    }
    if (msg.includes("not found") || msg.includes("account does not exist")) {
      return "Account not found — please ensure your wallet is funded.";
    }
    if (msg.includes("user rejected") || msg.includes("rejected")) {
      return "Transaction rejected in wallet.";
    }
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return "Transaction timed out. The Solana network may be congested — please try again.";
    }
    if (msg.includes("blockhash not found") || msg.includes("block height exceeded")) {
      return "Transaction expired. Please try again.";
    }
    if (msg.includes("no claimable utxo") || msg.includes("no claimable")) {
      return "No unclaimed payment found for this link. It may have already been claimed.";
    }
    if (msg.includes("indexer") || msg.includes("fetchbatchmerkleproof")) {
      return "Umbra indexer is unavailable. Please try again in a moment.";
    }
    if (msg.includes("relayer") || msg.includes("relay")) {
      return "Umbra relayer is unavailable. Please try again in a moment.";
    }
    // Return the raw message if it looks user-safe (short, no stack traces)
    if (err.message.length < 120 && !err.message.includes("at ")) {
      return err.message;
    }
    // Still user-safe but long — surface the first 118 chars
    const trimmed = err.message.replace(/\n.*/s, "").slice(0, 118);
    if (trimmed && !trimmed.includes("at ")) return trimmed;
  }
  return "Something went wrong. Please try again.";
}

// ─── Skip-preflight transaction forwarder ────────────────────────────────────
// We use a custom forwarder for two reasons:
//   1. The polling forwarder runs preflight simulation with `preflightCommitment`.
//      On devnet, the simulation may run against a slot that hasn't propagated
//      the proof account created by the preceding transaction, causing spurious
//      failures.  Skipping preflight sends directly to the validator, which has
//      the confirmed state.
//   2. Public devnet WebSocket endpoints are unreliable.

function encodeTransactionToWire(
  messageBytes: Uint8Array,
  signatures: Record<string, Uint8Array | null>
): Uint8Array {
  const sigs = Object.values(signatures);
  const countBytes = compactU16(sigs.length);
  const wire = new Uint8Array(countBytes.length + sigs.length * 64 + messageBytes.length);
  wire.set(countBytes, 0);
  let off = countBytes.length;
  for (const sig of sigs) {
    wire.set(sig ?? new Uint8Array(64), off);
    off += 64;
  }
  wire.set(messageBytes, off);
  return wire;
}

function makeSkipPreflightForwarder() {
  const conn = new Connection(RPC_URL, "confirmed");

  type SdkSignedTx = { messageBytes: Uint8Array; signatures: Record<string, Uint8Array | null> };

  const clusterQuery = NETWORK === "mainnet" ? "" : `?cluster=${NETWORK}`;

  async function sendAndConfirm(tx: SdkSignedTx): Promise<string> {
    const wire = encodeTransactionToWire(tx.messageBytes, tx.signatures);

    // Diagnostic: log wire stats before sending
    const sigCount = Object.keys(tx.signatures).length;
    log(
      "[sendAndConfirm] wire stats — sigSlots:", sigCount,
      "msgBytes:", tx.messageBytes.length,
      "wireTotal:", wire.length,
      "msgFirstByte:", tx.messageBytes[0]?.toString(16)
    );

    // Run simulation (no sig-verify) to see if the tx is structurally valid
    // and get program-level logs. This fires in parallel with the submit.
    try {
      const { VersionedTransaction } = await import("@solana/web3.js");
      const vTx = VersionedTransaction.deserialize(wire);
      const sim = await conn.simulateTransaction(vTx, {
        sigVerify: false,
        commitment: "processed",
      });
      if (sim.value.err) {
        console.error(
          "[sendAndConfirm] ⚠️ simulation FAILED — tx will likely be dropped:",
          JSON.stringify(sim.value.err),
          "\n  logs:", sim.value.logs?.join("\n  ") ?? "(none)"
        );
      } else {
        log(
          "[sendAndConfirm] ✅ simulation OK — units:", sim.value.unitsConsumed
        );
      }
    } catch (simErr) {
      warn(
        "[sendAndConfirm] simulation threw (may be a format issue):",
        simErr instanceof Error ? simErr.message : String(simErr)
      );
    }

    // Send once to get a signature, then rebroadcast every RESUBMIT_MS while polling.
    // Solana validators can drop transactions under load — resubmitting keeps it alive.
    async function trySend(): Promise<string> {
      try {
        // No maxRetries override — let the RPC node retry propagation to the
        // leader until the blockhash expires. maxRetries: 0 was silently killing
        // transactions: the RPC sent once, the leader dropped it, nobody retried.
        return await conn.sendRawTransaction(wire, { skipPreflight: true });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        // "already been processed" means a prior attempt confirmed — not an error.
        if (raw.includes("already been processed")) return "";
        console.error("[skipPreflightForwarder] sendRawTransaction error:", e);
        const brief = raw.split(/[:\n]/)[0]?.trim() ?? "RPC send failed";
        throw new Error(`Transaction send failed: ${brief.slice(0, 80)}`);
      }
    }

    const sig = await trySend();
    if (!sig) throw new Error("Transaction send failed: no signature returned");

    log(
      "[sendAndConfirm] ✅ submitted sig:", sig,
      `\n  Solscan:  https://solscan.io/tx/${sig}${clusterQuery}`,
      `\n  Explorer: https://explorer.solana.com/tx/${sig}${clusterQuery}`
    );

    // Solana blockhashes expire after ~150 slots (~60s). Giving up at 55s
    // lets callers retry with a fresh SDK call (new tx, new blockhash)
    // instead of endlessly resubmitting a tx whose blockhash already expired.
    const MAX_WAIT_MS = 55_000;
    const POLL_MS = 2_000;
    const RESUBMIT_MS = 10_000;
    const deadline = Date.now() + MAX_WAIT_MS;
    let lastResubmit = Date.now();
    let pollCount = 0;

    while (Date.now() < deadline) {
      const result = await conn.getSignatureStatus(sig, { searchTransactionHistory: false });
      const status = result.value;
      pollCount++;

      if (status) {
        log(
          "[sendAndConfirm] poll", pollCount, "→ confirmationStatus:", status.confirmationStatus,
          status.err ? "| err: " + JSON.stringify(status.err) : ""
        );
        if (status.err) {
          const errStr = JSON.stringify(status.err);
          console.error("[skipPreflightForwarder] on-chain error:", status.err, "sig:", sig);
          throw new Error(`Transaction failed on-chain: ${errStr.slice(0, 80)}`);
        }
        if (
          status.confirmationStatus === "confirmed" ||
          status.confirmationStatus === "finalized"
        ) {
          log("[sendAndConfirm] confirmed after", pollCount, "polls");
          return sig;
        }
      } else if (pollCount <= 5 || pollCount % 10 === 0) {
        log("[sendAndConfirm] poll", pollCount, "→ null (not yet seen by cluster)");
      }

      // Rebroadcast if the tx hasn't landed yet and enough time has passed.
      if (Date.now() - lastResubmit >= RESUBMIT_MS) {
        lastResubmit = Date.now();
        log("[sendAndConfirm] resubmitting (poll", pollCount, ")");
        trySend().catch(() => { /* ignore resubmit errors — keep polling */ });
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }

    // Final check with history search — catches the "confirmed but evicted from recent cache" case
    const historyCheck = await conn.getSignatureStatus(sig, { searchTransactionHistory: true });
    if (historyCheck.value && !historyCheck.value.err) {
      log("[sendAndConfirm] found in history after timeout — treating as confirmed");
      return sig;
    }
    if (historyCheck.value?.err) {
      console.error("[sendAndConfirm] found in history with error:", historyCheck.value.err);
    }

    throw new Error(
      `Transaction timed out after ${MAX_WAIT_MS / 1000}s — sig: ${sig} — ` +
      `check https://solscan.io/tx/${sig}${clusterQuery}`
    );
  }

  return {
    forwardSequentially: async (transactions: readonly unknown[]): Promise<readonly string[]> => {
      const sigs: string[] = [];
      for (const tx of transactions) sigs.push(await sendAndConfirm(tx as SdkSignedTx));
      return sigs;
    },
    forwardInParallel: async (transactions: readonly unknown[]): Promise<readonly string[]> => {
      return Promise.all((transactions as SdkSignedTx[]).map(sendAndConfirm));
    },
    fireAndForget: async (tx: unknown): Promise<string> => {
      return sendAndConfirm(tx as SdkSignedTx);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ─── Signer factory ──────────────────────────────────────────────────────────

/** Encode a number as compact-u16 (Solana wire format). */
function compactU16(n: number): Uint8Array {
  if (n < 0x80) return new Uint8Array([n]);
  if (n < 0x4000) return new Uint8Array([(n & 0x7f) | 0x80, n >> 7]);
  return new Uint8Array([(n & 0x7f) | 0x80, ((n >> 7) & 0x7f) | 0x80, n >> 14]);
}

/** Parse compact-u16 from bytes, return {value, bytesRead}. */
function readCompactU16(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0, shift = 0, bytesRead = 0;
  while (true) {
    const byte = bytes[offset + bytesRead++];
    value |= (byte & 0x7f) << shift;
    shift += 7;
    if ((byte & 0x80) === 0) break;
  }
  return { value, bytesRead };
}

// ─── Compute budget injection ─────────────────────────────────────────────────
// Phantom auto-injects a SetComputeUnitPrice instruction BEFORE existing ones.
// The Umbra/Arcium deposit program uses SysvarInstructions to verify it is at
// instruction index 1 (0-indexed, after SetComputeUnitLimit at index 0).
// When Phantom prepends its instruction, the deposit shifts to index 2, which
// causes on-chain program error #3012.
//
// Fix: if the transaction already has SetComputeUnitLimit but no SetComputeUnitPrice,
// append a minimal SetComputeUnitPrice(1) at the end before sending to Phantom.
// Phantom detects it's already present and skips injection, keeping the deposit
// instruction at the expected index.

const COMPUTE_BUDGET_PROGRAM_BYTES = bs58.decode("ComputeBudget111111111111111111111111111111");

/** Return the static-account index of the ComputeBudget program in a v0 message, or null. */
function findComputeBudgetIndex(msgBytes: Uint8Array): number | null {
  // v0 format: [version(1)][header(3)][compact-u16 accountCount][32*n accounts]...
  let offset = 4; // skip version byte + 3-byte header
  const { value: accountCount, bytesRead } = readCompactU16(msgBytes, offset);
  offset += bytesRead;
  for (let i = 0; i < accountCount; i++) {
    const start = offset + i * 32;
    if (COMPUTE_BUDGET_PROGRAM_BYTES.every((b, j) => b === msgBytes[start + j])) return i;
  }
  return null;
}

/**
 * Return true if the message already has a SetComputeUnitPrice instruction
 * (discriminant byte 3 as first byte of data for the ComputeBudget program).
 */
function hasSetComputeUnitPrice(msgBytes: Uint8Array, cuIdx: number): boolean {
  let offset = 4;
  const { value: accountCount, bytesRead: acBr } = readCompactU16(msgBytes, offset);
  offset += acBr + accountCount * 32 + 32; // skip accounts + blockhash
  const { value: instrCount, bytesRead: icBr } = readCompactU16(msgBytes, offset);
  offset += icBr;
  for (let i = 0; i < instrCount; i++) {
    const progIdx = msgBytes[offset++];
    // skip account indices
    const { value: acCount, bytesRead: acBr2 } = readCompactU16(msgBytes, offset);
    offset += acBr2 + acCount;
    // read data length, then check first data byte
    const { value: dataLen, bytesRead: dlBr } = readCompactU16(msgBytes, offset);
    offset += dlBr; // offset now points at start of instruction data
    if (progIdx === cuIdx && dataLen >= 1 && msgBytes[offset] === 3) return true;
    offset += dataLen; // advance past data
  }
  return false;
}

/** Append a SetComputeUnitPrice(microLamports) instruction at the end of the instructions section. */
function appendSetComputeUnitPrice(msgBytes: Uint8Array, cuIdx: number, microLamports: bigint): Uint8Array {
  let offset = 4;
  const { value: accountCount, bytesRead: acBr } = readCompactU16(msgBytes, offset);
  offset += acBr + accountCount * 32 + 32;
  const instrCountOffset = offset;
  const { value: instrCount, bytesRead: icBr } = readCompactU16(msgBytes, instrCountOffset);
  offset += icBr;
  // Skip existing instructions to find where they end (= start of ALT section)
  for (let i = 0; i < instrCount; i++) {
    offset++; // programIdIndex
    const { value: acCount, bytesRead: acBr2 } = readCompactU16(msgBytes, offset);
    offset += acBr2 + acCount;
    const { value: dataLen, bytesRead: dlBr } = readCompactU16(msgBytes, offset);
    offset += dlBr + dataLen;
  }
  const instrSectionEnd = offset;
  log(
    "[appendSetComputeUnitPrice] instrCount:", instrCount,
    "instrSectionEnd:", instrSectionEnd,
    "altSectionSize:", msgBytes.length - instrSectionEnd,
    "altFirstByte:", msgBytes[instrSectionEnd]?.toString(16) ?? "eof"
  );

  // Build SetComputeUnitPrice instruction: [cuIdx][0x00=0 accounts][0x09=9 bytes data][3][8-byte LE u64]
  const priceData = new Uint8Array(9);
  priceData[0] = 3;
  let ml = microLamports;
  for (let i = 1; i <= 8; i++) { priceData[i] = Number(ml & 0xffn); ml >>= 8n; }
  const newInstr = new Uint8Array([cuIdx, 0x00, 0x09, ...priceData]);

  const newCountBytes = compactU16(instrCount + 1);
  const oldCountBytes = compactU16(instrCount);

  const before = msgBytes.slice(0, instrCountOffset);
  const existingInstrs = msgBytes.slice(instrCountOffset + oldCountBytes.length, instrSectionEnd);
  const altSection = msgBytes.slice(instrSectionEnd);

  const result = new Uint8Array(
    before.length + newCountBytes.length + existingInstrs.length + newInstr.length + altSection.length
  );
  let pos = 0;
  result.set(before, pos); pos += before.length;
  result.set(newCountBytes, pos); pos += newCountBytes.length;
  result.set(existingInstrs, pos); pos += existingInstrs.length;
  result.set(newInstr, pos); pos += newInstr.length;
  result.set(altSection, pos);
  return result;
}

/**
 * If a v0 transaction message contains SetComputeUnitLimit but no SetComputeUnitPrice,
 * append a SetComputeUnitPrice(1) at the end of the instructions.  This prevents
 * Phantom from prepending its own, which would shift the Umbra deposit instruction
 * from its expected position.
 */
function maybeInjectCUPrice(msgBytes: Uint8Array): Uint8Array {
  const cuIdx = findComputeBudgetIndex(msgBytes);
  if (cuIdx === null) return msgBytes; // no ComputeBudget program → skip
  if (hasSetComputeUnitPrice(msgBytes, cuIdx)) return msgBytes; // already has price → skip

  const injected = appendSetComputeUnitPrice(msgBytes, cuIdx, 10_000n);

  // Validate the injection by deserializing it as a VersionedTransaction.
  // If our byte-level injection corrupted the message structure (e.g. wrong ALT
  // section boundary), deserialization will throw and we fall back to the original
  // bytes — letting Phantom inject its own CU price instead.
  try {
    const fakeWire = new Uint8Array(1 + 64 + injected.length);
    fakeWire[0] = 1; // 1 signature slot
    // 64 zero bytes (invalid sig, but we only want to check structure)
    fakeWire.set(injected, 65);
    VersionedTransaction.deserialize(fakeWire);
    log("[createBrowserSigner] injection valid ✓ — injecting SetComputeUnitPrice(10000)");
    return injected;
  } catch (e) {
    warn(
      "[createBrowserSigner] injection produced invalid message — falling back to original bytes " +
      "(Phantom will inject its own CU price):",
      e instanceof Error ? e.message : String(e)
    );
    return msgBytes;
  }
}

async function verifyEd25519(
  pubKeyBytes: Uint8Array,
  sig: Uint8Array,
  msg: Uint8Array
): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      pubKeyBytes.slice().buffer as ArrayBuffer,
      { name: "Ed25519" },
      false,
      ["verify"]
    );
    return await crypto.subtle.verify(
      "Ed25519",
      key,
      sig.slice().buffer as ArrayBuffer,
      msg.slice().buffer as ArrayBuffer
    );
  } catch {
    return false;
  }
}

type SolanaSignTxFeature = {
  signTransaction: (
    ...inputs: readonly { account: WalletAccount; transaction: Uint8Array }[]
  ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
};

/**
 * Map from ed25519 signer address (bs58) → 32-byte seed.  The capturing
 * derivers below populate this during registration; createBrowserSigner looks
 * up the seed by the slot's address so it can re-sign that slot against
 * Phantom's post-injection message bytes.
 *
 * Registration uses TWO distinct keypairs as pre-signed signers:
 *   1. userAccountX25519KeypairDeriver  → confidential step (registerX25519)
 *   2. masterViewingKeyEncryptingX25519KeypairDeriver → anonymous step
 * Both seeds must be captured or the second tx fails signature verification
 * silently on the validator.
 */
export type CommitmentKeyMap = Map<string, Uint8Array>;

/** Derive the bs58-encoded ed25519 address from a 32-byte seed. */
function addressFromSeed(seed: Uint8Array): string {
  const pub = nobleEd25519.getPublicKey(seed);
  return bs58.encode(pub);
}

/**
 * Wrap an SDK Curve25519 keypair deriver so the Ed25519 seed (and its derived
 * address) is captured into `keyMap` each time the SDK calls it during
 * registration.  We don't change what the deriver returns — we just observe
 * it and stash the seed so createBrowserSigner can re-sign the pre-signed
 * keypair slot against Phantom's post-injection message bytes.
 */
function makeCapturingDeriver<T extends () => Promise<{ ed25519Keypair: { seed: Uint8Array } }>>(
  baseDeriver: T,
  keyMap: CommitmentKeyMap
): T {
  return (async () => {
    const result = await baseDeriver();
    const seed = result.ed25519Keypair.seed;
    keyMap.set(addressFromSeed(seed), seed);
    return result;
  }) as T;
}

/**
 * Custom browser signer that manually builds the signaturesFirst wire bytes,
 * sends to Phantom, decodes the response, and applies signatures.
 *
 * The key problem this solves: Phantom auto-injects a SetComputeUnitPrice
 * instruction into transactions before signing, which modifies the message
 * bytes.  The Umbra registration transaction has TWO required signers:
 *   1. The user's wallet (Phantom)
 *   2. The x25519ProvingSigner — a derived Ed25519 keypair (commitment key)
 *
 * The SDK pre-signs slot 2 with the original message, then calls our
 * signTransaction to get slot 1 from Phantom.  Phantom injects CU price,
 * changing the message, so the pre-signature for slot 2 is now invalid.
 *
 * Fix: intercept the keypair derivers (via `commitmentKeyMap`) to capture
 * every Ed25519 seed used as a pre-signed signer, keyed by its address.
 * Registration actually uses TWO distinct keypairs (user-account X25519 +
 * MVK X25519) in two separate transactions, so we must look up the seed by
 * slot address and re-sign that specific slot against Phantom's
 * post-injection message bytes.
 */
export function createBrowserSigner(
  wallet: Wallet,
  account: WalletAccount,
  commitmentKeyMap?: CommitmentKeyMap
) {
  const signTxFeature = (wallet.features as Record<string, unknown>)[
    "solana:signTransaction"
  ] as SolanaSignTxFeature | undefined;

  // Fall back to SDK signer if the wallet doesn't expose signTransaction.
  if (!signTxFeature?.signTransaction) {
    return createSignerFromWalletAccount(wallet, account);
  }

  const base = createSignerFromWalletAccount(wallet, account);

  return {
    address: account.address as typeof base.address,

    async signTransaction(
      transaction: Parameters<typeof base.signTransaction>[0]
    ): ReturnType<typeof base.signTransaction> {
      const numSigs = Object.keys(transaction.signatures).length;
      const countBytes = compactU16(numSigs);

      // Strategy:
      //
      // WITH commitment seed: Don't inject CU price — let Phantom inject
      //   naturally if it wants. After Phantom signs the wallet slot, we
      //   re-sign the commitment slot using the captured seed against the
      //   same message bytes Phantom produced. Both sigs are valid for the
      //   same message regardless of whether Phantom modified it.
      //
      // WITHOUT seed (fallback / single-signer txs): Inject CU price so
      //   Phantom doesn't modify the message.  Any pre-existing SDK sig
      //   stays valid for the injected message.
      const walletAddr = account.address as string;
      const preSignerAddrs = Object.keys(transaction.signatures).filter(
        (a) => a !== walletAddr
      );
      const hasSeed = preSignerAddrs.some((a) => commitmentKeyMap?.has(a));
      const msgToSign = hasSeed
        ? new Uint8Array(transaction.messageBytes)   // no injection needed
        : maybeInjectCUPrice(new Uint8Array(transaction.messageBytes));

      // Build signaturesFirst wire bytes with null (zero) signatures.
      const wireBytes = new Uint8Array(
        countBytes.length + numSigs * 64 + msgToSign.length
      );
      wireBytes.set(countBytes, 0);
      // null sigs: zero-filled (default for new Uint8Array)
      wireBytes.set(msgToSign, countBytes.length + numSigs * 64);

      // Send to the wallet.
      const [output] = await signTxFeature.signTransaction({
        account,
        transaction: wireBytes,
      });
      const signedBytes = output.signedTransaction;

      // Decode signed bytes → extract signatures and message.
      const { value: returnedNumSigs, bytesRead: headerSize } = readCompactU16(signedBytes, 0);
      const sigsFromWallet: Array<Uint8Array | null> = [];
      for (let i = 0; i < returnedNumSigs; i++) {
        const start = headerSize + i * 64;
        const bytes = signedBytes.slice(start, start + 64);
        sigsFromWallet.push(bytes.every((b) => b === 0) ? null : bytes);
      }
      // Message bytes as Phantom returned them.
      const phantomMsgBytes = signedBytes.slice(headerSize + returnedNumSigs * 64);

      // Did Phantom modify the message (e.g. injected CU price)?
      const msgMatches =
        phantomMsgBytes.length === msgToSign.length &&
        phantomMsgBytes.every((b, i) => b === msgToSign[i]);

      if (!msgMatches) {
        log(
          "[createBrowserSigner] Phantom injected CU price (+",
          phantomMsgBytes.length - msgToSign.length, "bytes)"
        );
      }

      // The effective message is what Phantom actually signed — use its bytes
      // so our wire transaction matches what was signed.
      const effectiveMessageBytes = msgMatches ? msgToSign : phantomMsgBytes;

      // Verify the wallet signature client-side.
      const walletSigIdx = Object.keys(transaction.signatures).indexOf(account.address as string);
      const walletSig = walletSigIdx >= 0 && walletSigIdx < sigsFromWallet.length
        ? sigsFromWallet[walletSigIdx]
        : sigsFromWallet[0];
      if (walletSig) {
        const pubKeyBytes = bs58.decode(account.address);
        const valid = await verifyEd25519(pubKeyBytes, walletSig, effectiveMessageBytes);
        log("[createBrowserSigner] wallet sig verifies:", valid,
          "| hasSeed:", hasSeed, "| msgChanged:", !msgMatches);
        if (!valid) {
          throw new Error(
            "Wallet returned a signature that does not verify. " +
            "Please disconnect and reconnect your wallet, then try again."
          );
        }
      }

      // Build updated signatures map.
      const signerAddresses = Object.keys(transaction.signatures);
      const origSigs = transaction.signatures as Record<string, Uint8Array | null>;
      const newSigs = { ...origSigs };

      for (const [idx, addr] of signerAddresses.entries()) {
        if (addr === (account.address as string)) {
          // Wallet slot: use Phantom's signature.
          const fromWallet = idx < sigsFromWallet.length ? sigsFromWallet[idx] : null;
          if (fromWallet !== null) newSigs[addr] = fromWallet;
        } else if (commitmentKeyMap?.has(addr)) {
          // Commitment key slot: re-sign against the effective message bytes.
          // The seed is a raw 32-byte Ed25519 seed (RFC 8032) — @noble/curves
          // implements the same standard so signatures are identical to what
          // the SDK's createKeyPairSignerFromPrivateKeyBytes would produce.
          const seed = commitmentKeyMap.get(addr)!;
          const reSig = nobleEd25519.sign(effectiveMessageBytes, seed);
          newSigs[addr] = reSig;
          log("[createBrowserSigner] re-signed commitment slot:", addr.slice(0, 8));
        } else {
          // Fallback: use Phantom's sig if present, else preserve the pre-existing sig.
          const fromWallet = idx < sigsFromWallet.length ? sigsFromWallet[idx] : null;
          const preExisting = origSigs[addr];
          const preExistingIsReal = preExisting !== null && !preExisting.every((b) => b === 0);
          if (fromWallet !== null) newSigs[addr] = fromWallet;
          else if (preExistingIsReal) newSigs[addr] = preExisting;
        }
      }

      log(
        "[createBrowserSigner] slots:", signerAddresses.length,
        "| walletSlot:", signerAddresses.indexOf(account.address as string),
        "| msgChanged:", !msgMatches,
        "| effectiveMsgLen:", effectiveMessageBytes.length
      );

      return {
        ...transaction,
        messageBytes: effectiveMessageBytes,
        signatures: newSigs,
      } as unknown as Awaited<ReturnType<typeof base.signTransaction>>;
    },

    async signTransactions(
      transactions: Parameters<typeof base.signTransactions>[0]
    ): ReturnType<typeof base.signTransactions> {
      // Use the single-tx path for each one.
      return Promise.all(transactions.map((tx) => (this as typeof base).signTransaction(tx))) as ReturnType<typeof base.signTransactions>;
    },

    signMessage: base.signMessage.bind(base),
  } as typeof base;
}

export async function createEphemeralSigner(privateKeyBytes: Uint8Array) {
  // createSignerFromPrivateKeyBytes requires 64 bytes (seed + public key).
  // If we only have the 32-byte seed, expand it via Keypair.fromSeed().
  const keyBytes =
    privateKeyBytes.length === 32
      ? Keypair.fromSeed(privateKeyBytes).secretKey
      : privateKeyBytes;
  return createSignerFromPrivateKeyBytes(keyBytes);
}

// ─── Client factory ──────────────────────────────────────────────────────────

/**
 * Build an Umbra client.
 *
 * @param skipPreflight  When true, uses the skip-preflight forwarder instead of
 *   the SDK's polling forwarder.  Required for the sender client (step 4) because
 *   the SDK's getPollingTransactionForwarder uses @solana/kit's
 *   getBase64EncodedWireTransaction which re-encodes the transaction from
 *   structured fields rather than using messageBytes verbatim.  Our custom signer
 *   builds wire bytes manually (to inject CU price and avoid Phantom's injection),
 *   so the two encoding paths diverge — preflight simulation sees different bytes
 *   than what Phantom signed and fails.  Our skip-preflight forwarder calls
 *   encodeTransactionToWire(messageBytes, signatures) directly, keeping the exact
 *   bytes stable from Phantom's signing all the way to the validator.
 */
export async function makeClient(
  signer: Awaited<ReturnType<typeof createSignerFromPrivateKeyBytes>>,
  opts?: { skipPreflight?: boolean }
) {
  const transactionForwarder = opts?.skipPreflight
    ? makeSkipPreflightForwarder()
    : getPollingTransactionForwarder({ rpcUrl: RPC_URL });

  // Always use polling computation monitor — devnet WebSocket endpoints drop
  // unpredictably, which caused the ephemeral registration tx to hang at
  // "Registering privacy channel…" even after confirming on-chain.
  const computationMonitor = getPollingComputationMonitor({ rpcUrl: RPC_URL });

  return getUmbraClient(
    {
      signer,
      network: NETWORK,
      rpcUrl: RPC_URL,
      rpcSubscriptionsUrl: RPC_WS_URL,
      indexerApiEndpoint: UMBRA_INDEXER_URL,
      deferMasterSeedSignature: true,
    },
    { transactionForwarder, computationMonitor }
  );
}

// ─── Registration ────────────────────────────────────────────────────────────

export async function registerAccount(
  signer: Awaited<ReturnType<typeof createSignerFromPrivateKeyBytes>>
): Promise<void> {
  log("[registerAccount] start", signer.address.slice(0, 8));
  let client: Awaited<ReturnType<typeof makeClient>>;
  try {
    client = await makeClient(signer);
  } catch (e) {
    throw new Error(`[3a makeClient] ${e instanceof Error ? e.message : String(e)}`);
  }

  // Check if already fully registered — registration is idempotent but skipping
  // the prover avoids a heavy CDN fetch on repeat calls.
  try {
    log("[registerAccount] querying existing account…");
    const querier = getUserAccountQuerierFunction({ client });
    const existing = await querier(signer.address as Address);
    log("[registerAccount] account state:", existing.state);
    if (existing.state === "exists") {
      const { isUserCommitmentRegistered, isUserAccountX25519KeyRegistered } =
        existing.data;
      if (isUserCommitmentRegistered && isUserAccountX25519KeyRegistered) {
        log("[registerAccount] already fully registered, skipping");
        return;
      }
    }
  } catch (e) {
    throw new Error(`[3b account-query] ${e instanceof Error ? e.message : String(e)}`);
  }

  try {
    log("[registerAccount] building prover…");
    const registrationProver = getUserRegistrationProver(makeZkProverDeps());
    const register = getUserRegistrationFunction(
      { client },
      { zkProver: registrationProver }
    );
    log("[registerAccount] calling register()…");
    await register({ confidential: true, anonymous: true });
    log("[registerAccount] done");
  } catch (e) {
    throw new Error(`[3c register-tx] ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Amount validation ────────────────────────────────────────────────────────

export function validateAmount(amountHuman: string, token: Token): string | null {
  const n = parseFloat(amountHuman);
  if (!amountHuman || isNaN(n) || !isFinite(n)) return "Enter a valid amount.";
  if (n <= 0) return "Amount must be greater than zero.";
  const decimals = TOKEN_CONFIG[token].decimals;
  const minAmount = 1 / 10 ** decimals;
  if (n < minAmount) return `Minimum amount is ${minAmount} ${token}.`;
  // Clamp to supported decimals
  const amountRaw = Math.round(n * 10 ** decimals);
  if (amountRaw <= 0) return "Amount too small after rounding.";
  return null;
}

// ─── Send / Create link ───────────────────────────────────────────────────────

export interface CreateLinkArgs {
  senderWallet: Wallet;
  senderAccount: WalletAccount;
  amountHuman: string;
  token: Token;
  onStatusChange: (msg: string) => void;
  /** If set, the claim page will only allow this wallet address to claim. */
  recipientAddress?: string;
  /** Optional message visible to the recipient when they open the claim page. Encoded in the URL hash — never touches the server. */
  memo?: string;
}

export interface CreateLinkResult {
  url: string;
  meta: PaymentLinkMeta;
}

export async function createPaymentLink({
  senderWallet,
  senderAccount,
  amountHuman,
  token,
  onStatusChange,
  recipientAddress,
  memo,
}: CreateLinkArgs): Promise<CreateLinkResult> {
  const validationError = validateAmount(amountHuman, token);
  if (validationError) throw new Error(validationError);

  const tokenCfg = TOKEN_CONFIG[token];
  const amountRaw = BigInt(
    Math.round(parseFloat(amountHuman) * 10 ** tokenCfg.decimals)
  );

  try {
    // 1. Generate ephemeral keypair
    onStatusChange("Generating ephemeral keypair…");
    let ephemeralSigner: Awaited<ReturnType<typeof createEphemeralSigner>>;
    let ephemeralPrivateKey: Uint8Array;
    try {
      ephemeralPrivateKey = crypto.getRandomValues(new Uint8Array(32));
      ephemeralSigner = await createEphemeralSigner(ephemeralPrivateKey);
    } catch (e) {
      throw new Error(`[step 1 keygen] ${e instanceof Error ? e.message : String(e)}`);
    }
    log("[createPaymentLink] ephemeral address:", ephemeralSigner.address.toString());

    // 2. Fund ephemeral with SOL for registration fees
    onStatusChange("Funding privacy channel…");
    try {
      await fundEphemeral(senderWallet, senderAccount, ephemeralSigner.address.toString());
    } catch (e) {
      console.error("[createPaymentLink] step 2 fund error:", e);
      throw new Error(`[step 2 fund] ${e instanceof Error ? e.message : String(e)}`);
    }

    // 3. Register ephemeral with Umbra
    onStatusChange("Registering privacy channel…");
    try {
      await registerAccount(ephemeralSigner);
    } catch (e) {
      console.error("[createPaymentLink] step 3 register error:", e);
      throw new Error(`[step 3 register] ${e instanceof Error ? e.message : String(e)}`);
    }

    // 4. Build sender client (used for both registration check and deposit).
    //
    //    skipPreflight: true is required here — not to bypass the Umbra program,
    //    but because the SDK's getPollingTransactionForwarder uses @solana/kit's
    //    getBase64EncodedWireTransaction which re-encodes the transaction from
    //    structured fields rather than using messageBytes verbatim.  That produces
    //    wire bytes that differ from what Phantom signed, causing a "signature
    //    verification failed" at preflight.
    //
    //    Our makeSkipPreflightForwarder calls encodeTransactionToWire(messageBytes,
    //    signatures) directly, so the exact bytes Phantom signed are what gets sent.
    // Shared map (address → seed): populated by the capturing derivers during
    // registration (step 4a), consumed by the browser signer in
    // createBrowserSigner below when it needs to re-sign a pre-signed keypair
    // slot against Phantom's post-injection message bytes.  Registration uses
    // TWO distinct keypairs (user-account X25519 + MVK X25519) across two
    // transactions, so we key by address to re-sign the correct slot.  The
    // deposit tx in step 4b is single-signer so the map is simply unused.
    const senderCommitmentKeys: CommitmentKeyMap = new Map();
    const senderSigner = createBrowserSigner(
      senderWallet,
      senderAccount,
      senderCommitmentKeys
    );
    let senderClient: Awaited<ReturnType<typeof makeClient>>;
    try {
      senderClient = await makeClient(
        senderSigner as Parameters<typeof makeClient>[0],
        { skipPreflight: true }
      );
    } catch (e) {
      console.error("[createPaymentLink] step 4 makeClient error:", e);
      throw new Error(`[step 4 makeClient] ${e instanceof Error ? e.message : String(e)}`);
    }

    // 4a. Ensure sender has a registered Umbra account.
    //     The deposit instruction requires `depositor_user_account` to be
    //     initialized on-chain.  First-time senders must register — this
    //     triggers a signMessage (master seed) and signTransaction (ZK
    //     registration) prompt in the wallet.
    try {
      const senderAccountQuerier = getUserAccountQuerierFunction({ client: senderClient });
      const senderAccountState = await senderAccountQuerier(senderSigner.address as Address);
      const needsRegistration =
        senderAccountState.state !== "exists" ||
        !senderAccountState.data.isUserCommitmentRegistered ||
        !senderAccountState.data.isUserAccountX25519KeyRegistered;

      if (needsRegistration) {
        onStatusChange("Registering sender privacy account (first time only)…");
        log("[createPaymentLink] step 4a: needs registration, building prover…");
        const senderRegProver = getUserRegistrationProver(makeZkProverDeps());
        log("[createPaymentLink] step 4a: prover built, calling senderRegister…");
        // Capture the commitment-key Ed25519 seed so the browser signer can
        // re-sign the commitment slot against Phantom's post-injection message.
        // The senderSigner above shares this same seedRef (see createBrowserSigner
        // below).
        const senderRegister = getUserRegistrationFunction(
          { client: senderClient },
          {
            zkProver: senderRegProver,
            keys: {
              userAccountX25519KeypairDeriver: makeCapturingDeriver(
                getUserAccountX25519KeypairDeriver({ client: senderClient }),
                senderCommitmentKeys
              ),
              masterViewingKeyEncryptingX25519KeypairDeriver: makeCapturingDeriver(
                getMasterViewingKeyX25519KeypairDeriver({ client: senderClient }),
                senderCommitmentKeys
              ),
            },
          }
        );
        await senderRegister({ confidential: true, anonymous: true });
      }
    } catch (e) {
      console.error("[createPaymentLink] step 4a sender-register error:", e);
      throw new Error(`[step 4a sender-register] ${e instanceof Error ? e.message : String(e)}`);
    }

    // 4b. Create receiver-claimable UTXO from sender → ephemeral (public balance)
    onStatusChange("Depositing into shielded pool…");
    const utxoProver = getCreateReceiverClaimableUtxoFromPublicBalanceProver(makeZkProverDeps());
    const createUtxo = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
      { client: senderClient },
      { zkProver: utxoProver }
    );

    try {
      log("[createPaymentLink] step 4b createUtxo calling…", {
        destination: ephemeralSigner.address.toString(),
        mint: tokenCfg.mint,
        amount: amountRaw.toString(),
      });
      await createUtxo({
        destinationAddress: ephemeralSigner.address,
        mint: tokenCfg.mint as Address,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        amount: amountRaw as any,
      });
      log("[createPaymentLink] step 4b createUtxo OK — UTXO should now be in indexer");
      try {
        await debugLogRecentUtxos(ephemeralSigner.address.toString(), 5);
      } catch {}
    } catch (e) {
      console.error("[step 4b createUtxo] full error:", e);
      const msg = e instanceof Error ? e.message : String(e);
      const cause = (e as { cause?: unknown }).cause;
      const logs = (e as { logs?: string[] }).logs;
      const extra = logs ? `\nLogs: ${logs.join("\n")}` : cause ? `\nCause: ${String(cause)}` : "";
      throw new Error(`[step 4b createUtxo] ${msg}${extra}`);
    }

    // 5. Build URL — private key + token go in hash (never reaches server)
    //    Link ID, expiry, and optional recipient lock go in query params
    const claimSecret = bs58.encode(ephemeralPrivateKey);
    const now = Date.now();
    const expiresAt = now + LINK_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
    const linkId = crypto.randomUUID();
    const lockParam = recipientAddress
      ? `&to=${encodeURIComponent(recipientAddress)}`
      : "";
    const memoSuffix = memo?.trim() ? `:${encodeURIComponent(memo.trim())}` : "";
    const url =
      `${window.location.origin}/claim` +
      `?lid=${linkId}&exp=${expiresAt}${lockParam}` +
      `#${claimSecret}:${token}${memoSuffix}`;

    const meta: PaymentLinkMeta = {
      id: linkId,
      amount: amountHuman,
      token,
      decimals: tokenCfg.decimals,
      amountRaw: amountRaw.toString(),
      createdAt: now,
      expiresAt,
      claimed: false,
      ...(recipientAddress ? { lockedTo: recipientAddress } : {}),
    };

    // 6. Persist non-sensitive metadata (fire-and-forget, Supabase optional)
    const timestamp = Math.floor(Date.now() / 1000);
    const authMessage = `Authorize VeilPay Link: ${linkId} by ${senderAccount.address} at ${timestamp}`;
    
    let signature = "";
    try {
      const signFeature = senderWallet.features["solana:signMessage"] as {
        signMessage: (
          ...inputs: readonly { account: WalletAccount; message: Uint8Array }[]
        ) => Promise<readonly { signature: Uint8Array }[]>;
      };
      const results = await signFeature.signMessage({
        account: senderAccount,
        message: new TextEncoder().encode(authMessage),
      });
      signature = Buffer.from(results[0].signature).toString("base64");
    } catch (e) {
      warn("Failed to sign metadata authorization message", e);
    }

    if (signature) {
      fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: meta.id,
          amount: meta.amount,
          token: meta.token,
          amount_raw: meta.amountRaw,
          decimals: meta.decimals,
          created_at: meta.createdAt,
          expires_at: meta.expiresAt,
          sender_address: senderAccount.address,
          signature,
          timestamp,
          ...(meta.lockedTo ? { locked_to: meta.lockedTo } : {}),
        }),
      }).catch(() => {});
    }

    return { url, meta };
  } catch (err) {
    throw new Error(normalizeError(err));
  }
}

// ─── Claim ────────────────────────────────────────────────────────────────────

export interface ScanResult {
  hasUtxo: boolean;
  amountHuman: string;
  token: Token;
  amountRaw: bigint;
}

/**
 * Parse the claim secret, token, and optional memo from the URL hash.
 * Hash format: #<bs58_key>:<TOKEN>[:<urlencoded_memo>]
 */
export function parseClaimHash(hash: string): {
  claimSecret: string;
  token: Token;
  memo?: string;
} {
  const stripped = hash.startsWith("#") ? hash.slice(1) : hash;
  const firstColon = stripped.indexOf(":");
  if (firstColon === -1) return { claimSecret: stripped, token: "USDC" };
  const claimSecret = stripped.slice(0, firstColon);
  const rest = stripped.slice(firstColon + 1);
  const secondColon = rest.indexOf(":");
  const tokenStr = secondColon === -1 ? rest : rest.slice(0, secondColon);
  const token: Token = tokenStr === "SOL" || tokenStr === "USDC" ? tokenStr : "USDC";
  let memo: string | undefined;
  if (secondColon !== -1) {
    try { memo = decodeURIComponent(rest.slice(secondColon + 1)); } catch { /* ignore malformed */ }
  }
  return { claimSecret, token, memo };
}

export const MAX_LEAVES_PER_TREE = 1n << 20n; // 2^20, matches SDK constant

/**
 * Determine which tree(s) contain recent deposits.  The indexer's stats
 * expose `latest_absolute_index` — we derive the current tree from that
 * and also scan the previous tree as a safety margin in case we crossed
 * a boundary between deposit and scan.
 */
export async function getRecentTreeIndices(): Promise<bigint[]> {
  const readClient = new ReadServiceClient({ endpoint: UMBRA_INDEXER_URL });
  const stats = await readClient.getStats();
  log(
    "[indexer-stats] total_utxos=" + stats.total_utxos.toString() +
    " latest_absolute_index=" + String(stats.latest_absolute_index)
  );
  if (stats.latest_absolute_index === null) return [0n];
  const current = stats.latest_absolute_index / MAX_LEAVES_PER_TREE;
  return current > 0n ? [current, current - 1n] : [0n];
}

/**
 * Diagnostic: dump the most recent N UTXOs' depositor pubkeys.  If our
 * deposit is in the indexer, one of these should be our sender's MVK pubkey.
 */
async function debugLogRecentUtxos(ephemeralAddress: string, count = 10): Promise<void> {
  try {
    const readClient = new ReadServiceClient({ endpoint: UMBRA_INDEXER_URL });
    const stats = await readClient.getStats();
    const latest = stats.latest_absolute_index;
    if (latest === null) {
      log("[indexer-debug] indexer is empty");
      return;
    }
    const start = latest >= BigInt(count) ? latest - BigInt(count) + 1n : 0n;
    const res = await readClient.getUtxoData({ start, end: latest, limit: BigInt(count) });
    log(
      `[indexer-debug] last ${res.items.length} UTXOs ` +
      `(for ephemeral ${ephemeralAddress.slice(0, 8)}…):`
    );
    for (const u of res.items) {
      log(
        `  abs=${u.absolute_index} tree=${u.tree_index} ins=${u.insertion_index}` +
        ` slot=${u.slot} depositor_x25519=${u.depositor_x25519_public_key.slice(0, 16)}…`
      );
    }
  } catch (e) {
    warn("[indexer-debug] dump failed:", e);
  }
}

// ─── Confidential Transfer ────────────────────────────────────────────────────
// Sends from the caller's public token balance directly into the recipient's
// Umbra encrypted balance.  The amount is hidden on-chain; only sender↔recipient
// relationship is visible (unlike private links which are fully anonymous).

export interface ConfidentialTransferArgs {
  senderWallet: Wallet;
  senderAccount: WalletAccount;
  recipientAddress: string;
  amountHuman: string;
  token: Token;
  onStatusChange: (msg: string) => void;
}

export interface ConfidentialTransferResult {
  signature: string;
}

export async function confidentialTransfer({
  senderWallet,
  senderAccount,
  recipientAddress,
  amountHuman,
  token,
  onStatusChange,
}: ConfidentialTransferArgs): Promise<ConfidentialTransferResult> {
  const validationError = validateAmount(amountHuman, token);
  if (validationError) throw new Error(validationError);

  const tokenCfg = TOKEN_CONFIG[token];
  const amountRaw = BigInt(Math.round(parseFloat(amountHuman) * 10 ** tokenCfg.decimals));

  const senderCommitmentKeys: CommitmentKeyMap = new Map();
  const senderSigner = createBrowserSigner(senderWallet, senderAccount, senderCommitmentKeys);

  onStatusChange("Connecting to Umbra…");
  let senderClient: Awaited<ReturnType<typeof makeClient>>;
  try {
    senderClient = await makeClient(
      senderSigner as Parameters<typeof makeClient>[0],
      { skipPreflight: true }
    );
  } catch (e) {
    throw new Error(`[setup] ${e instanceof Error ? e.message : String(e)}`);
  }

  // Recipient must have a registered Umbra account for their encrypted balance PDAs to exist.
  onStatusChange("Verifying recipient account…");
  try {
    const recQuerier = getUserAccountQuerierFunction({ client: senderClient });
    const recState = await recQuerier(recipientAddress as Address);
    if (
      recState.state !== "exists" ||
      !recState.data.isUserAccountX25519KeyRegistered
    ) {
      throw new Error(
        "Recipient has no VeilPay account. They must connect to VeilPay at least once before receiving confidential transfers."
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("VeilPay")) throw new Error(msg);
    throw new Error(`Could not verify recipient: ${msg}`);
  }

  onStatusChange("Encrypting and sending to recipient…");
  try {
    const deposit = getPublicBalanceToEncryptedBalanceDirectDepositorFunction({
      client: senderClient,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = await deposit(recipientAddress as Address, tokenCfg.mint as Address, amountRaw as any);
    return { signature: typeof sig === "string" ? sig : String(sig) };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Transfer failed: ${msg}`);
  }
}

/** Format a raw token amount to a human-readable string with no trailing zeros. */
function formatHumanAmount(rawAmount: bigint, decimals: number): string {
  const human = Number(rawAmount) / 10 ** decimals;
  if (decimals === 6) return human.toFixed(2); // USD-pegged: always 2 decimal places
  return parseFloat(human.toFixed(decimals)).toString(); // strip trailing zeros
}

/** Scan the Umbra pool for UTXOs waiting to be claimed with this secret. */
export async function scanForUtxo(
  claimSecret: string,
  token: Token,
  opts?: { maxAttempts?: number; retryDelayMs?: number }
): Promise<ScanResult> {
  const maxAttempts = opts?.maxAttempts ?? 15;
  const retryDelayMs = opts?.retryDelayMs ?? 4000;

  try {
    const ephemeralPrivateKey = bs58.decode(claimSecret);
    const ephemeralSigner = await createEphemeralSigner(ephemeralPrivateKey);
    const client = await makeClient(ephemeralSigner);
    const scanner = getClaimableUtxoScannerFunction({ client });

    const treeIndices = await getRecentTreeIndices();
    log("[scanForUtxo] scanning trees:", treeIndices.map(String));
    await debugLogRecentUtxos(ephemeralSigner.address.toString());

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const totals = { pubRec: 0, selfBurn: 0, recv: 0, pubSelfBurn: 0 };
      let foundUtxo: Awaited<ReturnType<typeof scanner>>["publicReceived"][number] | null = null;

      try {
        for (const treeIndex of treeIndices) {
          const result = await scanner(treeIndex as U32, 0n as U32);
          totals.pubRec += result.publicReceived.length;
          totals.selfBurn += result.selfBurnable.length;
          totals.recv += result.received.length;
          totals.pubSelfBurn += result.publicSelfBurnable.length;
          if (result.publicReceived.length > 0) {
            foundUtxo = result.publicReceived[0];
            break;
          }
        }
        log(
          `[scanForUtxo] attempt ${attempt}/${maxAttempts}` +
          ` → publicReceived=${totals.pubRec}` +
          ` selfBurnable=${totals.selfBurn}` +
          ` received=${totals.recv}` +
          ` publicSelfBurnable=${totals.pubSelfBurn}`
        );
      } catch (scanErr) {
        warn(`[scanForUtxo] attempt ${attempt} scanner error:`, scanErr);
        if (attempt === maxAttempts) throw scanErr;
        await new Promise((r) => setTimeout(r, retryDelayMs));
        continue;
      }

      if (foundUtxo) {
        const decimals = TOKEN_CONFIG[token].decimals;
        const amountRaw = BigInt(foundUtxo.amount.toString());
        const amountHuman = formatHumanAmount(amountRaw, decimals);
        return { hasUtxo: true, amountHuman, token, amountRaw };
      }

      if (attempt < maxAttempts) {
        log(`[scanForUtxo] nothing yet, retrying in ${retryDelayMs}ms…`);
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
    }

    return { hasUtxo: false, amountHuman: "0", token, amountRaw: 0n };
  } catch (err) {
    throw new Error(normalizeError(err));
  }
}

export interface ClaimArgs {
  claimSecret: string;
  token: Token;
  linkId: string | null;
  recipientAddress: string;
  onStatusChange: (msg: string) => void;
  /**
   * For wallet-locked links: the address the link is locked to.
   * When set, `signMessage` must also be provided.
   */
  lockedTo?: string;
  /**
   * Signs arbitrary bytes with the recipient's connected wallet.
   * Required when `lockedTo` is set — used to prove wallet ownership
   * to the server before the DB claim record is written.
   */
  signMessage?: (message: Uint8Array) => Promise<Uint8Array>;
}

export interface ClaimResult {
  signature: string;
}

/** Claim the UTXO and withdraw to recipient's public wallet. */
export async function claimPaymentLink({
  claimSecret,
  token,
  linkId,
  recipientAddress,
  onStatusChange,
  lockedTo,
  signMessage,
}: ClaimArgs): Promise<ClaimResult> {
  try {
    onStatusChange("Reconstructing claim key…");
    const ephemeralPrivateKey = bs58.decode(claimSecret);
    const ephemeralSigner = await createEphemeralSigner(ephemeralPrivateKey);
    
    // Fast-Path Claimed Check: The Ephemeral Wallet is funded with ~0.018 SOL at creation.
    // When a claim completes, we sweep 100% of the remaining SOL out of this wallet.
    // If the balance is nearly zero (< 0.005 SOL), it is absolute on-chain proof the link was swept!
    const connection = new Connection(RPC_URL, "confirmed");
    const solBalance = await connection.getBalance(new PublicKey(ephemeralSigner.address.toString()), "confirmed");
    if (solBalance < 5000000) { // 0.005 SOL
      throw new Error("This payment link has already been claimed.");
    }

    const client = await makeClient(ephemeralSigner, { skipPreflight: false });

    // Re-scan to get the UTXO
    onStatusChange("Scanning shielded pool…");
    const scanner = getClaimableUtxoScannerFunction({ client });
    const treeIndices = await getRecentTreeIndices();
    let utxo: Awaited<ReturnType<typeof scanner>>["publicReceived"][number] | null = null;
    for (const treeIndex of treeIndices) {
      const { publicReceived } = await scanner(treeIndex as U32, 0n as U32);
      if (publicReceived.length > 0) {
        utxo = publicReceived[0];
        break;
      }
    }

    const tokenCfg = TOKEN_CONFIG[token];
    const mintAddress = tokenCfg.mint as Address;
    
    // Fast-path recovery check: Did the user already complete the ZK proof step?
    const querier = getEncryptedBalanceQuerierFunction({ client });
    const balanceMap = await querier([mintAddress]);
    const existingBalanceResult = balanceMap.get(mintAddress);
    const hasEncryptedBalance = existingBalanceResult?.state === "shared" && BigInt(existingBalanceResult.balance.toString()) > 0n;

    if (!utxo && !hasEncryptedBalance) {
      throw new Error("This payment link has already been claimed or does not exist.");
    }

    let originalAmountRaw = 0n;

    // If we have a UTXO, run the heavy ZK proof generation to move it into the encrypted balance
    if (utxo) {
      originalAmountRaw = BigInt(utxo.amount.toString());
      // Claim UTXO → ephemeral encrypted balance (relayer pays fees)
      onStatusChange("Breaking on-chain link…");
      const relayer = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER_URL });
      const claimProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver(makeZkProverDeps());

      if (!client.fetchBatchMerkleProof) {
        throw new Error("Umbra indexer is unavailable — fetchBatchMerkleProof missing.");
      }

      const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
        { client },
        {
          fetchBatchMerkleProof: client.fetchBatchMerkleProof,
          zkProver: claimProver,
          relayer,
        }
      );
      const claimResult = await claim([utxo]);

      // Poll each batch until the ZK computation finalizes
      onStatusChange("Waiting for ZK proof verification…");
      for (const [, batch] of claimResult.batches) {
        await pollClaimUntilTerminal(
          (rid) => relayer.pollClaimStatus(rid),
          batch.requestId,
          {
            onProgress: (event) => {
              if (event.status === "submitting" || event.status === "submitted") {
                onStatusChange("ZK proof submitting on-chain…");
              } else if (event.status === "awaiting_callback" || event.status === "finalizing") {
                onStatusChange("ZK proof verifying on-chain…");
              }
            },
          }
        );
      }
      
      // We add a retry block with a generous initial delay here. The Relayer may mark
      // the ZK proof as verified, but the on-chain state might still be propagating.
      await new Promise(r => setTimeout(r, 10000)); // Initial 10s delay
    } else {
      // If we don't have a UTXO but DO have an encrypted balance, we are resuming a failed withdrawal
      onStatusChange("Resuming pending withdrawal…");
      // Since the UTXO is gone, we don't have the pre-fee original amount easily available.
      // For resumes, we will just use the current encrypted balance as the original amount
      // to ensure the full remainder gets swept to the recipient.
      if (existingBalanceResult?.state === "shared") {
        originalAmountRaw = BigInt(existingBalanceResult.balance.toString());
      }
    }

    // Ensure the ephemeral signer's SPL token ATA exists.
    // The Umbra withdrawal instruction requires userSplAta (the destination wSOL
    // ATA derived from the ephemeral signer's address) to be pre-initialized.
    // If it doesn't exist the validator drops the transaction silently (AccountNotFound).
    onStatusChange("Preparing token account…");
    const claimConnection = new Connection(RPC_URL, "confirmed");
    const claimEphemeralKeypair = Keypair.fromSeed(
      ephemeralPrivateKey.length === 32 ? ephemeralPrivateKey : ephemeralPrivateKey.slice(0, 32)
    );
    await ensureEphemeralAta(claimConnection, claimEphemeralKeypair, tokenCfg.mint);

    // Withdraw from ephemeral encrypted balance → recipient public ATA
    onStatusChange("Sending to your wallet…");
    const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });

    let withdrawResult;
    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        // Query the exact encrypted balance available.
        const currentBalanceMap = await querier([mintAddress]);
        const balanceResult = currentBalanceMap.get(mintAddress);

        if (!balanceResult || balanceResult.state !== "shared") {
          throw new Error("Encrypted balance not found or not in shared state.");
        }

        const availableBalance = BigInt(balanceResult.balance.toString());
        log(`[withdraw] Attempt ${attempt}: Available balance is ${availableBalance}`);
        if (availableBalance === 0n) {
          throw new Error("Encrypted balance is 0. Waiting for RPC to sync the claim...");
        }

        // Note: The Umbra SDK direct withdrawal instruction forces the destination
        // ATA to be derived from the userAddress (which here is the ephemeralSigner).
        // Therefore, we pass ephemeralSigner.address, and later sweep the funds manually.
        withdrawResult = await withdraw(
          ephemeralSigner.address as Address,
          mintAddress,
          availableBalance as unknown as Parameters<typeof withdraw>[2]
        );
        break; // Success
      } catch (e) {
        warn(`Withdrawal attempt ${attempt} failed:`, e);
        if (attempt === 5) throw e;
        // Brief pause so the RPC gets a new slot (and thus a fresh blockhash)
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    if (!withdrawResult) throw new Error("Withdrawal failed: RPC did not sync the encrypted balance in time.");

    // The SDK ignores destinationAddress and withdraws to the signer (ephemeral wallet).
    // We now sweep the ephemeral wallet's balance to the actual recipient.
    onStatusChange("Sweeping funds to your wallet…");
    await sweepEphemeral(
      ephemeralPrivateKey,
      token,
      recipientAddress,
      originalAmountRaw
    );

    // Prefer the finalized callback signature; fall back to queue signature
    const signature =
      withdrawResult.callbackSignature?.toString() ??
      withdrawResult.queueSignature.toString();

    // Mark link as claimed in DB.
    // For wallet-locked links, include a signed auth payload so the server
    // can verify wallet ownership before writing the claimed_by record.
    if (linkId) {
      const patchBody: Record<string, unknown> = { claimer_address: recipientAddress };

      if (lockedTo && signMessage) {
        try {
          const timestamp = Math.floor(Date.now() / 1000);
          const message = `VeilPay claim: ${linkId} by ${recipientAddress} at ${timestamp}`;
          const sigBytes = await signMessage(new TextEncoder().encode(message));
          patchBody.signature = Buffer.from(sigBytes).toString("base64");
          patchBody.timestamp = timestamp;
        } catch {
          // Signing failed — still send without signature; server will reject
          // for locked links but we let the server decide rather than silently drop.
        }
      }

      fetch(`/api/links?id=${encodeURIComponent(linkId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patchBody),
      }).catch(() => {});
    }

    return { signature };
  } catch (err) {
    throw new Error(normalizeError(err));
  }
}

// ─── Viewing key / Audit ─────────────────────────────────────────────────────

export type LinkStatus = "pending" | "in_transit" | "complete" | "not_found";

export interface LinkAuditResult {
  status: LinkStatus;
  amountHuman: string;
  token: Token;
  ephemeralAddress: string;
}

export async function auditLinkStatus(
  claimSecretInput: string
): Promise<LinkAuditResult> {
  try {
    const { claimSecret, token } = parseClaimHash(claimSecretInput);

    const ephemeralPrivateKey = bs58.decode(claimSecret);
    const ephemeralSigner = await createEphemeralSigner(ephemeralPrivateKey);
    const client = await makeClient(ephemeralSigner);

    // 1. Check for unclaimed UTXOs (pending)
    const scanner = getClaimableUtxoScannerFunction({ client });
    const { publicReceived } = await scanner(0n as U32, 0n as U32);

    if (publicReceived.length > 0) {
      const utxo = publicReceived[0];
      const decimals = TOKEN_CONFIG[token].decimals;
      const amountRaw = BigInt(utxo.amount.toString());
      const amountHuman = formatHumanAmount(amountRaw, decimals);
      return {
        status: "pending",
        amountHuman,
        token,
        ephemeralAddress: ephemeralSigner.address.toString(),
      };
    }

    // 2. Check encrypted balance (claimed but not withdrawn)
    const querier = getEncryptedBalanceQuerierFunction({ client });
    const mintAddress = TOKEN_CONFIG[token].mint as Address;
    const balanceMap = await querier([mintAddress]);
    const balanceResult = balanceMap.get(mintAddress);

    if (
      balanceResult?.state === "shared" &&
      BigInt(balanceResult.balance.toString()) > 0n
    ) {
      const decimals = TOKEN_CONFIG[token].decimals;
      const amountRaw = BigInt(balanceResult.balance.toString());
      const amountHuman = formatHumanAmount(amountRaw, decimals);
      return {
        status: "in_transit",
        amountHuman,
        token,
        ephemeralAddress: ephemeralSigner.address.toString(),
      };
    }

    return {
      status: "not_found",
      amountHuman: "0",
      token,
      ephemeralAddress: ephemeralSigner.address.toString(),
    };
  } catch (err) {
    throw new Error(normalizeError(err));
  }
}

// ─── ATA Helpers ─────────────────────────────────────────────────────────────

import {
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  createCloseAccountInstruction,
} from "@solana/spl-token";
import { SystemProgram, Transaction, sendAndConfirmTransaction, PublicKey } from "@solana/web3.js";

/**
 * The Umbra withdrawal instruction requires `userSplAta` (the destination
 * wSOL / SPL ATA) to already exist.  If the owner has never held wSOL the ATA
 * is missing → simulation fails with AccountNotFound → validators silently drop
 * the transaction before execution.  Call this once before any withdrawal.
 *
 * Uses the wallet's solana:signTransaction feature so this doesn't require an
 * extra Phantom approve prompt — it goes through the same path as other txs.
 */
export async function ensureAssociatedTokenAccount(
  wallet: Wallet,
  account: WalletAccount,
  mint: string,
): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const mintPubkey = new PublicKey(mint);
  const ownerPubkey = new PublicKey(account.address);
  const ata = getAssociatedTokenAddressSync(mintPubkey, ownerPubkey, true);

  const ataInfo = await connection.getAccountInfo(ata, "confirmed");
  if (ataInfo) {
    log("[ensureATA] already exists:", ata.toString());
    return;
  }

  log("[ensureATA] creating token account:", ata.toString(), "mint:", mint.slice(0, 8));

  const tx = new Transaction();
  tx.add(
    createAssociatedTokenAccountIdempotentInstruction(
      ownerPubkey, ata, ownerPubkey, mintPubkey
    )
  );
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = ownerPubkey;

  const signFeature = (wallet.features as Record<string, unknown>)[
    "solana:signTransaction"
  ] as SolanaSignTxFeature | undefined;
  if (!signFeature?.signTransaction) throw new Error("Wallet does not support signTransaction");

  const serialized = tx.serialize({ requireAllSignatures: false, verifySignatures: false });
  const [output] = await signFeature.signTransaction({ account, transaction: serialized });

  const sig = await connection.sendRawTransaction(output.signedTransaction, { skipPreflight: true });
  log("[ensureATA] submitted:", sig);
  await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
  log("[ensureATA] confirmed — ATA ready");
}

/** Create the ATA for an ephemeral keypair. Used in the claim flow. */
async function ensureEphemeralAta(
  connection: Connection,
  ephemeralKeypair: Keypair,
  mint: string,
): Promise<void> {
  const mintPubkey = new PublicKey(mint);
  const ownerPubkey = ephemeralKeypair.publicKey;
  const ata = getAssociatedTokenAddressSync(mintPubkey, ownerPubkey, true);

  const ataInfo = await connection.getAccountInfo(ata, "confirmed");
  if (ataInfo) {
    log("[ensureEphemeralAta] already exists:", ata.toString());
    return;
  }

  log("[ensureEphemeralAta] creating ATA:", ata.toString());
  const tx = new Transaction();
  tx.add(createAssociatedTokenAccountIdempotentInstruction(
    ownerPubkey, ata, ownerPubkey, mintPubkey
  ));
  await sendAndConfirmTransaction(connection, tx, [ephemeralKeypair], { skipPreflight: true });
  log("[ensureEphemeralAta] created");
}

// ─── Sweep Ephemeral ─────────────────────────────────────────────────────────

const _overageAddr = process.env.NEXT_PUBLIC_OVERAGE_WALLET;
if (!_overageAddr) {
  throw new Error(
    "NEXT_PUBLIC_OVERAGE_WALLET is not set. Configure this in your environment before deploying — " +
    "without it, sweep overages have nowhere to go and funds will be lost."
  );
}
const OVERAGE_WALLET = new PublicKey(_overageAddr);

async function sweepEphemeral(
  ephemeralPrivateKey: Uint8Array,
  token: Token,
  recipientAddress: string,
  originalAmountRaw: bigint
): Promise<void> {
  const connection = new Connection(RPC_URL, "confirmed");
  const ephemeralKeypair = Keypair.fromSeed(
    ephemeralPrivateKey.length === 32
      ? ephemeralPrivateKey
      : ephemeralPrivateKey.slice(0, 32)
  );
  const ephemeralPubkey = ephemeralKeypair.publicKey;
  const recipientPubkey = new PublicKey(recipientAddress);
  
  // Wait for the Arcium callback to finalize its token transfers
  const tx = new Transaction();
  let tokenBalance = 0n;
  
  // Record initial SOL balance before we wait, to detect when funds arrive
  const initialSolBalance = await connection.getBalance(ephemeralPubkey, "confirmed");

  log(`[sweep] Initial SOL balance: ${initialSolBalance}`);

  if (token !== "SOL") {
    const mintPubkey = new PublicKey(TOKEN_CONFIG[token].mint);
    const ephemeralAta = getAssociatedTokenAddressSync(mintPubkey, ephemeralPubkey, true);
    const recipientAta = getAssociatedTokenAddressSync(mintPubkey, recipientPubkey, true);

    // Poll up to 30 times (90 seconds) for the tokens to arrive
    for (let i = 0; i < 30; i++) {
      try {
        const balanceInfo = await connection.getTokenAccountBalance(ephemeralAta, "confirmed");
        tokenBalance = BigInt(balanceInfo.value.amount);
        if (tokenBalance > 0n) {
          log(`[sweep] Found ${tokenBalance} tokens in ATA after ${i * 3}s`);
          break;
        }
      } catch {
        // ATA might not exist or balance is 0
      }
      await new Promise(r => setTimeout(r, 3000));
    }

    if (tokenBalance > 0n) {
      tx.add(
        createAssociatedTokenAccountIdempotentInstruction(
          ephemeralPubkey, // payer
          recipientAta,    // ata
          recipientPubkey, // owner
          mintPubkey       // mint
        ),
        createTransferInstruction(
          ephemeralAta,
          recipientAta,
          ephemeralPubkey,
          tokenBalance
        ),
        createCloseAccountInstruction(
          ephemeralAta,
          recipientPubkey,
          ephemeralPubkey
        )
      );
    }
  }

  // Next, sweep all remaining SOL
  let solBalance = initialSolBalance;
  for (let i = 0; i < 30; i++) {
    solBalance = await connection.getBalance(ephemeralPubkey, "confirmed");
    // If it's a SOL link, wait for balance to significantly increase vs initial
    if (token === "SOL" && solBalance > initialSolBalance + 1000000) {
      log(`[sweep] Found incoming SOL after ${i * 3}s (balance: ${solBalance})`);
      break;
    }
    // If it's a token link, we just sweep the rent, but we already waited for the token ATA above
    if (token !== "SOL") break;
    
    await new Promise(r => setTimeout(r, 3000));
  }

  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = blockhash;
  tx.feePayer = ephemeralPubkey;

  try {
    let recipientSol = 0n;
    let overageSol = 0n;
    
    let addedRecipientTransfer = false;
    let addedOverageTransfer = false;

    // Add dummy transfers to estimate the exact network fee
    if (token === "SOL") {
      tx.add(SystemProgram.transfer({ fromPubkey: ephemeralPubkey, toPubkey: recipientPubkey, lamports: 1000 }));
      addedRecipientTransfer = true;
    }
    tx.add(SystemProgram.transfer({ fromPubkey: ephemeralPubkey, toPubkey: OVERAGE_WALLET, lamports: 1000 }));
    addedOverageTransfer = true;
    
    const feeCalc = await connection.getFeeForMessage(tx.compileMessage(), "confirmed");
    const fee = BigInt(feeCalc.value || 5000);
    
    // Remove the dummies
    if (addedOverageTransfer) tx.instructions.pop();
    if (addedRecipientTransfer) tx.instructions.pop();

    const totalAvailableSol = BigInt(solBalance) - fee;

    if (token === "SOL") {
      if (totalAvailableSol >= originalAmountRaw) {
        recipientSol = originalAmountRaw;
        overageSol = totalAvailableSol - originalAmountRaw;
      } else {
        recipientSol = totalAvailableSol > 0n ? totalAvailableSol : 0n;
        overageSol = 0n;
      }
    } else {
      recipientSol = 0n;
      overageSol = totalAvailableSol > 0n ? totalAvailableSol : 0n;
    }

    if (recipientSol > 0n) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: ephemeralPubkey,
          toPubkey: recipientPubkey,
          lamports: recipientSol,
        })
      );
    }

    if (overageSol > 0n) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: ephemeralPubkey,
          toPubkey: OVERAGE_WALLET,
          lamports: overageSol,
        })
      );
    }

    if (tx.instructions.length > 0) {
      await sendAndConfirmTransaction(connection, tx, [ephemeralKeypair], { skipPreflight: false });
    }
  } catch (e) {
    warn("Failed to sweep remaining ephemeral SOL:", e);
    if (token === "SOL") {
      throw new Error(`Failed to sweep SOL to your wallet: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
