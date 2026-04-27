import { Connection, PublicKey } from "@solana/web3.js";
import { getEncryptedUserAccountDecoder } from "@umbra-privacy/umbra-codama";
import { sha256 } from "@noble/hashes/sha256";

const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const address = new PublicKey("3uv92PZpiUukiroGamD2KCnGSyC1wgFYsQZxr6ZwgfUz");
  
  const seed = sha256(new TextEncoder().encode("EncryptedUserAccount"));
  const pda = PublicKey.findProgramAddressSync([seed, address.toBuffer()], UMBRA_PROGRAM_ID)[0];
  const accInfo = await connection.getAccountInfo(pda);
  
  const decoder = getEncryptedUserAccountDecoder();
  const decoded: any = decoder.decode(new Uint8Array(accInfo!.data));
  
  const tokenKey = decoded.x25519PublicKeyForTokenEncryption.first;
  console.log("On-Chain Token X25519 PubKey (hex):", Buffer.from(tokenKey).toString("hex"));
}
run();
