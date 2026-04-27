import { getAesDecryptor } from "@umbra-privacy/sdk";
import * as ed25519_js from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import bs58 from "bs58";
async function run() {
  const serverPrivKey = bs58.decode("4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK");
  const senderPubKey = new Uint8Array([
       15, 234, 103, 132, 125,  22, 106,  91,
      144,   1, 134, 148, 123, 178, 130, 190,
      163, 232, 123,  29,   9,  18,  70, 168,
      178,  37, 202,  50,  81,  35,   9,  75
  ]);
  const sharedSecret = ed25519_js.x25519.getSharedSecret(
     serverPrivKey.length === 32 ? serverPrivKey : serverPrivKey.slice(0,32), 
     senderPubKey
  );
  const aesKey = keccak_256(sharedSecret).slice(0, 32);
  const decryptor = getAesDecryptor();
  // We need aesEncryptedData from the proof transaction!
  const aesEncryptedData = new Uint8Array([
    // Let's assume it failed. I don't have the exact data from a live pair.
  ]);
  try {
    const pt = await decryptor(aesKey, aesEncryptedData);
    console.log("Plaintext length:", pt.length);
  } catch (e) {
    console.log("Failed decryption (expected):", e.message);
  }
}
run();
