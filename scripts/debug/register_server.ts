import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getUmbraClient, createSignerFromPrivateKeyBytes, getUserRegistrationFunction } from "@umbra-privacy/sdk";
import { getUserRegistrationProver } from "@umbra-privacy/web-zk-prover";
import bs58 from "bs58";

const assetProvider = {
  async getAssetUrls(type: string, variant: string) {
    const CDN_BASE = "https://d3j9fjdkre529f.cloudfront.net";
    const res = await fetch(`${CDN_BASE}/manifest.json`);
    const manifest: any = await res.json();
    const entry = manifest.assets[type];
    const url = variant ? entry[variant].url : entry.url;
    const fullZkeyUrl = url.startsWith("http") ? url : `${CDN_BASE}/${url}`;
    const fullWasmUrl = fullZkeyUrl.replace(/\.zkey$/i, ".wasm");
    return { zkeyUrl: fullZkeyUrl, wasmUrl: fullWasmUrl };
  }
};

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const serverSecretSeed = "4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK";

  const b58 = (bs58 as any).default || bs58;
  const seed = b58.decode(serverSecretSeed);
  const keypair = Keypair.fromSeed(seed);
  
  console.log(`Registering Server Address: ${keypair.publicKey.toBase58()}`);
  
  const signer = await createSignerFromPrivateKeyBytes(keypair.secretKey);
  const client = await getUmbraClient({
    signer,
    network: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    rpcSubscriptionsUrl: "wss://api.devnet.solana.com",
    indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
    deferMasterSeedSignature: true,
  });

  const prover = getUserRegistrationProver({ assetProvider, callbacks: {} });
  const register = getUserRegistrationFunction({ client }, { zkProver: prover });
  
  try {
    console.log("Generating registration ZK Proof... (30-60s)");
    await register({ confidential: true, anonymous: true });
    console.log("Success: Server fully registered with Umbra.");
  } catch (e) {
    console.error("Registration failed:", e);
  }
}
run();
