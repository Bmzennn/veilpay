import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "3ZibPhW6dNYYTEYc6svX2YW1NmsbuJJD5ejNLwBN4nkTS7Xw5QagXUXVbKNoLytbyZp84A71yYHbk1tHD7L1BnyK";
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const keys = tx!.transaction.message.accountKeys;
  for (const k of keys) {
    if (k.signer) console.log("Signer:", k.pubkey.toBase58());
  }
}
run();
