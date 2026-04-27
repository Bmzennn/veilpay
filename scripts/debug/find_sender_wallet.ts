import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  // Let's check a recent successful SOL transaction to get your main wallet pubkey
  const sigs = await connection.getSignaturesForAddress(
    new (await import("@solana/web3.js")).PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ"),
    { limit: 20 }
  );
  
  for (const s of sigs) {
    if (!s.err) {
      const tx = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
      const signers = tx!.transaction.message.accountKeys.filter(k => k.signer);
      for (const k of signers) {
         console.log("Found recent successful signer:", k.pubkey.toBase58());
      }
      break;
    }
  }
}
run();
