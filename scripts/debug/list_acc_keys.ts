import { Connection, PublicKey } from "@solana/web3.js";
import { getEncryptedUserAccountDecoder } from "@umbra-privacy/umbra-codama";
import { sha256 } from "@noble/hashes/sha256";
import { getProgramDerivedAddress, getAddressEncoder } from "@solana/kit";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const UMBRA_PROGRAM = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";
  const encoder = getAddressEncoder();
  const seed = sha256(new TextEncoder().encode("EncryptedUserAccount"));
  const depositor = "CcPon7vdaB7hi812ZM9Sao1Vtv6haYaA8GPnLNNuPM6e"; 
  const [pda] = await getProgramDerivedAddress({
     programAddress: UMBRA_PROGRAM as any,
     seeds: [seed, encoder.encode(depositor as any)]
  });
  const info = await connection.getAccountInfo(new PublicKey(pda));
  const userAccDecoder = getEncryptedUserAccountDecoder();
  const decodedAcc = userAccDecoder.decode(new Uint8Array(info!.data));
  console.log("Keys:", Object.keys(decodedAcc));
}
run();
