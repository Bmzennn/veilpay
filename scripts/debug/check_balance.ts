import { Connection, PublicKey } from "@solana/web3.js";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const secret = bs58.decode("4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK");
  const kp = Keypair.fromSeed(secret.slice(0, 32));
  const bal = await connection.getBalance(kp.publicKey);
  console.log("Balance:", bal / 1e9);
}
run();
