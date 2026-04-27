import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "2C8HqqG1tfgF28Djm9F1iw5iSL5GbYFyqK4q3CXRRP8K3gsQWxY67BpFPHmjmrixcNdc96VwwtAyZtM7CdPzjU9F";
  const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const pre = tx!.meta!.preBalances;
  const post = tx!.meta!.postBalances;
  const keys = tx!.transaction.message.getAccountKeys();
  for (let i = 0; i < pre.length; i++) {
    const diff = post[i] - pre[i];
    if (diff !== 0) {
      console.log(`Account ${i} (${keys.get(i)?.toBase58()}): diff = ${diff}`);
    }
  }
}
run();
