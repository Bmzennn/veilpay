import { Connection, PublicKey } from "@solana/web3.js";
import { getEncryptedUserAccountDecoder } from "@umbra-privacy/umbra-codama";
import * as ed25519_js from "@noble/curves/ed25519";
import { sha256 } from "@noble/hashes/sha256";
import bs58 from "bs58";
import { getProgramDerivedAddress, getAddressEncoder } from "@solana/kit";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const UMBRA_PROGRAM = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";
  
  const encoder = getAddressEncoder();
  const seed = sha256(new TextEncoder().encode("EncryptedUserAccount"));
  
  const depositor = "CcPon7vdaB7hi812ZM9Sao1Vtv6haYaA8GPnLNNuPM6e"; // User's main wallet used in the deposit tx
  const [pda] = await getProgramDerivedAddress({
     programAddress: UMBRA_PROGRAM as any,
     seeds: [seed, encoder.encode(depositor as any)]
  });
  
  console.log("Depositor PDA:", pda);
  const info = await connection.getAccountInfo(new PublicKey(pda));
  if (!info) {
     console.log("No account found!");
     return;
  }
  
  const userAccDecoder = getEncryptedUserAccountDecoder();
  const decodedAcc = userAccDecoder.decode(new Uint8Array(info!.data));
  console.log("X25519 Pubkey:", bs58.encode(decodedAcc.userAccountX25519Key.first));
}
run();
