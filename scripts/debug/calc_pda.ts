import { PublicKey } from "@solana/web3.js";
import { sha256 } from "@noble/hashes/sha256";

const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");

async function run() {
  const address = new PublicKey("CaGuv8Hzsvu9DfBo71wAPrsvaHTXkyV7QtkF69HZndeL");
  const seed = sha256(new TextEncoder().encode("EncryptedUserAccount"));
  const pda = PublicKey.findProgramAddressSync([seed, address.toBuffer()], UMBRA_PROGRAM_ID)[0];
  console.log("Calculated PDA:", pda.toBase58());
}
run();
