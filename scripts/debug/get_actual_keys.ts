import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getUmbraClient, createSignerFromPrivateKeyBytes, getUserAccountX25519KeypairDeriver } from "@umbra-privacy/sdk";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
  const b58 = (bs58 as any).default || bs58;
  const serverSecret = process.env.X402_SERVER_PRIVATE_KEY || "";
  const serverKeypair = Keypair.fromSecretKey(b58.decode(serverSecret));
  
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const signer = await createSignerFromPrivateKeyBytes(serverKeypair.secretKey);
  const client = await getUmbraClient({
    signer,
    network: "devnet",
    rpcUrl: "https://api.devnet.solana.com",
    rpcSubscriptionsUrl: "wss://api.devnet.solana.com",
    indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
    deferMasterSeedSignature: true,
  });

  const deriver = getUserAccountX25519KeypairDeriver({ client });
  const keys = await deriver();
  
  console.log("ACTUAL Server X25519 Private Key (hex):", Buffer.from((keys as any).x25519Keypair.privateKey).toString("hex"));
  console.log("ACTUAL Server X25519 Public Key (hex):", Buffer.from((keys as any).x25519Keypair.publicKey).toString("hex"));
}
run();
