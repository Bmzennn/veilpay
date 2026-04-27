import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "31f78YbyCp5zx6KPPxWjY96rKcNyAq3tii47C6B5RLkcvBpWTQc1Wa4fFEMrntEVMmVSh6eD1bt9mGKTUiZjrZGQ";
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  console.log("Pre token balances:", JSON.stringify(tx!.meta!.preTokenBalances, null, 2));
}
run();
