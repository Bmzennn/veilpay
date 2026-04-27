import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { getUmbraClient, createSignerFromPrivateKeyBytes, getEncryptedBalanceQuerierFunction } from "@umbra-privacy/sdk";
import bs58 from "bs58";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
const b58 = (bs58 as any).default || bs58;

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

  const querier = getEncryptedBalanceQuerierFunction({ client });
  const mints = [
    "So11111111111111111111111111111111111111112" as any, // SOL
    "GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9" as any  // USDC
  ];

  console.log("Checking private shielded balances...");
  const balances = await querier(mints);
  
  for (const mint of mints) {
    const bal = balances.get(mint);
    const label = mint === mints[0] ? "SOL" : "USDC";
    if (bal?.state === "shared") {
        console.log(`${label}: ${Number(bal.balance) / 1e9} (SHIELDED)`);
    } else {
        console.log(`${label}: 0 (NOT SHIELDED)`);
    }
  }
}
run();
