import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "3r2iyKYBGagy88NJB359LT5F8KxQrNUhAxcMWF1CaDfETAnhmepbRNTuVr9obGWY2MLgmvSKpw7R7YBn79c5LNzP";
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const ixs = tx!.transaction.message.instructions;
  for (const ix of ixs) {
    console.log("Program:", ix.programId.toBase58());
    if ("data" in ix) {
       console.log("Data type:", typeof ix.data);
       console.log("Data snippet:", ix.data.slice(0, 20));
    }
  }
}
run();
