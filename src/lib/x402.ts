import { Connection, PublicKey } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder, getDepositIntoStealthPoolFromPublicBalanceInstructionDataDecoder, getEncryptedUserAccountDecoder } from "@umbra-privacy/umbra-codama";
import { getAesDecryptor } from "@umbra-privacy/sdk";
import { x25519 } from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import bs58 from "bs58";

const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");

export interface VerifyX402Params {
  connection: Connection;
  proofTxSignature: string;
  depositTxSignature: string;
  serverPrivateKeyBase58: string; // The Server's X25519 Private Key
  serverSolanaAddress: string;    // The Server's registered Solana Address
  expectedAmountRaw: bigint;
  expectedInvoiceId: Uint8Array;  // 32 bytes
}

export async function verifyX402Deposit(params: VerifyX402Params): Promise<boolean> {
  try {
    const {
      connection,
      proofTxSignature,
      depositTxSignature,
      serverPrivateKeyBase58,
      serverSolanaAddress,
      expectedAmountRaw,
      expectedInvoiceId
    } = params;

    // 1. Fetch both transactions
    const proofTx = await connection.getTransaction(proofTxSignature, { maxSupportedTransactionVersion: 0 });
    const depositTx = await connection.getTransaction(depositTxSignature, { maxSupportedTransactionVersion: 0 });

    if (!proofTx || proofTx.meta?.err) throw new Error("Proof transaction invalid or failed");
    if (!depositTx || depositTx.meta?.err) throw new Error("Deposit transaction invalid or failed");

    // 2. Find and decode the Proof Instruction to extract AES Data & Optional Data (Invoice ID)
    const proofKeys = proofTx.transaction.message.getAccountKeys();
    const proofDecoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
    
    let aesEncryptedData: any = null;
    let optionalData: any = null;

    for (const ix of proofTx.transaction.message.compiledInstructions) {
      if (proofKeys.get(ix.programIdIndex)?.toBase58() === UMBRA_PROGRAM_ID.toBase58()) {
        try {
          const decoded = proofDecoder.decode(ix.data);
          aesEncryptedData = decoded.aesEncryptedData.first;
          optionalData = decoded.optionalData.first;
          break;
        } catch (e) {
          // Not the proof instruction
        }
      }
    }

    if (!aesEncryptedData || !optionalData) throw new Error("Could not find Umbra Proof Instruction");

    // 3. Verify Invoice ID
    if (!Buffer.from(optionalData).equals(Buffer.from(expectedInvoiceId))) {
      console.error("Invoice ID mismatch!");
      return false;
    }

    // 4. Find the Depositor in the Deposit Transaction
    const depositKeys = depositTx.transaction.message.getAccountKeys();
    const depositDecoder = getDepositIntoStealthPoolFromPublicBalanceInstructionDataDecoder();
    
    let depositorPubKey: PublicKey | null = null;

    for (const ix of depositTx.transaction.message.compiledInstructions) {
      if (depositKeys.get(ix.programIdIndex)?.toBase58() === UMBRA_PROGRAM_ID.toBase58()) {
        try {
          depositDecoder.decode(ix.data);
          // Account Index 1 is the Depositor
          depositorPubKey = depositKeys.get(ix.accountKeyIndexes[1]) || null;
          break;
        } catch (e) {
          // Not the deposit instruction
        }
      }
    }

    if (!depositorPubKey) throw new Error("Could not find Umbra Deposit Instruction or Depositor");

    // 5. Fetch Depositor's Encrypted User Account to get their X25519 Public Key
    const seed = sha256(new TextEncoder().encode("EncryptedUserAccount"));
    const pda = PublicKey.findProgramAddressSync([seed, depositorPubKey.toBuffer()], UMBRA_PROGRAM_ID)[0];
    
    const accInfo = await connection.getAccountInfo(pda);
    if (!accInfo) throw new Error("Depositor is not registered with Umbra");

    const userAccDecoder = getEncryptedUserAccountDecoder();
    const decodedAcc = userAccDecoder.decode(new Uint8Array(accInfo.data));
    
    // The sender's token encryption public key is used for the ECDH exchange
    const depositorX25519PubKey = (decodedAcc as any).x25519PublicKeyForTokenEncryption.first;

    // 6. Derive AES-256-GCM Shared Secret
    const serverPrivKey = bs58.decode(serverPrivateKeyBase58);
    const sharedSecret = x25519.getSharedSecret(
      serverPrivKey.length === 32 ? serverPrivKey : serverPrivKey.slice(0, 32),
      depositorX25519PubKey as any
    );
    const aesKey = keccak_256(sharedSecret).slice(0, 32);

    // 7. Decrypt the payload
    const decryptor = getAesDecryptor();
    const plaintext = await decryptor(aesKey as any, aesEncryptedData);

    // 8. Verify the decrypted payload
    // Plaintext layout:
    // [0..8]: Amount (Little-Endian U64)
    // [8..40]: Destination Address (32 bytes)
    
    // Read Amount
    const amountBytes = plaintext.slice(0, 8);
    let decryptedAmount = 0n;
    for (let i = 7; i >= 0; i--) {
      decryptedAmount = (decryptedAmount << 8n) | BigInt(amountBytes[i]);
    }

    if (decryptedAmount < expectedAmountRaw) {
      console.error(`Amount mismatch: expected ${expectedAmountRaw}, got ${decryptedAmount}`);
      return false;
    }

    // Read Destination Address
    const destBytes = plaintext.slice(8, 40);
    const destAddress = new PublicKey(destBytes).toBase58();

    if (destAddress !== serverSolanaAddress) {
      console.error(`Destination mismatch: expected ${serverSolanaAddress}, got ${destAddress}`);
      return false;
    }

    return true;

  } catch (error) {
    console.error("X402 Verification Failed:", error);
    return false;
  }
}
