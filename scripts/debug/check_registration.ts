import { Connection, PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";
import { getProgramDerivedAddress, getAddressEncoder } from "@solana/kit";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const UMBRA_PROGRAM = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";
  const address = "3uv92PZpiUukiroGamD2KCnGSyC1wgFYsQZxr6ZwgfUz";
  
  const encoder = getAddressEncoder();
  const seed = sha256(new TextEncoder().encode("EncryptedUserAccount"));
  const [pda] = await getProgramDerivedAddress({
     programAddress: UMBRA_PROGRAM as any,
     seeds: [seed, encoder.encode(address as any)]
  });
  
  console.log("Checking address:", address);
  console.log("PDA:", pda);
  const info = await connection.getAccountInfo(new PublicKey(pda));
  if (!info) {
    console.log("STATUS: NOT REGISTERED");
  } else {
    console.log("STATUS: REGISTERED");
  }
}
run();
