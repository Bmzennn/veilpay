import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const mint = new PublicKey("GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9");
  const info = await getMint(connection, mint);
  console.log("Decimals:", info.decimals);
  console.log("Supply:", info.supply);
}
run();
