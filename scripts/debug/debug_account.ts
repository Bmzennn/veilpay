import { Connection, PublicKey } from "@solana/web3.js";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const pubkey = new PublicKey("4zN3BjSnmECW3LJDBDQmiMLjuNbEwRdCewM6UiDX7jK");
  const info = await connection.getAccountInfo(pubkey);
  console.log("Owner:", info?.owner.toBase58());
  console.log("Size:", info?.data.length);
  console.log("Lamports:", info?.lamports);
  const rent = await connection.getMinimumBalanceForRentExemption(info?.data.length || 0);
  console.log("Rent exempt min:", rent);
  console.log("Available to transfer:", (info?.lamports || 0) - rent);
}
run();
