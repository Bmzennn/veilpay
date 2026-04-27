import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { 
    getUmbraClient, 
    createSignerFromPrivateKeyBytes, 
    getClaimableUtxoScannerFunction,
    getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction,
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

// ZK Node Cache
const ZK_CACHE_DIR = path.join(os.homedir(), ".veilpay", "zk_cache");
const assetProvider = {
  async getAssetUrls(type: string, variant?: string) {
    const CDN_BASE = "https://d3j9fjdkre529f.cloudfront.net";
    const res = await fetch(`${CDN_BASE}/manifest.json`);
    const manifest: any = await res.json();
    const entry = manifest.assets[type];
    const urlPath = variant ? entry[variant].url : entry.url;
    const fileName = urlPath.split("/").pop();
    const p = path.join(ZK_CACHE_DIR, fileName);
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
        };
    }
    return originalFetch(input, init);
};

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const serverSecret = process.env.X402_SERVER_PRIVATE_KEY || "";
  const serverKeypair = Keypair.fromSecretKey(b58.decode(serverSecret));
  
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
  
  console.log(`Found ${publicReceived.length} UTXOs.`);
  
  const relayer = getUmbraRelayer({ apiEndpoint: "https://relayer.api-devnet.umbraprivacy.com" });
  const claimProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver({ assetProvider, callbacks: {} });
  const claim = getReceiverClaimableUtxoToEncryptedBalanceClaimerFunction(
    { client },
    { fetchBatchMerkleProof: client.fetchBatchMerkleProof!, zkProver: claimProver, relayer }
  );

  for (let i = 0; i < publicReceived.length; i++) {
    const utxo = publicReceived[i];
    console.log(`Attempting to claim UTXO ${i} (Amount: ${utxo.amount})...`);
    try {
        const res = await claim([utxo]);
        console.log(`  Claim submitted. RequestId: ${res.batches.values().next().value.requestId}`);
        await pollClaimUntilTerminal(
            (rid) => relayer.pollClaimStatus(rid),
            res.batches.values().next().value.requestId,
            { onProgress: (e) => console.log(`    Status: ${e.status}`) }
        );
    } catch (e: any) {
        console.error(`  FAILED:`, e.message);
    }
  }
}
run();
