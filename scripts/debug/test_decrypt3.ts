import { Connection, PublicKey } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder, getEncryptedUserAccountDecoder } from "@umbra-privacy/umbra-codama";
import * as ed25519_js from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import bs58 from "bs58";
import { getProgramDerivedAddress, getAddressEncoder } from "@solana/kit";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  const UMBRA_PROGRAM = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";
  const encoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
     programAddress: UMBRA_PROGRAM as any,
     seeds: [new TextEncoder().encode("EncryptedUserAccount"), encoder.encode("CcPon7vdaB7hi812ZM9Sao1Vtv6haYaA8GPnLNNuPM6e" as any)]
  });
  
  const info = await connection.getAccountInfo(new PublicKey(pda));
  const userAccDecoder = getEncryptedUserAccountDecoder();
  const decodedAcc = userAccDecoder.decode(new Uint8Array(info!.data));
  console.log("X25519:", bs58.encode(decodedAcc.userAccountX25519Key.first));
}
run();
