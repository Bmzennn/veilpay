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
  const agentSecret = "4ZGgPeqEaXXL3Co3gH42EEaUA72miDAnVCSdR3jhaveyYwWiC9JpD1224j2XLjFuExSgFaqqap98cuLeHQX55B6c";

  const b58 = (bs58 as any).default || bs58;
  const keypair = Keypair.fromSecretKey(b58.decode(agentSecret));
  
  console.log(`Registering Agent Address: ${keypair.publicKey.toBase58()}`);
  
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
    console.log("Generating Agent registration ZK Proof... (30-60s)");
    await register({ confidential: true, anonymous: true });
    console.log("Success: Agent fully registered with Umbra.");
  } catch (e) {
    console.error("Agent registration failed:", e);
  }
}
run();
