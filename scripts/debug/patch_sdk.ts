import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";

const mint = new PublicKey("So11111111111111111111111111111111111111112");
const dest = new PublicKey("6h5WpzyXtJkcicvARVLTFwJRcS4wSRHuLpZa86Fq4j7p");
console.log(getAssociatedTokenAddressSync(mint, dest, true).toBase58());
