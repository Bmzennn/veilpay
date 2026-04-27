import { Connection, PublicKey } from "@solana/web3.js";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "3r2iyKYBGagy88NJB359LT5F8KxQrNUhAxcMWF1CaDfETAnhmepbRNTuVr9obGWY2MLgmvSKpw7R7YBn79c5LNzP";
  
  console.log("Fetching Transaction:", sig);
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  
  if (!tx) {
    console.error("Transaction not found on Devnet!");
    return;
  }

  console.log("Transaction Version:", tx.version);
  console.log("Number of instructions:", tx.transaction.message.instructions.length);
  
  for (let i = 0; i < tx.transaction.message.instructions.length; i++) {
    const ix = tx.transaction.message.instructions[i];
    console.log(`Instruction ${i}:`, ix.programId.toBase58());
    if ("parsed" in ix) {
        console.log(`  Parsed:`, JSON.stringify(ix.parsed, null, 2));
    } else {
        console.log(`  Data snippet:`, (ix as any).data?.slice(0, 30));
    }
  }
}
run();
