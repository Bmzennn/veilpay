import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const depositSig = "2xrKhPQtmH8hZci9GWPxT13DFYnmn9QQ5KMCB6pgxjDjfjBW4mKFCMXff6ZwB17qBjZWoeKhd41WyA7cKhC8MGC5";
  const tx = await connection.getParsedTransaction(depositSig, { maxSupportedTransactionVersion: 0 });
  const depositor = tx!.transaction.message.accountKeys.find(k => k.signer)?.pubkey;
  console.log("Depositor:", depositor?.toBase58());
  
  if (depositor) {
    const sigs = await connection.getSignaturesForAddress(depositor, { limit: 10 });
    for (const s of sigs) {
       console.log("Sig for depositor:", s.signature);
       const t2 = await connection.getParsedTransaction(s.signature, { maxSupportedTransactionVersion: 0 });
       if (t2?.meta?.logMessages?.some(l => l.includes("CreatePublicStealthPoolDepositInputBuffer"))) {
           console.log("Found proof creation:", s.signature);
       }
    }
  }
}
run();
