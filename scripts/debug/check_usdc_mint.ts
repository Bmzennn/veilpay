import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const mint = new PublicKey("GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9");
  const sigs = await connection.getSignaturesForAddress(mint, { limit: 10 });
  for (const s of sigs) {
    if (s.err) {
      console.log(`Sig: ${s.signature}, Err: ${JSON.stringify(s.err)}`);
      const tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
      console.log("Logs:", tx?.meta?.logMessages?.filter(l => l.includes("Error") || l.includes("failed") || l.includes("Instruction:")));
    }
  }
}
run();
