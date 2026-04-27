import { Connection, PublicKey } from "@solana/web3.js";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "2aHU928nCb1nWXNZNCPAwXj9PfaCueBJRi8VMhftxzwAQitQ8caWJs1o1pmZdGYxeWJbTE6NTr8vjJ6cTxmnr16k";
  
  console.log("Fetching REAL Transaction:", sig);
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  
  if (!tx) {
    console.error("Transaction not found!");
    return;
  }

  for (let i = 0; i < tx.transaction.message.instructions.length; i++) {
    const ix = tx.transaction.message.instructions[i];
    console.log(`Instruction ${i}:`, ix.programId.toBase58());
  }
}
run();
