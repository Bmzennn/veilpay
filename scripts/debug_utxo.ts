import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getUmbraClient, createSignerFromPrivateKeyBytes, getClaimableUtxoScannerFunction } from "@umbra-privacy/sdk";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const b58 = (bs58 as any).default || bs58;

async function run() {
  const SERVER_SECRET = process.env.X402_SERVER_PRIVATE_KEY || "";
  const serverKeypair = Keypair.fromSecretKey(b58.decode(SERVER_SECRET));
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
  console.log("UTXO Keys:", Object.keys(publicReceived[0]));
  console.log("Full UTXO 0:", JSON.stringify(publicReceived[0], (k, v) => typeof v === "bigint" ? v.toString() : v, 2));
}
run();
