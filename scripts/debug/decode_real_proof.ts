import { Connection, PublicKey } from "@solana/web3.js";
import { getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder } from "@umbra-privacy/umbra-codama";
import bs58 from "bs58";

const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const sig = "2aHU928nCb1nWXNZNCPAwXj9PfaCueBJRi8VMhftxzwAQitQ8caWJs1o1pmZdGYxeWJbTE6NTr8vjJ6cTxmnr16k";
  
  const b58 = (bs58 as any).default || bs58;
  const tx = await connection.getParsedTransaction(sig, { maxSupportedTransactionVersion: 0 });
  const ix = tx!.transaction.message.instructions[0];
  const data = b58.decode((ix as any).data);
  
  const decoder = getCreatePublicStealthPoolDepositInputBufferInstructionDataDecoder();
  const decoded = decoder.decode(data);
  console.log("Decoded Fields:", Object.keys(decoded));
  console.log("AES Data Length:", decoded.aesEncryptedData.first.length);
}
run();
