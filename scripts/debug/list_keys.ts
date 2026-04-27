import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "2C8HqqG1tfgF28Djm9F1iw5iSL5GbYFyqK4q3CXRRP8K3gsQWxY67BpFPHmjmrixcNdc96VwwtAyZtM7CdPzjU9F";
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const keys = tx!.transaction.message.accountKeys;
  for (let i = 0; i < keys.length; i++) {
    console.log(`Account ${i}: ${keys[i].pubkey.toBase58()}`);
  }
}
run();
