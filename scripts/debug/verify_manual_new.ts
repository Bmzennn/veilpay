import { Connection, PublicKey } from "@solana/web3.js";
import { verifyX402Deposit } from "../../src/lib/x402";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  
  const proofSig = "2aHU928nCb1nWXNZNCPAwXj9PfaCueBJRi8VMhftxzwAQitQ8caWJs1o1pmZdGYxeWJbTE6NTr8vjJ6cTxmnr16k";
  const depositSig = "5u4QW1Y4BgJhNudrKHmzjMX4x7x6taJGYG1vmgrS6muy5vLweVwQ66vhCc8dPJajD4RsRSovCcMYBLY8a737Rzxn";
  const invoiceIdHex = "2edc26cffc038af244e8584cfe3d91cf8df13d77b41f025a8a31c3363b09e5e3";
  
  const SERVER_PRIVATE_KEY_BASE58 = process.env.X402_SERVER_PRIVATE_KEY || "";
  const SERVER_SOLANA_ADDRESS = process.env.NEXT_PUBLIC_X402_SERVER_ADDRESS || "";
  const EXPECTED_AMOUNT_RAW = BigInt(0.1 * 1e9);

  console.log("Starting manual verification for proof:", proofSig.slice(0, 8));

  try {
    const isValid = await verifyX402Deposit({
      connection,
      proofTxSignature: proofSig,
      depositTxSignature: depositSig,
      serverPrivateKeyBase58: SERVER_PRIVATE_KEY_BASE58,
      serverSolanaAddress: SERVER_SOLANA_ADDRESS,
      expectedAmountRaw: EXPECTED_AMOUNT_RAW,
      expectedInvoiceId: new Uint8Array(Buffer.from(invoiceIdHex, "hex")),
    });
    
    console.log("Manual Verification Result:", isValid);
  } catch (e) {
    console.error("Manual Verification Crashed:", e);
  }
}
run();
