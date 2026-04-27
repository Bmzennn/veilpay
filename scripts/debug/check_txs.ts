import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sigs = await connection.getSignaturesForAddress(
    new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ"),
    { limit: 5 }
  );
  
  for (const s of sigs) {
    if (s.err) {
      console.log(`Sig: ${s.signature}, Err: ${JSON.stringify(s.err)}`);
      const tx = await connection.getTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
      console.log("Logs:", tx?.meta?.logMessages?.filter(l => l.includes("Error") || l.includes("failed")));
    } else {
      console.log(`Sig: ${s.signature}, SUCCESS`);
    }
  }
}
run();
