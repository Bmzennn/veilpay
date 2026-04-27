import { Connection } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder, getDepositIntoStealthPoolFromPublicBalanceInstructionDataDecoder } from "@umbra-privacy/umbra-codama";
import bs58 from "bs58";
// Use the SDK for decryption
import { getAesDecryptor } from "@umbra-privacy/sdk";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const proofSig = "3naSiZVQUMqskhQ2gd8WjycBLGmhmMkmwscVCUNs8BSBDKFiRm2pRZaBpxXYmQjf3YFmYGCva34tkeRBwyJfb5Po";
  const depositSig = "2xrKhPQtmH8hZci9GWPxT13DFYnmn9QQ5KMCB6pgxjDjfjBW4mKFCMXff6ZwB17qBjZWoeKhd41WyA7cKhC8MGC5";
  
  const proofTx = await connection.getTransaction(proofSig, { maxSupportedTransactionVersion: 0 });
  const depositTx = await connection.getTransaction(depositSig, { maxSupportedTransactionVersion: 0 });
  
  const UMBRA_PROGRAM = "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ";
  
  // Find proof ix
  const keys1 = proofTx!.transaction.message.getAccountKeys();
  let proofIxData: Uint8Array | null = null;
  for (const ix of proofTx!.transaction.message.compiledInstructions) {
    if (keys1.get(ix.programIdIndex)?.toBase58() === UMBRA_PROGRAM) {
      proofIxData = ix.data;
      break;
    }
  }
  
  // Decode proof data
  const proofDecoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
  const proofDecoded = proofDecoder.decode(proofIxData!);
  console.log("Proof offset:", proofDecoded.offset);
  console.log("Optional data:", proofDecoded.optionalData.first);
  
  // Find deposit ix
  const keys2 = depositTx!.transaction.message.getAccountKeys();
  let depositIxData: Uint8Array | null = null;
  let depositorIndex = -1;
  for (const ix of depositTx!.transaction.message.compiledInstructions) {
    if (keys2.get(ix.programIdIndex)?.toBase58() === UMBRA_PROGRAM) {
      depositIxData = ix.data;
      // depositor is index 1 of the accounts list for DepositIntoStealthPoolFromPublicBalance
      depositorIndex = ix.accountKeyIndexes[1];
      break;
    }
  }
  
  const depositDecoder = getDepositIntoStealthPoolFromPublicBalanceInstructionDataDecoder();
  const depositDecoded = depositDecoder.decode(depositIxData!);
  console.log("Deposit buffer offset:", depositDecoded.publicStealthPoolDepositInputBufferOffset);
  console.log("Transfer amount:", depositDecoded.transferAmount.first);
  console.log("Depositor account:", keys2.get(depositorIndex)?.toBase58());
}
run();
