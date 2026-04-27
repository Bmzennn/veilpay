import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "3ZibPhW6dNYYTEYc6svX2YW1NmsbuJJD5ejNLwBN4nkTS7Xw5QagXUXVbKNoLytbyZp84A71yYHbk1tHD7L1BnyK";
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const pre = tx!.meta!.preBalances;
  const post = tx!.meta!.postBalances;
  const keys = tx!.transaction.message.accountKeys;
  for (let i = 0; i < pre.length; i++) {
    const diff = post[i] - pre[i];
    if (diff !== 0) {
      console.log(`Account ${i} (${keys[i]?.pubkey.toBase58()}): diff = ${diff}`);
    }
  }
}
run();
