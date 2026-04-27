import { Connection } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  // Find the last withdrawal transaction we attempted to track it down.
  // We'll just look at the program ID that handles withdrawals: DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ
  const sigs = await connection.getSignaturesForAddress(
    new (await import("@solana/web3.js")).PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ"),
    { limit: 5 }
  );
  
  for (const s of sigs) {
    console.log(`Sig: ${s.signature}, Err: ${JSON.stringify(s.err)}`);
  }
}
run();
