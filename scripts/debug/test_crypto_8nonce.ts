import { x25519 } from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import { Connection, PublicKey } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder } from "@umbra-privacy/umbra-codama";
import bs58 from "bs58";

// Use subtle crypto directly
async function decrypt(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array) {
    const cryptoKey = await crypto.subtle.importKey(
        "raw",
        key,
        { name: "AES-GCM" },
        false,
        ["decrypt"]
    );
    return await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: nonce, tagLength: 128 }, // 16 * 8 = 128 bits
        cryptoKey,
        ciphertext
    );
}

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "2aHU928nCb1nWXNZNCPAwXj9PfaCueBJRi8VMhftxzwAQitQ8caWJs1o1pmZdGYxeWJbTE6NTr8vjJ6cTxmnr16k";
  const serverPrivSeed = "600162d9c3a65612151ac42fdf5cb516b76f14ab434dd562d8ba6642ee8f3745";
  
  const b58 = (bs58 as any).default || bs58;
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const ix = tx!.transaction.message.instructions[0];
  const decoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
  const decoded = decoder.decode(b58.decode((ix as any).data));
  const aesData = decoded.aesEncryptedData.first;

  const pub = aesData.slice(0, 32);
  const nonce = aesData.slice(32, 40); // 8 byte nonce?
  const ciphertext = aesData.slice(40); // 56 bytes (40 payload + 16 tag)

  const sharedSecret = x25519.getSharedSecret(Buffer.from(serverPrivSeed, "hex"), pub as any);
  const aesKey = keccak_256(sharedSecret).slice(0, 32);
  
  try {
      const plaintext = await decrypt(aesKey, nonce, ciphertext);
      console.log("SUCCESS with 8-byte nonce! Plaintext:", Buffer.from(plaintext).toString("hex"));
  } catch (e: any) {
      console.log("FAILED with 8-byte nonce:", e.message);
  }
}
run();
