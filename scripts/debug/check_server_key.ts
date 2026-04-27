import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const priv = "4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK";
try {
  const kp = Keypair.fromSecretKey(bs58.decode(priv));
  console.log("Derived Address:", kp.publicKey.toBase58());
} catch (e) {
  console.log("Not a valid secret key:", e.message);
  const seed = bs58.decode(priv);
  if (seed.length === 32) {
    const kp = Keypair.fromSeed(seed);
    console.log("Derived Address from seed:", kp.publicKey.toBase58());
  }
}
