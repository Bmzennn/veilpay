import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "4ybtg7ekwk9adkmov68KrbtA9X3BRBLGpiU3CtPySvvGGeg4r13QVGKqpkZGCBFgWq4GdYKPbroZgd152btQNhDY";
  const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  console.log("Tx signature:", sig);
  if (tx && tx.meta) {
    console.log("Error:", tx.meta.err);
    console.log("Logs:", tx.meta.logMessages);
  }
}
run();
