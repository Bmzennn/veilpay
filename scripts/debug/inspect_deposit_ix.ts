import { Connection, PublicKey } from "@solana/web3.js";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "5u4QW1Y4BgJhNudrKHmzjMX4x7x6taJGYG1vmgrS6muy5vLweVwQ66vhCc8dPJajD4RsRSovCcMYBLY8a737Rzxn";
  
  console.log("Inspecting Deposit TX:", sig);
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  
  for (const ix of tx!.transaction.message.instructions) {
      console.log("Program:", ix.programId.toBase58());
      if ("accounts" in ix) {
          console.log("Accounts:", (ix as any).accounts.map((a: any, i: number) => `${i}: ${a.toBase58()}`));
      }
  }
}
run();
