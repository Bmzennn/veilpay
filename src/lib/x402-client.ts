import { Keypair, Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { log } from "./logger";
import {
  getUmbraClient,
  createSignerFromPrivateKeyBytes,
  getPublicBalanceToReceiverClaimableUtxoCreatorFunction,
  getUserAccountQuerierFunction,
  getUserRegistrationFunction,
} from "@umbra-privacy/sdk";
import {
  getCreateReceiverClaimableUtxoFromPublicBalanceProver,
  getUserRegistrationProver,
} from "@umbra-privacy/web-zk-prover";
import { RPC_URL, RPC_WS_URL, UMBRA_INDEXER_URL, NETWORK, TOKEN_CONFIG } from "./constants";
import type { Token } from "@/types";
import type { Address } from "@solana/kit";
import bs58 from "bs58";

/**
 * Custom transaction forwarder for AI agents that skips preflight simulation.
 * Essential for devnet reliability when sending multiple transactions in sequence.
 */
function makeAgentForwarder() {
  const connection = new Connection(RPC_URL, "confirmed");
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async fireAndForget(tx: any): Promise<string> {
      // Re-encode from messageBytes + signatures to ensure exact bytes are preserved
      const sigs = Object.values(tx.signatures) as (Uint8Array | null)[];
      
      // Compact u16 length for number of signatures
      const encodeU16 = (n: number) => {
        if (n < 0x80) return [n];
        return [(n & 0x7f) | 0x80, n >> 7];
      };

      const countBytes = new Uint8Array(encodeU16(sigs.length));
      const wire = new Uint8Array(countBytes.length + sigs.length * 64 + tx.messageBytes.length);
      wire.set(countBytes, 0);
      let off = countBytes.length;
      for (const sig of sigs) {
        wire.set(sig ?? new Uint8Array(64), off);
        off += 64;
      }
      wire.set(tx.messageBytes, off);

      return connection.sendRawTransaction(wire, { skipPreflight: true });
    },
    async forwardSequentially(transactions: unknown[]): Promise<string[]> {
      const sigs = [];
      for (const tx of transactions) sigs.push(await this.fireAndForget(tx));
      return sigs;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

export interface X402FetchOptions extends RequestInit {
  agentPrivateKeyBase58: string;
}

// ─── Node.js ZK asset provider ───────────────────────────────────────────────
// Downloads ZK circuit files from CDN to ~/.veilpay/zk-cache/ on first use.
// Subsequent calls are served from local disk via file:// URLs.
// The file:// fetch patch below is required because Node.js Undici cannot
// handle file:// URIs natively.

const CDN_BASE = "https://d3j9fjdkre529f.cloudfront.net";

// Patch global.fetch to handle file:// URLs for ZK circuits (Node.js only).
// Must run before any SDK code that loads ZK assets.
if (typeof window === "undefined") {
  const origFetch = global.fetch;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (global as any).fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const inputUrl = typeof input === "string" ? input : (input as Request).url;
    if (inputUrl?.startsWith("file://")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { fileURLToPath } = require("url");
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const fsSync = require("fs");
      const filePath = fileURLToPath(inputUrl);
      const buffer: Buffer = fsSync.readFileSync(filePath);
      return {
        ok: true, status: 200,
        arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
        json:        async () => JSON.parse(buffer.toString()),
        blob:        async () => new Blob([new Uint8Array(buffer)]),
      } as Response;
    }
    return origFetch(input, init);
  };
}

function makeNodeZkAssetProvider() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fsSync   = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pathMod  = require("path");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const osMod    = require("os");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const crypto   = require("crypto");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const https    = require("https");

  const ZK_CACHE = pathMod.join(osMod.homedir(), ".veilpay", "zk-cache");
  fsSync.mkdirSync(ZK_CACHE, { recursive: true });

  function downloadFile(url: string, dest: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const tmp  = dest + ".tmp";
      const file = fsSync.createWriteStream(tmp);
      const opts = { headers: { "User-Agent": "Mozilla/5.0 (compatible; VeilPayAgent/1.0)" } };
      https.get(url, opts, (res: { statusCode: number; pipe: (s: unknown) => void }) => {
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode} for ${url}`)); return; }
        res.pipe(file);
        file.on("finish", () => { file.close(); fsSync.renameSync(tmp, dest); resolve(); });
        file.on("error", (e: Error) => { try { fsSync.unlinkSync(tmp); } catch {} reject(e); });
      }).on("error", reject);
    });
  }

  let manifest: Record<string, unknown> | null = null;

  return {
    async getAssetUrls(type: string, variant?: string): Promise<{ zkeyUrl: string; wasmUrl: string }> {
      if (!manifest) {
        const res = await fetch(`${CDN_BASE}/manifest.json`, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; VeilPayAgent/1.0)" },
        });
        if (!res.ok) throw new Error(`ZK manifest fetch failed: ${res.status}`);
        manifest = (await res.json()) as Record<string, unknown>;
      }

      const assets = (manifest as { assets: Record<string, unknown> }).assets;
      const entry  = assets[type] as Record<string, unknown> | { url: string } | undefined;
      if (!entry) throw new Error(`ZK type '${type}' not in manifest`);

      let rawUrl: string;
      if (variant && !("url" in entry)) {
        rawUrl = (entry as Record<string, { url: string }>)[variant]?.url;
      } else {
        rawUrl = (entry as { url: string }).url;
      }
      if (!rawUrl) throw new Error(`No URL for ZK type '${type}'`);

      const fullZkeyUrl = rawUrl.startsWith("http") ? rawUrl : `${CDN_BASE}/${rawUrl}`;
      const fullWasmUrl = fullZkeyUrl.replace(/\.zkey$/i, ".wasm");

      const key      = crypto.createHash("md5").update(fullZkeyUrl).digest("hex");
      const zkeyPath = pathMod.join(ZK_CACHE, `${key}.zkey`);
      const wasmPath = pathMod.join(ZK_CACHE, `${key}.wasm`);

      if (!fsSync.existsSync(zkeyPath)) {
        process.stdout?.write?.(`  Downloading ${type}.zkey (cached after first run)… `);
        await downloadFile(fullZkeyUrl, zkeyPath);
        process.stdout?.write?.("done\n");
      }
      if (!fsSync.existsSync(wasmPath)) {
        process.stdout?.write?.(`  Downloading ${type}.wasm… `);
        await downloadFile(fullWasmUrl, wasmPath);
        process.stdout?.write?.("done\n");
      }

      return { zkeyUrl: `file://${zkeyPath}`, wasmUrl: `file://${wasmPath}` };
    },
  };
}

/**
 * AI Agent SDK: Handles 402 Payment Required challenges via a shielded UTXO.
 *
 * Uses getPublicBalanceToReceiverClaimableUtxoCreatorFunction to create a
 * receiver-claimable UTXO for the server. The server's Solana address does NOT
 * appear in the transaction — only the server's X25519-derived accounts do.
 * This provides full payer-server unlinkability on-chain.
 *
 * The invoiceId (32 bytes from the 402 response) is embedded as the UTXO's
 * optionalData, committing to the specific invoice being paid.
 *
 * Authorization header format: x402 <proofAccountSig>:<utxoSig>:<invoiceId>
 */
export async function x402Fetch(url: string, options: X402FetchOptions): Promise<Response> {
  const { agentPrivateKeyBase58, ...fetchOptions } = options;

  // 1. Initial request
  log(`[x402Client] Fetching ${url}…`);
  let response = await fetch(url, fetchOptions);

  if (response.status !== 402) return response;

  log(`[x402Client] 402 Payment Required — extracting invoice…`);

  // 2. Parse invoice
  const responseBody = await response.json();
  const invoice = responseBody.invoice;

  if (!invoice?.amount || !invoice?.token || !invoice?.destination || !invoice?.invoiceId) {
    throw new Error("Invalid x402 invoice payload from server.");
  }

  log(`[x402Client] Invoice: ${invoice.amount} ${invoice.token} → ${invoice.destination}`);

  // 3. Build Umbra client with agent keypair
  const b58 = (bs58 as { default?: typeof bs58 } & typeof bs58).default ?? bs58;
  const agentKeypair = Keypair.fromSecretKey(b58.decode(agentPrivateKeyBase58));
  const signer = await createSignerFromPrivateKeyBytes(agentKeypair.secretKey);

  // 3a. Check Balance
  const connection = new Connection(RPC_URL, "confirmed");
  const balance = await connection.getBalance(agentKeypair.publicKey, "confirmed");
  const balanceSol = balance / LAMPORTS_PER_SOL;
  const minRequired = invoice.amount + 0.02; // amount + buffer for registration fees
  if (balanceSol < minRequired) {
    throw new Error(`Insufficient SOL. Agent has ${balanceSol.toFixed(3)} SOL but needs at least ${minRequired.toFixed(3)} SOL.`);
  }

  const client = await getUmbraClient(
    {
      signer,
      network: NETWORK,
      rpcUrl: RPC_URL,
      rpcSubscriptionsUrl: RPC_WS_URL,
      indexerApiEndpoint: UMBRA_INDEXER_URL,
      deferMasterSeedSignature: true,
    },
    {
      transactionForwarder: makeAgentForwarder(),
    }
  );

  // 4. Ensure payer is registered with Umbra (required for UTXO creation)
  const querier = getUserAccountQuerierFunction({ client });
  const state   = await querier(signer.address);
  const needsReg = state.state !== "exists"
    || !state.data.isUserCommitmentRegistered
    || !state.data.isUserAccountX25519KeyRegistered;

  if (needsReg) {
    log(`[x402Client] Registering payer with Umbra (first time only)…`);
    const regProver  = getUserRegistrationProver({ assetProvider: makeNodeZkAssetProvider() });
    const register   = getUserRegistrationFunction({ client }, { zkProver: regProver });
    await register({ confidential: true, anonymous: true });
    log(`[x402Client] Payer registered.`);
  }

  const tokenCfg = TOKEN_CONFIG[invoice.token as Token];
  if (!tokenCfg) throw new Error(`Unsupported token: ${invoice.token}`);

  const amountRaw    = BigInt(Math.round(invoice.amount * 10 ** tokenCfg.decimals));
  const invoiceBytes = new Uint8Array(
    (invoice.invoiceId as string).match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16))
  );

  // 5. Create receiver-claimable UTXO with invoiceId embedded in optionalData
  log(`[x402Client] Computing ZK proof and creating shielded UTXO…`);

  const assetProvider = makeNodeZkAssetProvider();
  const utxoProver    = getCreateReceiverClaimableUtxoFromPublicBalanceProver({ assetProvider });
  const createUtxo    = getPublicBalanceToReceiverClaimableUtxoCreatorFunction(
    { client },
    { zkProver: utxoProver }
  );

  const result = await createUtxo(
    {
      destinationAddress: invoice.destination as Address,
      mint:               tokenCfg.mint as Address,
      amount:             amountRaw as Parameters<typeof createUtxo>[0]["amount"],
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { optionalData: invoiceBytes as any }
  );

  const proofTxSig  = result.createProofAccountSignature.toString();
  const depositSig  = result.createUtxoSignature.toString();

  log(`[x402Client] UTXO created — proofTx: ${proofTxSig.slice(0, 12)}, utxoTx: ${depositSig.slice(0, 12)}`);

  // 6. Retry with x402 Authorization header
  log(`[x402Client] Retrying with proof of payment…`);

  const retryHeaders = new Headers(fetchOptions.headers);
  retryHeaders.set("Authorization", `x402 ${proofTxSig}:${depositSig}:${invoice.invoiceId}`);

  response = await fetch(url, { ...fetchOptions, headers: retryHeaders });

  log(`[x402Client] Server responded: ${response.status}`);
  return response;
}
