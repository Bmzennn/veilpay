import { Connection, PublicKey } from "@solana/web3.js";
import { verifyX402Deposit } from "../../src/lib/x402";

async function run() {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const proofSig = "3r2iyKYBGagy88NJB359LT5F8KxQrNUhAxcMWF1CaDfETAnhmepbRNTuVr9obGWY2MLgmvSKpw7R7YBn79c5LNzP";
  const depositSig = "3r2iyKYBGagy88NJB359LT5F8KxQrNUhAxcMWF1CaDfETAnhmepbRNTuVr9obGWY2MLgmvSKpw7R7YBn79c5LNzP";
  const invoiceIdHex = "d8637f41c1c5ae436eac68fb6545f75313c3f64bb1bc4ed8cdfe4d41c40dacd1";
  
  // These must match your .env.local
  const SERVER_PRIVATE_KEY_BASE58 = "4rDxt8S9jF3J2Y5BwV9vW8a6Z8uG7yK5kXkMzC8qT9bK";
  const SERVER_SOLANA_ADDRESS = "3uv92PZpiUukiroGamD2KCnGSyC1wgFYsQZxr6ZwgfUz";
  const EXPECTED_AMOUNT_RAW = BigInt(0.1 * 1e9);

  const isValid = await verifyX402Deposit({
    connection,
    proofTxSignature: proofSig,
    depositTxSignature: depositSig,
    serverPrivateKeyBase58: SERVER_PRIVATE_KEY_BASE58,
    serverSolanaAddress: SERVER_SOLANA_ADDRESS,
    expectedAmountRaw: EXPECTED_AMOUNT_RAW,
    expectedInvoiceId: new Uint8Array(Buffer.from(invoiceIdHex, "hex")),
  });
  
  console.log("Is Valid:", isValid);
}
run();
