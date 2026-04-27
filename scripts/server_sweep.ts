import { Keypair } from "@solana/web3.js";
import { 
    getUmbraClient, 
    createSignerFromPrivateKeyBytes, 
    getClaimableUtxoScannerFunction,
    getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction,
    getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
    getEncryptedBalanceQuerierFunction,
    getUmbraRelayer,
    pollClaimUntilTerminal
} from "@umbra-privacy/sdk";
import { 
    getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver 
} from "@umbra-privacy/web-zk-prover";
import bs58 from "bs58";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import os from "os";
import url from "url";
dotenv.config({ path: ".env.local" });

// Fix: Set the absolute indexer URL before importing umbra.ts so it doesn't default to /api/indexer-proxy
process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL = "https://utxo-indexer.api-devnet.umbraprivacy.com";

import { getRecentTreeIndices, U32 } from "../src/lib/umbra";
import type { Address } from "@solana/kit";

type UxtoScannerResult = Awaited<ReturnType<ReturnType<typeof getClaimableUtxoScannerFunction>>>;
type Utxo = UxtoScannerResult["publicReceived"][number];

const b58 = (bs58 as unknown as { default: typeof bs58 }).default || bs58;

// ─── Environment Configuration ──────────────────────────────────────────────
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL || "https://api.devnet.solana.com";
const UMBRA_INDEXER_URL = process.env.NEXT_PUBLIC_UMBRA_INDEXER_URL;
const UMBRA_RELAYER_URL = "https://relayer.api-devnet.umbraprivacy.com";
const NETWORK = (process.env.NEXT_PUBLIC_NETWORK as "mainnet" | "devnet") || "devnet";
const SERVER_SECRET = process.env.X402_SERVER_PRIVATE_KEY || "";

const ZK_CACHE_DIR = path.join(os.homedir(), ".veilpay", "zk_cache");

interface Manifest {
    assets: Record<string, { url: string } | Record<string, { url: string }>>;
}

const assetProvider = {
  async getAssetUrls(type: string, variant?: string) {
    const CDN_BASE = "https://d3j9fjdkre529f.cloudfront.net";
    const res = await fetch(`${CDN_BASE}/manifest.json`);
    const manifest = (await res.json()) as Manifest;
    const entry = manifest.assets[type];
    const urlPath = variant && !("url" in entry) ? (entry as Record<string, { url: string }>)[variant].url : (entry as { url: string }).url;
    const fileName = urlPath.split("/").pop() || "";
    const p = path.join(ZK_CACHE_DIR, fileName);
    return { 
        zkeyUrl: url.pathToFileURL(p).href, 
        wasmUrl: url.pathToFileURL(p.replace(/\.zkey$/i, ".wasm")).href 
    };
  }
};

const originalFetch = global.fetch;
(global as unknown as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    let inputUrl: string;
    if (typeof input === "string") {
        inputUrl = input;
    } else if (input instanceof URL) {
        inputUrl = input.toString();
    } else {
        inputUrl = (input as Request).url;
    }

    if (inputUrl && inputUrl.startsWith("file://")) {
        const filePath = url.fileURLToPath(inputUrl);
        const buffer = fs.readFileSync(filePath);
        return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            json: async () => JSON.parse(buffer.toString()),
            blob: async () => new Blob([buffer])
        } as unknown as Response;
    }

    if (!inputUrl || inputUrl === "undefined") {
        console.error("Critical Error: Fetch called with empty or undefined URL");
        throw new Error("ERR_INVALID_URL: input is empty or undefined");
    }

    if (inputUrl.startsWith("/")) {
        console.error(`Critical Error: Server-side fetch attempted with relative URL: ${inputUrl}`);
        throw new Error(`ERR_INVALID_URL: Relative path '${inputUrl}' is not allowed on server.`);
    }

    return originalFetch(input, init);
};

async function main() {
    console.log("--- VeilPay Server Revenue Sweep (Optimized) ---");
    console.log("Indexer URL:", UMBRA_INDEXER_URL);
    const serverKeypair = Keypair.fromSecretKey(b58.decode(SERVER_SECRET));
    const serverAddress = serverKeypair.publicKey.toBase58();

    const signer = await createSignerFromPrivateKeyBytes(serverKeypair.secretKey);
    const client = await getUmbraClient({
        signer,
        network: NETWORK,
        rpcUrl: RPC_URL,
        rpcSubscriptionsUrl: RPC_URL.replace("http", "ws"),
        indexerApiEndpoint: UMBRA_INDEXER_URL,
        deferMasterSeedSignature: true,
    });

    const scanner = getClaimableUtxoScannerFunction({ client });
    console.log("Scanning pool for pending payments...");
    const treeIndices = await getRecentTreeIndices();
    let publicReceived: Utxo[] = [];
    for (const treeIndex of treeIndices) {
        const result = await scanner(treeIndex as U32, 0n as U32);
        publicReceived = publicReceived.concat(result.publicReceived);
    }

    console.log(`Found ${publicReceived.length} pending payments.`);

    if (publicReceived.length > 0) {
        console.log(`Claiming ${publicReceived.length} payments in batches...`);
        const relayer = getUmbraRelayer({ apiEndpoint: UMBRA_RELAYER_URL });
        const claimProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver({ assetProvider, callbacks: {} });

        const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
            { client },
            { fetchBatchMerkleProof: client.fetchBatchMerkleProof!, zkProver: claimProver, relayer }
        );

        try {
            // BATCHING: Prevent CPU spikes
            const BATCH_SIZE = 5;
            for (let i = 0; i < publicReceived.length; i += BATCH_SIZE) {
                const batchUtxos = publicReceived.slice(i, i + BATCH_SIZE);
                console.log(`--- Processing batch ${i / BATCH_SIZE + 1} of ${Math.ceil(publicReceived.length / BATCH_SIZE)} ---`);
                
                try {
                    const claimResult = await claim(batchUtxos);
                    for (const [, batch] of claimResult.batches) {
                        console.log(`Polling Batch ${batch.requestId}...`);
                        const finalStatus = await pollClaimUntilTerminal((rid) => relayer.pollClaimStatus(rid), batch.requestId);
                        console.log(`Batch ${batch.requestId} terminal status: ${finalStatus.status}`);
                        
                        if (finalStatus.status === "failed") {
                            const isAlreadyBurnt = finalStatus.failureReason?.includes("0x6d64") || finalStatus.failureReason?.includes("NullifierAlreadyBurnt");
                            if (isAlreadyBurnt) {
                                console.warn("Warning: Batch contained payments that were already claimed (NullifierAlreadyBurnt). Continuing...");
                            } else {
                                console.error(`Batch claim failed: ${finalStatus.failureReason || 'Unknown error'}`);
                            }
                        }
                    }
                } catch (batchErr: unknown) {
                    const message = batchErr instanceof Error ? batchErr.message : String(batchErr);
                    const isAlreadyBurnt = message.includes("0x6d64") || message.includes("NullifierAlreadyBurnt");
                    if (isAlreadyBurnt) {
                        console.warn("Warning: A payment in this batch was already claimed. Proceeding to next batch...");
                    } else {
                        console.error("Error: Critical batch failure:", batchErr);
                        throw batchErr;
                    }
                }
            }
            console.log("All batches finished. Waiting 10s for propagation...");
            await new Promise(r => setTimeout(r, 10000));
        } catch (e: unknown) {
            console.error("Claim Error:", e instanceof Error ? e.message : String(e));
        }
    }

    console.log("Checking balances for settlement...");
    const querier = getEncryptedBalanceQuerierFunction({ client });
    const mints = [
        "So11111111111111111111111111111111111111112" as Address,
        "GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9" as Address
    ];

    const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });

    for (const mint of mints) {
        let availableBalance = 0n;
        console.log(`--- Checking balance for ${mint} ---`);
        // SMART POLLING: Wait for RPC to sync
        for (let attempt = 1; attempt <= 5; attempt++) {
            const balances = await querier([mint]);
            const bal = balances.get(mint);
            console.log(`[Attempt ${attempt}/5] Balance result:`, JSON.stringify(bal, (key, value) => typeof value === 'bigint' ? value.toString() : value));
            if (bal?.state === "shared" && BigInt(bal.balance.toString()) > 0n) {
                availableBalance = BigInt(bal.balance.toString());
                console.log(`Found shared balance: ${availableBalance}`);
                break;
            }
            if (attempt < 5) {
                console.log(`No balance yet, retrying in 8s...`);
                await new Promise(r => setTimeout(r, 8000));
            }
        }

        if (availableBalance > 0n) {
            console.log(`Initiating settlement for ${availableBalance} units for ${mint.slice(0,8)}...`);
            for (let i = 0; i < 3; i++) {
                try {
                    const res = await withdraw(serverAddress as Address, mint, availableBalance as unknown as Parameters<typeof withdraw>[2]);
                    console.log(`Settled! Sig: ${res.callbackSignature || res.queueSignature}`);
                    break;
                } catch (e: unknown) {
                    const message = e instanceof Error ? e.message : String(e);
                    if (i === 2) console.error(`Withdrawal failed after retries:`, message);
                    else {
                        console.warn(`Withdrawal failed, retrying in 5s...`, message);
                        await new Promise(r => setTimeout(r, 5000));
                    }
                }
            }
        } else {
            console.log(`No balance found for ${mint} after polling.`);
        }
    }
    console.log("Done.");
}

main().catch(console.error);
