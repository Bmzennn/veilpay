import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const mint = new PublicKey("GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9");
  const info = await connection.getAccountInfo(mint);
  console.log("Owner:", info?.owner.toBase58());
  console.log("Data length:", info?.data.length);
}
run();
