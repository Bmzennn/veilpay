import { Connection, PublicKey } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder, fetchEncryptedUserAccount } from "@umbra-privacy/umbra-codama";
import { getAesDecryptor } from "@umbra-privacy/sdk";
import * as ed25519_js from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import bs58 from "bs58";
import { findEncryptedUserAccountPda } from "@umbra-privacy/sdk";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const proofSig = "3naSiZVQUMqskhQ2gd8WjycBLGmhmMkmwscVCUNs8BSBDKFiRm2pRZaBpxXYmQjf3YFmYGCva34tkeRBwyJfb5Po";
  const proofTx = await connection.getTransaction(proofSig, { maxSupportedTransactionVersion: 0 });
  const UMBRA_PROGRAM = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";
  
  const keys1 = proofTx!.transaction.message.getAccountKeys();
  let proofIxData: Uint8Array | null = null;
  for (const ix of proofTx!.transaction.message.compiledInstructions) {
    if (keys1.get(ix.programIdIndex)?.toBase58() === UMBRA_PROGRAM) {
      proofIxData = ix.data;
      break;
    }
  }
  
  const proofDecoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
  const proofDecoded = proofDecoder.decode(proofIxData!);
  const aesEncryptedData = proofDecoded.aesEncryptedData.first;
  
  // depositor: CcPon7vdaB7hi812ZM9Sao1Vtv6haYaA8GPnLNNuPM6e
  const depositor = new PublicKey("CcPon7vdaB7hi812ZM9Sao1Vtv6haYaA8GPnLNNuPM6e");
  const depositorPda = findEncryptedUserAccountPda(
      UMBRA_PROGRAM,
      depositor.toBase58()
  );
  
  // Custom fetch function or use umbra-codama
  const rpc = {
     getAccountInfo: async (pubkey: any) => {
         const info = await connection.getAccountInfo(new PublicKey(pubkey));
         if (!info) return null;
         return { data: new Uint8Array(info.data), executable: info.executable, owner: info.owner.toBase58(), lamports: BigInt(info.lamports) };
     }
  };
  const depositorAccount = await fetchEncryptedUserAccount(rpc, depositorPda);
  
  console.log("Depositor X25519 Pubkey:", depositorAccount.data.userAccountX25519Key.first);
  
  // To decrypt, we need the server's private key. In this transaction, it was sent to the ephemeral wallet!
  // The sender's ephemeral private key is:
  // "4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK"
  // Wait, no. The ephemeral private key was the DESTINATION of the deposit!
  // Let's decode it using the ephemeral private key!
  const ephemeralPrivateKeyStr = "3zM81g6r1m7N421k3R9873A5sR5Fz3T8h232xX9kQWc5"; // Let's pretend I know it. Actually, I don't know the private key for this transaction.
  // But wait, the ECDH works from either side! 
  // aesSharedSecret = ed25519_js.x25519.getSharedSecret(serverPrivateKey, depositorX25519PublicKey)
}
run();
