import { Connection, PublicKey } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder, fetchEncryptedUserAccount } from "@umbra-privacy/umbra-codama";
import * as ed25519_js from "@noble/curves/ed25519";
import { keccak_256 } from "@noble/hashes/sha3";
import bs58 from "bs58";

// we can manually do findEncryptedUserAccountPda
import { getProgramDerivedAddress, getAddressEncoder } from "@solana/kit";

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
  
  const encoder = getAddressEncoder();
  const [pda] = await getProgramDerivedAddress({
     programAddress: UMBRA_PROGRAM as any,
     seeds: [new TextEncoder().encode("EncryptedUserAccount"), encoder.encode("CcPon7vdaB7hi812ZM9Sao1Vtv6haYaA8GPnLNNuPM6e" as any)]
  });
  
  const rpc = {
     getAccountInfo: async (pubkey: any) => {
         const info = await connection.getAccountInfo(new PublicKey(pubkey));
         if (!info) return null;
         return { data: new Uint8Array(info.data), executable: info.executable, owner: info.owner.toBase58(), lamports: BigInt(info.lamports) };
     }
  };
  const depositorAccount = await fetchEncryptedUserAccount(rpc as any, pda);
  console.log("Depositor X25519 Pubkey:", bs58.encode(depositorAccount.data.userAccountX25519Key.first));
}
run();
