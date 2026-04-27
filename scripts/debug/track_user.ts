import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "62gysRQE9Lnmz6tYPPFpXWbpwsAnsFPKMAt6HwWty8CEYVogUNBU9TZEGxtVkbkpKFJ13StpAre4xNmqYpAKH4YT";
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const keys = tx!.transaction.message.accountKeys;
  for (const k of keys) {
    if (k.signer) console.log("Signer:", k.pubkey.toBase58());
  }
}
run();
