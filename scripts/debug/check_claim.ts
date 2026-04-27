import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sigs = await connection.getSignaturesForAddress(
    new (await import("@solana/web3.js")).PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ"),
    { limit: 20 }
  );
  
  for (const s of sigs) {
    if (s.err) {
      console.log(`Sig: ${s.signature}, Err: ${JSON.stringify(s.err)}`);
    } else {
      console.log(`Sig: ${s.signature}, SUCCESS`);
    }
  }
}
run();
