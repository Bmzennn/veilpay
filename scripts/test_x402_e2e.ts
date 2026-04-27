import { x402Fetch } from "../src/lib/x402-client";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

// NOTE: You MUST replace this with the private key of a wallet that has at least 0.5 Devnet USDC and some Devnet SOL!
// This is the AI Agent's "funding wallet".
const AGENT_PRIVATE_KEY_BASE58 = process.env.AGENT_PRIVATE_KEY_BASE58 || "3Mswp1BqV2qLwH2F6kEwG4n5P7hH2vM3pL4wV1n3L7zC5tU2X1rJ2bX1qT1pK2bM3aV2cY3tK1pL1bH1nV1aG3z"; // DUMMY

async function run() {
  console.log("Starting e2e x402 test...");
  
  try {
    // We will hit the local development server's premium endpoint
    // Make sure `npm run dev` is running in another terminal window!
    const response = await x402Fetch("http://localhost:3000/api/premium-data", {
      method: "GET",
      agentPrivateKeyBase58: AGENT_PRIVATE_KEY_BASE58
    });

    console.log(`\nFinal Response Status: ${response.status}`);
    const data = await response.json();
    console.log("Response Body:", JSON.stringify(data, null, 2));

  } catch (e) {
    console.error("\nx402 Fetch failed:", e);
  }
}

run();
