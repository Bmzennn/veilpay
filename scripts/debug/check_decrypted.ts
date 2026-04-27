import { Connection, PublicKey } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder, getEncryptedUserAccountDecoder } from "@umbra-privacy/umbra-codama";
import { getAesDecryptor } from "@umbra-privacy/sdk";
import { x25519 } from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import bs58 from "bs58";

const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const proofTxSignature = "3r2iyKYBGagy88NJB359LT5F8KxQrNUhAxcMWF1CaDfETAnhmepbRNTuVr9obGWY2MLgmvSKpw7R7YBn79c5LNzP";
  const serverPrivateKeyBase58 = "4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK";

  console.log("Fetching Transaction...");
  const b58 = (bs58 as any).default || bs58;
  const proofTx = await connection.getParsedTransaction(proofTxSignature, { maxSupportedTransactionVersion: 0 });
  
  if (!proofTx) {
    console.error("Transaction not found!");
    return;
  }

  const proofDecoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
  let aesEncryptedData: any = null;
  let depositorPubKey: PublicKey | null = null;

  for (const ix of proofTx.transaction.message.instructions) {
    if ("programId" in ix && ix.programId.toBase58() === UMBRA_PROGRAM_ID.toBase58()) {
      try {
        const data = b58.decode((ix as any).data);
        const decoded = proofDecoder.decode(data);
        aesEncryptedData = decoded.aesEncryptedData.first;
        // In Umbra instruction, accounts[1] is the user account PDA, but we need the actual signer
        // Actually, the signer of the transaction is the depositor
        depositorPubKey = new PublicKey(proofTx.transaction.message.accountKeys[0].pubkey);
        console.log("Detected Depositor:", depositorPubKey.toBase58());
        break;
      } catch (e) {}
    }
  }

  if (!aesEncryptedData || !depositorPubKey) {
    console.error("Umbra instruction or depositor not found!");
    return;
  }

  console.log("Fetching User Account Info...");
  const seed = sha256(new TextEncoder().encode("EncryptedUserAccount"));
  const pda = PublicKey.findProgramAddressSync([seed, depositorPubKey.toBuffer()], UMBRA_PROGRAM_ID)[0];
  const accInfo = await connection.getAccountInfo(pda);
  
  if (!accInfo) {
    console.error("User Account PDA not found:", pda.toBase58());
    return;
  }

  console.log("Decoding User Account...");
  const userAccDecoder = getEncryptedUserAccountDecoder();
  const decodedAcc = userAccDecoder.decode(new Uint8Array(accInfo.data));
  const depositorX25519PubKey = (decodedAcc as any).x25519PublicKeyForTokenEncryption.first;

  console.log("Deriving Keys...");
  const serverPrivKey = b58.decode(serverPrivateKeyBase58);
  const sharedSecret = x25519.getSharedSecret(
    serverPrivKey.length === 32 ? serverPrivKey : serverPrivKey.slice(0, 32),
    depositorX25519PubKey as any
  );
  const aesKey = keccak_256(sharedSecret).slice(0, 32);

  console.log("Decrypting Payload...");
  const decryptor = getAesDecryptor();
  const plaintext = await decryptor(aesKey as any, aesEncryptedData);

  const amountBytes = plaintext.slice(0, 8);
  let decryptedAmount = 0n;
  for (let i = 7; i >= 0; i--) decryptedAmount = (decryptedAmount << 8n) | BigInt(amountBytes[i]);

  console.log("Decrypted Amount (Raw):", decryptedAmount);
  console.log("Decrypted Amount (SOL):", Number(decryptedAmount) / 1e9);
  
  const destBytes = plaintext.slice(8, 40);
  console.log("Decrypted Dest:", new PublicKey(destBytes).toBase58());
}
run();
