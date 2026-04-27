import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getUmbraClient, createSignerFromPrivateKeyBytes, getUserAccountQuerierFunction } from "@umbra-privacy/sdk";
import { x25519 } from "@noble/curves/ed25519";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
  const b58 = (bs58 as any).default || bs58;
  const serverSecret = process.env.X402_SERVER_PRIVATE_KEY || "";
  const serverKeypair = Keypair.fromSecretKey(b58.decode(serverSecret));
  
  // 1. Derive X25519 Public Key from our private key
  const myX25519PubKey = x25519.getPublicKey(
    serverKeypair.secretKey.slice(0, 32)
  );
  console.log("Local X25519 PubKey:", Buffer.from(myX25519PubKey).toString("hex"));

  // 2. Fetch on-chain X25519 Public Key
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

  const querier = getUserAccountQuerierFunction({ client });
  const status = await querier(serverKeypair.publicKey.toBase58() as any);
  
  if (status.state === "exists") {
      console.log("On-Chain X25519 PubKey:", Buffer.from(status.data.x25519PublicKey).toString("hex"));
  } else {
      console.log("Server account not found on-chain!");
  }
}
run();
