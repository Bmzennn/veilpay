import { Connection, Keypair, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createAssociatedTokenAccountIdempotentInstruction } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const ephemeralKeypair = Keypair.generate();
  console.log("Generated:", ephemeralKeypair.publicKey.toBase58());
  const mint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
  
  const ata = getAssociatedTokenAddressSync(mint, ephemeralKeypair.publicKey, true);
  console.log("ATA:", ata.toBase58());
}
run();
