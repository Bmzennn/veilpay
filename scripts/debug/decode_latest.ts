import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "62gysRQE9Lnmz6tYPPFpXWbpwsAnsFPKMAt6HwWty8CEYVogUNBU9TZEGxtVkbkpKFJ13StpAre4xNmqYpAKH4YT";
  const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  console.log("Tx signature:", sig);
  if (tx && tx.meta) {
    console.log("Error:", tx.meta.err);
    console.log("Logs:", tx.meta.logMessages);
  }
}
run();
