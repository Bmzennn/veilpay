import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { log, warn } from "./logger";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder, getEncryptedUserAccountDecoder } from "@umbra-privacy/umbra-codama";
import {
    getAesDecryptor,
    getUmbraClient,
    createSignerFromPrivateKeyBytes,
    getUserAccountX25519KeypairDeriver
} from "@umbra-privacy/sdk";
import { x25519 } from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import { sha256 } from "@noble/hashes/sha256";
import bs58 from "bs58";
import { getSupabaseServiceClient } from "./supabase";
import { NETWORK } from "./constants";

const UMBRA_PROGRAM_IDS = {
  mainnet: "UMBRAD2ishebJTcgCLkTkNUx1v3GyoAgpTRPeWoLykh",
  devnet:  "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ",
} as const;

const UMBRA_PROGRAM_ID = new PublicKey(
  UMBRA_PROGRAM_IDS[NETWORK as "mainnet" | "devnet"] ?? UMBRA_PROGRAM_IDS.devnet
);

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

    // 0. Replay Protection: Check if this signature has been used before
    const supabase = getSupabaseServiceClient();
    if (supabase) {
      const { data: existing } = await supabase
        .from("payments")
        .select("id")
        .eq("deposit_sig", depositTxSignature)
        .single();
      
      if (existing) {
        console.error(`[verifyX402Deposit] Replay Attempt! Signature ${depositTxSignature} already used.`);
        return false;
      }
    }

    // 1. Fetch both transactions (parsed to resolve ALTs)
    const proofTx = await connection.getParsedTransaction(proofTxSignature, { maxSupportedTransactionVersion: 0 });
    const depositTx = await connection.getParsedTransaction(depositTxSignature, { maxSupportedTransactionVersion: 0 });

    if (!proofTx || proofTx.meta?.err) throw new Error("Proof transaction invalid or failed");
    if (!depositTx || depositTx.meta?.err) throw new Error("Deposit transaction invalid or failed");

    // 2. Find and decode the Proof Instruction to extract AES Data & Optional Data (Invoice ID)
    const proofDecoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
    
    let aesEncryptedData: any = null;
    let optionalData: any = null;

    // Use parsed instructions to avoid manual ALT resolution
    const proofIxs = proofTx.transaction.message.instructions;

    for (const ix of proofIxs) {
      if ("programId" in ix && ix.programId.toBase58() === UMBRA_PROGRAM_ID.toBase58()) {
        try {
          // In parsed instructions, data is base58 encoded string
          const b58 = (bs58 as any).default || bs58;
          const data = b58.decode((ix as any).data);
          const decoded = proofDecoder.decode(data);
          aesEncryptedData = decoded.aesEncryptedData.first;
          optionalData = decoded.optionalData.first;
          log("[verifyX402Deposit] Found Umbra Proof Instruction");
          break;
        } catch (e) {
          // Not the proof instruction
        }
      }
    }

    if (!aesEncryptedData || !optionalData) throw new Error("Could not find Umbra Proof Instruction");

    // 3. Verify Invoice ID
    if (!Buffer.from(optionalData).equals(Buffer.from(expectedInvoiceId))) {
      console.error("[verifyX402Deposit] Invoice ID mismatch!");
      console.error("Expected:", Buffer.from(expectedInvoiceId).toString("hex"));
      console.error("Got:", Buffer.from(optionalData).toString("hex"));
      return false;
    }

    // 4. Identify the Depositor (the first signer of the transaction)
    const depositorPubKey = proofTx.transaction.message.accountKeys[0].pubkey;
    log("[verifyX402Deposit] Detected Depositor Signer:", depositorPubKey.toBase58());

    // 5. Calculate and Fetch Depositor's Umbra Account PDA
    const seed = sha256(new TextEncoder().encode("EncryptedUserAccount"));
    const pda = PublicKey.findProgramAddressSync([seed, depositorPubKey.toBuffer()], UMBRA_PROGRAM_ID)[0];

    const accInfo = await connection.getAccountInfo(pda);
    if (!accInfo) throw new Error(`Depositor Umbra Account not found for ${depositorPubKey.toBase58()}`);

    const userAccDecoder = getEncryptedUserAccountDecoder();
    const decodedAcc: any = userAccDecoder.decode(new Uint8Array(accInfo.data));

    // The sender's token encryption public key is used for the ECDH exchange
    const depositorX25519PubKey = decodedAcc.x25519PublicKeyForTokenEncryption.first;
    log("[verifyX402Deposit] Retrieved Depositor X25519 Pubkey from calculated PDA");
    // 6. Derive AES-256-GCM Shared Secret using Server's Derived Private Key + Depositor's Public Key
    const b58 = (bs58 as any).default || bs58;
    const serverPrivKey = b58.decode(serverPrivateKeyBase58);
    const serverKeypair = Keypair.fromSecretKey(serverPrivKey);

    // Initialize Umbra client to use its built-in deriver logic
    const dummySigner = await createSignerFromPrivateKeyBytes(serverKeypair.secretKey);
    const client = await getUmbraClient({
        signer: dummySigner,
        network: NETWORK as "mainnet" | "devnet",
        rpcUrl: connection.rpcEndpoint,
        rpcSubscriptionsUrl: connection.rpcEndpoint.replace(/^http/, "ws"),
        deferMasterSeedSignature: true,
    });

    const deriver = getUserAccountX25519KeypairDeriver({ client });
    const keys: any = await deriver();
    const actualServerX25519PrivKey = keys.x25519Keypair.privateKey;

    const sharedSecret = x25519.getSharedSecret(
      actualServerX25519PrivKey,
      depositorX25519PubKey as any
    );
    const aesKey = keccak_256(sharedSecret).slice(0, 32);
    log("[verifyX402Deposit] Derived shared secret and AES key");

    // 7. Decrypt the payload
    // Note: Umbra SDK's getAesDecryptor expects [nonce(12)][ciphertext][tag(16)]
    const decryptor = getAesDecryptor();
    const plaintext = await decryptor(aesKey as any, aesEncryptedData);
    log("[verifyX402Deposit] Decrypted proof payload");

    // 8. Verify the decrypted payload
    // Plaintext layout for CreateReceiverClaimableUtxoFromPublicBalance:
    // [0..8]: Amount (Little-Endian U64)
    // [8..40]: Destination Address (32 bytes)
    // [40..56]: Generation Index (16 bytes)
    // [56..68]: Domain Separator (12 bytes)

    const amountBytes = plaintext.slice(0, 8);
    let decryptedAmount = 0n;
    for (let i = 7; i >= 0; i--) {
      decryptedAmount = (decryptedAmount << 8n) | BigInt(amountBytes[i]);
    }

    if (decryptedAmount < expectedAmountRaw) {
      console.error(`[verifyX402Deposit] Amount mismatch: expected ${expectedAmountRaw}, got ${decryptedAmount}`);
      return false;
    }

    const destBytes = plaintext.slice(8, 40);
    const destAddress = new PublicKey(destBytes).toBase58();

    if (destAddress !== serverSolanaAddress) {
      console.error(`[verifyX402Deposit] Destination mismatch: expected ${serverSolanaAddress}, got ${destAddress}`);
      return false;
    }

    log(`[verifyX402Deposit] ✅ Successfully verified payment of ${decryptedAmount} for ${destAddress}`);
    
    // Record successful payment to prevent replay
    if (supabase) {
      await supabase.from("payments").insert({
        deposit_sig: depositTxSignature,
        proof_sig: proofTxSignature,
        invoice_id: Buffer.from(expectedInvoiceId).toString("hex"),
        amount: Number(decryptedAmount) / 1e9,
        recipient: destAddress,
        verified_at: new Date().toISOString()
      });
    }

    return true;

  } catch (error) {
    console.error("X402 Verification Failed:", error);
    return false;
  }
}
