import { Connection, PublicKey } from "@solana/web3.js";
import { 
  getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder, 
  getDepositIntoStealthPoolFromPublicBalanceInstructionDataDecoder,
  getEncryptedUserAccountDecoder 
} from "@umbra-privacy/umbra-codama";
import { getAesDecryptor } from "@umbra-privacy/sdk";
import { x25519 } from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import bs58 from "bs58";

const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "3r2iyKYBGagy88NJB359LT5F8KxQrNUhAxcMWF1CaDfETAnhmepbRNTuVr9obGWY2MLgmvSKpw7R7YBn79c5LNzP";
  const serverPrivateKeyBase58 = "4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK";

  const b58 = (bs58 as any).default || bs58;
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  
  const proofDecoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
  const depositDecoder = getDepositIntoStealthPoolFromPublicBalanceInstructionDataDecoder();

  let aesEncryptedData: any = null;
  let optionalData: any = null;
  let depositorPubKey: PublicKey | null = null;

  for (const ix of tx!.transaction.message.instructions) {
    if (ix.programId.toBase58() === UMBRA_PROGRAM_ID.toBase58()) {
      const data = b58.decode((ix as any).data);
      console.log("Decoding Umbra Ix...");
      
      try {
        const decoded = proofDecoder.decode(data);
        console.log("Matches Proof Decoder!");
        aesEncryptedData = decoded.aesEncryptedData.first;
        optionalData = decoded.optionalData.first;
      } catch (e) {
        console.log("Does not match Proof Decoder.");
      }

      try {
        const decoded = depositDecoder.decode(data);
        console.log("Matches Deposit Decoder!");
        // If it matches deposit, we need to find the depositor
        // In DirectDeposit, it might have the AES data too?
        console.log("Deposit keys:", Object.keys(decoded));
      } catch (e) {
        console.log("Does not match Deposit Decoder.");
      }
    }
  }
}
run();
