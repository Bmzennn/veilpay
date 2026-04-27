import { Connection, PublicKey } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder } from "@umbra-privacy/umbra-codama";
import { getAesDecryptor } from "@umbra-privacy/sdk";
import { x25519 } from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import bs58 from "bs58";

const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "2aHU928nCb1nWXNZNCPAwXj9PfaCueBJRi8VMhftxzwAQitQ8caWJs1o1pmZdGYxeWJbTE6NTr8vjJ6cTxmnr16k";
  const serverPrivSeed = "600162d9c3a65612151ac42fdf5cb516b76f14ab434dd562d8ba6642ee8f3745"; // Real X25519 Priv
  
  const b58 = (bs58 as any).default || bs58;
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const ix = tx!.transaction.message.instructions[0];
  const decoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
  const decoded = decoder.decode(b58.decode((ix as any).data));
  const aesData = decoded.aesEncryptedData.first;

  const ephemeralPubKey = aesData.slice(0, 32);
  const encryptedPayload = aesData.slice(32); // This should be 64 bytes

  const sharedSecret = x25519.getSharedSecret(Buffer.from(serverPrivSeed, "hex"), ephemeralPubKey as any);
  const aesKey = keccak_256(sharedSecret).slice(0, 32);
  
  const decryptor = getAesDecryptor();
  
  console.log("Encrypted Payload Length:", encryptedPayload.length);
  
  try {
      const plaintext = await decryptor(aesKey as any, encryptedPayload);
      console.log("SUCCESS! Plaintext hex:", Buffer.from(plaintext).toString("hex"));
  } catch (e: any) {
      console.log("FAILED:", e.message);
  }
}
run();
