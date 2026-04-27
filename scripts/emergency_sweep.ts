import { Connection, PublicKey, Keypair } from "@solana/web3.js";
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
const b58 = (bs58 as any).default || bs58;

// Local Asset Provider - NO FETCH
const ZK_CACHE_DIR = path.join(os.homedir(), ".veilpay", "zk_cache");
const assetProvider = {
  async getAssetUrls(type: string, variant?: string) {
    const filename = type === "claimreceiverclaimableutxointoencryptedbalance" 
        ? "claimdepositintoconfidentialamountn3.zkey"
        : "createdepositwithpublicamount.zkey";
    
    const p = path.join(ZK_CACHE_DIR, filename);
    return { 
        zkeyUrl: url.pathToFileURL(p).href, 
        wasmUrl: url.pathToFileURL(p.replace(/\.zkey$/i, ".wasm")).href 
    };
  }
};

const originalFetch = global.fetch;
(global as any).fetch = async (input: any, init: any) => {
    const inputUrl = typeof input === "string" ? input : input.url;
    if (inputUrl.startsWith("file://")) {
        const filePath = url.fileURLToPath(inputUrl);
        const buffer = fs.readFileSync(filePath);
        return {
            ok: true,
            status: 200,
            arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
            json: async () => JSON.parse(buffer.toString()),
            blob: async () => new Blob([buffer])
        };
    }
    return originalFetch(input, init);
};

async function main() {
    console.log("--- VeilPay TARGETED SWEEP ---");
    const SERVER_SECRET = process.env.X402_SERVER_PRIVATE_KEY || "";
    const serverKeypair = Keypair.fromSecretKey(b58.decode(SERVER_SECRET));
    const serverAddress = serverKeypair.publicKey.toBase58();

    const signer = await createSignerFromPrivateKeyBytes(serverKeypair.secretKey);
    const client = await getUmbraClient({
        signer,
        network: "devnet",
        rpcUrl: "https://api.devnet.solana.com",
        rpcSubscriptionsUrl: "wss://api.devnet.solana.com",
        indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
        deferMasterSeedSignature: true,
    });

    const scanner = getClaimableUtxoScannerFunction({ client });
    const { publicReceived } = await scanner(0n as any, 0n as any);

    if (publicReceived.length > 0) {
        // Sort by insertionIndex descending
        const sorted = [...publicReceived].sort((a, b) => Number(BigInt(b.insertionIndex.toString()) - BigInt(a.insertionIndex.toString())));
        const latest = sorted[0];
        
        console.log(`Found ${publicReceived.length} UTXOs. Attempting to claim the LATEST one (Index: ${latest.insertionIndex})...`);
        const relayer = getUmbraRelayer({ apiEndpoint: "https://relayer.api-devnet.umbraprivacy.com" });
        const claimProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver({ assetProvider, callbacks: {} });
        const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction({ client }, {
            fetchBatchMerkleProof: client.fetchBatchMerkleProof!,
            zkProver: claimProver,
            relayer,
        });

        try {
            const res = await claim([latest]);
            console.log("Claim submitted. Polling...");
            const requestId = Array.from(res.batches.values())[0].requestId;
            await pollClaimUntilTerminal((rid) => relayer.pollClaimStatus(rid), requestId);
            console.log("Wait 30s...");
            await new Promise(r => setTimeout(r, 30000));
        } catch (e: any) {
            console.error("Single Claim Failed:", e.message);
        }
    }

    console.log("Attempting Withdrawal...");
    const querier = getEncryptedBalanceQuerierFunction({ client });
    const mints = ["So11111111111111111111111111111111111111112" as any];
    const bals = await querier(mints);
    const sol = bals.get(mints[0] as any);

    if (sol?.state === "shared" && BigInt(sol.balance.toString()) > 0n) {
        console.log(`Withdrawing ${sol.balance} lamports...`);
        const withdraw = getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
        const res = await withdraw(serverAddress as any, mints[0] as any, sol.balance as any);
        console.log("✅ SUCCESS! TX Sig:", res.callbackSignature || res.queueSignature);
    } else {
        console.log("No shielded balance to withdraw.");
    }
}
main().catch(console.error);
