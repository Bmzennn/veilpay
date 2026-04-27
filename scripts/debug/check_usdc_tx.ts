import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "64H6n4nThegZWFkfAzqhKXwdWC8KkAzuHz6WHXX8YLQwb6wACBhQuF2dTD3i6fd4JfPMWLwZ97yxC7RS5UpvNzwJ";
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const pre = tx!.meta!.preTokenBalances;
  console.log("Pre token balances:", JSON.stringify(pre, null, 2));
}
run();
