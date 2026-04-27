import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sigs = await connection.getSignaturesForAddress(
    new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ"),
    { limit: 20 }
  );
  
  for (const s of sigs) {
    if (!s.err) {
      const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
      const logs = tx?.meta?.logMessages;
      if (logs?.some(l => l.includes("CreatePublicStealthPoolDepositInputBuffer"))) {
         console.log("Found proof creation:", s.signature);
         return;
      }
      if (logs?.some(l => l.includes("DepositIntoStealthPoolFromPublicBalance"))) {
         console.log("Found deposit:", s.signature);
      }
    }
  }
}
run();
