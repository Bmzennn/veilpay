import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "2A4oesB5NuQqv2ituDNdfrRLTSbq57LLPoZXKTuNfY8hhLGNnjj9DuCJNm3QQonC9URQhpTXzdbhUo4XtcAeccig";
  const tx = await connection.getTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const keys = tx!.transaction.message.getAccountKeys();
  const innerList = tx!.meta!.innerInstructions;
  for (const inner of innerList!) {
    console.log("Inner for parent index:", inner.index);
    for (const ix of inner.instructions) {
      const prog = keys.get(ix.programIdIndex)?.toBase58();
      const accKeys = ix.accounts.map(a => keys.get(a)?.toBase58());
      console.log(`  Program: ${prog} Accounts: ${accKeys.join(", ")}`);
    }
  }
}
run();
