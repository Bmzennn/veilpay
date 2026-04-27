import { Connection, PublicKey } from "@solana/web3.js";
import { getMint } from "@solana/spl-token";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const mint = new PublicKey("4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU");
  const info = await getMint(connection, mint);
  console.log("Decimals for 4zMMC:", info.decimals);
  console.log("Supply:", info.supply);
}
run();
